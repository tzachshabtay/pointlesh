import test from 'node:test';
import assert from 'node:assert/strict';
import { CharacterController, SaveStore, SaveError, MemorySaveStorage, LocalStorageSaveStorage, BehaviorRegistry } from '../dist/index.js';

const makeState = () => ({
  roomId: 'gold-mine', inventory: ['lantern', 'rope'], selectedItem: 'rope',
  flags: { bridgeRepaired: true, guardPhaseMs: 2400 },
  characters: { dwarf: new CharacterController({ id: 'dwarf', position: { x: 20, y: 30 } }).snapshot() },
  extensions: { 'client:weather': { raining: true, intensity: 0.6 } },
  dialog: { visited: ['barkeep:rumors'], variables: { password: true } },
  cutscene: { id: 'intro', nextStep: 3 },
});
const create = (storage, extras = {}) => new SaveStore({ gameId: 'forest', version: 1, storage, now: () => new Date('2026-09-06T12:00:00Z'), ...extras });

test('a fresh store round-trips a mid-puzzle snapshot including client and dialog data', () => {
  const storage = new MemorySaveStorage(), state = makeState();
  create(storage).save('Camp gate', state);
  const loaded = create(storage).load('Camp gate');
  assert.deepEqual(loaded, state);
  loaded.inventory.push('key');
  loaded.extensions['client:weather'].intensity = 1;
  assert.equal(state.inventory.length, 2);
  assert.equal(create(storage).load('Camp gate').extensions['client:weather'].intensity, 0.6);
  assert.equal(create(storage).list()[0].slot, 'Camp gate');
  create(storage).remove('Camp gate');
  assert.equal(create(storage).load('Camp gate'), null);
});

test('malformed and checksum-damaged saves throw without changing the live state', () => {
  const storage = new MemorySaveStorage(), saves = create(storage), state = makeState();
  saves.save('quick', state);
  const original = structuredClone(state), key = storage.keys()[0], raw = storage.getItem(key);
  storage.setItem(key, '{garbage');
  assert.throws(() => saves.load('quick'), error => error instanceof SaveError && error.code === 'corrupt');
  assert.deepEqual(state, original);
  const record = JSON.parse(raw);
  record.state.flags.bridgeRepaired = false;
  storage.setItem(key, JSON.stringify(record));
  assert.throws(() => saves.load('quick'), error => error.code === 'corrupt');
  assert.deepEqual(saves.list(), []);
});

test('foreign-game and future-version records are rejected even with intact checksums', () => {
  const storage = new MemorySaveStorage();
  create(storage, { gameId: 'other-game' }).save('quick', makeState());
  storage.setItem('pointlesh:forest:quick', storage.getItem('pointlesh:other-game:quick'));
  assert.throws(() => create(storage).load('quick'), error => error.code === 'incompatible');
  create(storage, { version: 3 }).save('quick', makeState());
  assert.throws(() => create(storage).load('quick'), error => error.code === 'incompatible');
});

test('ordered migrations upgrade detached data and missing/failing migrations do not replace the save', () => {
  const storage = new MemorySaveStorage();
  create(storage).save('quick', makeState());
  const before = storage.getItem(storage.keys()[0]);
  const upgraded = create(storage, { version: 3, migrations: {
    1: state => ({ ...state, flags: { ...state.flags, version2: true } }),
    2: state => ({ ...state, roomId: 'mine-entrance', flags: { ...state.flags, version3: state.flags.version2 } }),
  } }).load('quick');
  assert.equal(upgraded.roomId, 'mine-entrance');
  assert.equal(upgraded.flags.version3, true);
  assert.equal(storage.getItem(storage.keys()[0]), before);
  assert.throws(() => create(storage, { version: 2 }).load('quick'), error => error.code === 'incompatible');
  assert.throws(() => create(storage, { version: 2, migrations: { 1: () => { throw new Error('Failed'); } } }).load('quick'), error => error.code === 'validation');
  assert.equal(storage.getItem(storage.keys()[0]), before);
});

