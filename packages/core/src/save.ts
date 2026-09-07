import { assertCharacterSnapshot } from './character.js';
import { assertJSON, cloneJSON, type GameState, type JSONValue } from './types.js';

/** setItem must atomically replace one record or throw while leaving the old record intact. */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): string[];
}

export class MemorySaveStorage implements SaveStorage {
  private readonly items = new Map<string, string>();
  getItem(key: string): string | null { return this.items.get(key) ?? null; }
  setItem(key: string, value: string): void { this.items.set(key, value); }
  removeItem(key: string): void { this.items.delete(key); }
  keys(): string[] { return [...this.items.keys()]; }
}

/** Pass a Storage-compatible object for tests or use the browser's localStorage by default. */
export class LocalStorageSaveStorage implements SaveStorage {
  constructor(private readonly providedStorage?: Storage) {}
  // Access can throw a SecurityError in restricted browser contexts. Resolve only
  // during storage operations, where SaveStore can report a recoverable failure.
  private get storage(): Storage {
    const storage = this.providedStorage ?? globalThis.localStorage;
    if (!storage) throw new Error('localStorage is unavailable; provide a SaveStorage adapter');
    return storage;
  }
  getItem(key: string): string | null { return this.storage.getItem(key); }
  setItem(key: string, value: string): void { this.storage.setItem(key, value); }
  removeItem(key: string): void { this.storage.removeItem(key); }
  keys(): string[] {
    return Array.from({ length: this.storage.length }, (_, i) => this.storage.key(i)).filter((key): key is string => key !== null);
  }
}

export interface SaveStoreOptions<T extends GameState> {
  gameId: string;
  /** Positive content/schema version. A migration keyed N upgrades N to N+1. */
  version: number;
  storage: SaveStorage;
  migrations?: Record<number, (state: unknown) => unknown>;
  /** Optional game-specific assertions, e.g. known rooms, actor IDs, item IDs, and dialog state. Throw on failure. */
  validate?: (state: T) => void;
  now?: () => Date;
}

export interface SaveMetadata { slot: string; savedAt: string; version: number; gameId: string }
interface SaveEnvelope {
  format: 'pointlesh-save';
  formatVersion: 1;
  gameId: string;
  version: number;
  savedAt: string;
  state: unknown;
  checksum: string;
}

/** Clear error kinds let UI distinguish absence, corruption, and compatibility failures. */
export class SaveError extends Error {
  constructor(readonly code: 'corrupt' | 'incompatible' | 'validation' | 'storage', message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SaveError';
  }
}

function canonical(value: JSONValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key]!)}`).join(',')}}`;
  return JSON.stringify(value);
}