test('validation and quota failure preserve the previous complete record', () => {
  const backing = new MemorySaveStorage();
  let failWrites = false;
  const storage = {
    getItem: key => backing.getItem(key), keys: () => backing.keys(), removeItem: key => backing.removeItem(key),
    setItem: (key, value) => { if (failWrites) throw new Error('Quota exceeded'); backing.setItem(key, value); },
  };
  const saves = create(storage);
  saves.save('quick', makeState());
  const before = backing.getItem(backing.keys()[0]);
  for (const invalid of [
    { ...makeState(), selectedItem: 'not-owned' },
    { ...makeState(), flags: { timer: Infinity } },
    { ...makeState(), extensions: { handler: () => {} } },
    { ...makeState(), inventory: ['rope', 'rope'] },
  ]) assert.throws(() => saves.save('quick', invalid), error => error.code === 'validation');
  failWrites = true;
  assert.throws(() => saves.save('quick', { ...makeState(), roomId: 'camp' }), error => error.code === 'storage');
  assert.equal(backing.getItem(backing.keys()[0]), before);
  assert.equal(saves.load('quick').roomId, 'gold-mine');
});

test('game-specific validation can reject unknown rooms before adopting a candidate', () => {
  const storage = new MemorySaveStorage();
  create(storage).save('quick', makeState());
  assert.throws(() => create(storage, { validate: state => { if (state.roomId !== 'village') throw new Error('Unknown room'); } }).load('quick'), error => error.code === 'validation');
});

test('localStorage adapter supports a Storage-compatible host', () => {
  const entries = new Map();
  const storage = new LocalStorageSaveStorage({
    get length() { return entries.size; }, key: index => [...entries.keys()][index] ?? null,
    getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key),
  });
  create(storage).save('quick', makeState());
  assert.equal(create(storage).load('quick').roomId, 'gold-mine');
  assert.equal(storage.keys().length, 1);
});

test('blocked browser storage does not crash initialization and operations report recoverable storage errors', t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage access denied'); } });
  t.after(() => { if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete globalThis.localStorage; });
  const adapter = new LocalStorageSaveStorage();
  const saves = create(adapter);
  assert.throws(() => saves.list(), error => error instanceof SaveError && error.code === 'storage');
  assert.throws(() => saves.save('quick', makeState()), error => error instanceof SaveError && error.code === 'storage');
  assert.throws(() => saves.load('quick'), error => error instanceof SaveError && error.code === 'storage');
});

test('mutating constructor options cannot change an established save namespace or schema', () => {
  const storage = new MemorySaveStorage(), options = { gameId: 'forest', version: 1, storage };
  const saves = new SaveStore(options);
  options.gameId = 'other'; options.version = 99;
  saves.save('quick', makeState());
  assert.equal(saves.list()[0].gameId, 'forest');
  assert.equal(saves.list()[0].version, 1);
  assert.equal(create(storage).load('quick').roomId, 'gold-mine');
});

test('prefab behavior IDs extend clients with ordered typed handlers and validation before effects', async () => {
  const effects = [];
  const registry = new BehaviorRegistry();
  registry.register('client:unlock', { validate: props => { if (typeof props.key !== 'string') throw new Error('Missing key'); }, handle: (context, event, props) => { context.push(`${event.type}:${props.key}`); } });
  registry.register('client:sound', { handle: context => { context.push('sound'); } });
  await registry.dispatch([{ id: 'client:unlock', properties: { key: 'gold' } }, 'client:sound'], { type: 'interact' }, effects);
  assert.deepEqual(effects, ['interact:gold', 'sound']);
  await assert.rejects(registry.dispatch(['client:sound', 'unknown'], { type: 'interact' }, effects), /Unknown behavior/);
  assert.equal(effects.length, 2);
});