/** FNV-1a catches accidental corruption; it is not authentication or encryption. */
function checksum(value: unknown): string {
  assertJSON(value);
  const text = canonical(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 0x01000193); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
export function assertGameState(value: unknown): asserts value is GameState {
  assertJSON(value);
  if (!isRecord(value) || typeof value.roomId !== 'string' || !value.roomId || !Array.isArray(value.inventory) ||
    !value.inventory.every(item => typeof item === 'string' && item.length > 0) ||
    !isRecord(value.flags) || !isRecord(value.characters) || !isRecord(value.extensions)) throw new Error('Invalid game state');
  if (new Set(value.inventory).size !== value.inventory.length) throw new Error('Inventory IDs must be unique');
  for (const [id, character] of Object.entries(value.characters)) {
    assertCharacterSnapshot(character);
    if (id !== character.id) throw new Error('Character dictionary key must match character ID');
  }
  if (value.selectedItem !== undefined && value.selectedItem !== null &&
    (typeof value.selectedItem !== 'string' || !value.inventory.includes(value.selectedItem))) throw new Error('Selected inventory item is not owned');
}

/**
 * Stores stable JSON data, never engine objects or closures. load returns a detached, fully validated
 * candidate; it never changes a live game. Adopt the result only after all client checks succeed.
 */
export class SaveStore<T extends GameState = GameState> {
  private readonly prefix: string;
  private readonly options: SaveStoreOptions<T>;
  constructor(options: SaveStoreOptions<T>) {
    if (!options.gameId || !Number.isSafeInteger(options.version) || options.version < 1) throw new Error('SaveStore needs a game ID and positive integer version');
    this.options = { ...options, migrations: options.migrations ? { ...options.migrations } : undefined };
    this.prefix = `pointlesh:${encodeURIComponent(options.gameId)}:`;
  }

  save(slot: string, state: T): SaveMetadata {
    const key = this.key(slot);
    const candidate = this.validate(state);
    const header = {
      format: 'pointlesh-save' as const, formatVersion: 1 as const, gameId: this.options.gameId,
      version: this.options.version, savedAt: (this.options.now?.() ?? new Date()).toISOString(), state: candidate,
    };
    const serialized = JSON.stringify({ ...header, checksum: checksum(header) });
    try { this.options.storage.setItem(key, serialized); }
    catch (cause) { throw new SaveError('storage', `Could not save slot "${slot}"`, { cause }); }
    return { slot, savedAt: header.savedAt, version: header.version, gameId: header.gameId };
  }

  load(slot: string): T | null {
    const record = this.read(slot);
    if (!record) return null;
    let candidate = cloneJSON(record.state);
    for (let version = record.version; version < this.options.version; version++) {
      const migrate = this.options.migrations?.[version];
      if (!migrate) throw new SaveError('incompatible', `No migration from game version ${version}`);
      try { candidate = cloneJSON(migrate(candidate)); }
      catch (cause) { throw new SaveError('validation', `Migration from game version ${version} failed`, { cause }); }
    }
    return this.validate(candidate);
  }

  /** Compatible records only; malformed or foreign records never break a save menu. */
  list(): SaveMetadata[] {
    let keys: string[];
    try { keys = this.options.storage.keys(); }
    catch (cause) { throw new SaveError('storage', 'Could not list saves', { cause }); }
    const result: SaveMetadata[] = [];
    for (const key of keys) {
      if (!key.startsWith(this.prefix)) continue;
      try {
        const slot = decodeURIComponent(key.slice(this.prefix.length));
        const record = this.read(slot);
        if (record) result.push({ slot, savedAt: record.savedAt, version: record.version, gameId: record.gameId });
      } catch (error) {
        if (error instanceof SaveError && error.code === 'storage') throw error;
      }
    }
    return result.sort((a, b) => b.savedAt.localeCompare(a.savedAt) || a.slot.localeCompare(b.slot));
  }

  remove(slot: string): void {
    try { this.options.storage.removeItem(this.key(slot)); }
    catch (cause) { throw new SaveError('storage', `Could not delete slot "${slot}"`, { cause }); }
  }

  private key(slot: string): string {
    if (typeof slot !== 'string' || !slot.trim() || slot.length > 200) throw new Error('Save slot must be a nonempty string of at most 200 characters');
    return this.prefix + encodeURIComponent(slot);
  }

  private validate(value: unknown): T {
    try {
      assertGameState(value);
      const candidate = cloneJSON(value) as T;
      this.options.validate?.(candidate);
      // A validator can normalize data, but may not inject nonserializable or invalid values.
      assertGameState(candidate);
      return cloneJSON(candidate);
    } catch (cause) { throw new SaveError('validation', 'Save state validation failed', { cause }); }
  }

  private read(slot: string): SaveEnvelope | null {
    let serialized: string | null;
    try { serialized = this.options.storage.getItem(this.key(slot)); }
    catch (cause) { throw new SaveError('storage', `Could not read slot "${slot}"`, { cause }); }
    if (serialized === null) return null;
    let record: SaveEnvelope;
    try {
      const parsed: unknown = JSON.parse(serialized);
      if (!isRecord(parsed) || parsed.format !== 'pointlesh-save' || parsed.formatVersion !== 1 ||
        typeof parsed.gameId !== 'string' || typeof parsed.savedAt !== 'string' || !Number.isFinite(Date.parse(parsed.savedAt)) ||
        !Number.isSafeInteger(parsed.version) || (parsed.version as number) < 1 || typeof parsed.checksum !== 'string' || !('state' in parsed)) {
        throw new Error('Malformed envelope');
      }
      const { checksum: storedChecksum, ...header } = parsed;
      if (checksum(header) !== storedChecksum) throw new Error('Checksum mismatch');
      record = parsed as unknown as SaveEnvelope;
    } catch (cause) { throw new SaveError('corrupt', `Save slot "${slot}" is damaged or has an unknown format`, { cause }); }
    if (record.gameId !== this.options.gameId) throw new SaveError('incompatible', 'Save belongs to a different game');
    if (record.version > this.options.version) throw new SaveError('incompatible', 'Save was made by a newer game version');
    return record;
  }
}
