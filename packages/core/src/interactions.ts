import type { AiAssetManifest } from '@ai-game-assets/core';
import type { SceneDesignerManifest } from '@scene-designer/core';
import { isPointleshPrefab, resolvePointleshScene, type ResolvedPointleshEntity, type PointleshProperties } from './prefabs.js';
import { assertJSON } from './types.js';

export type InteractionSpeechMode = 'random' | 'rotation' | 'sequence';
export type SimpleInteraction = { kind: 'simple'; mode?: InteractionSpeechMode } &
  ({ text: string; sentences?: never } | { sentences: string[]; text?: never });
export type Interaction = { kind: 'code' } | SimpleInteraction | { kind: 'impossible' };
/** Reserved row: an empty target cell inherits the same column from Defaults. */
export const DEFAULT_INTERACTION_TARGET = 'defaults';
export const interactionSentences = (cell: SimpleInteraction): string[] => cell.sentences ?? [cell.text!];
export function resolveInteraction(manifest: InteractionManifest, row: string, column: string) {
  const own = manifest.cells[row]?.[column];
  return own ? { cell: own, sourceRow: row } : { cell: manifest.cells[DEFAULT_INTERACTION_TARGET]?.[column], sourceRow: DEFAULT_INTERACTION_TARGET };
}
export type InteractionPlaybackState = { rotations: Record<string, number> };
export const createInteractionPlaybackState = (): InteractionPlaybackState => ({ rotations: {} });
export type InteractionSpeechLine = { text: string; lineAssetId: string };
/** Defaults share their rotation across targets. Each explicit cell has its own cursor. */
export function selectInteractionSpeech(cell: SimpleInteraction, sourceRow: string, column: string,
  state: InteractionPlaybackState, random: () => number = Math.random): InteractionSpeechLine[] {
  const sentences = interactionSentences(cell), mode = cell.mode ?? 'sequence';
  let indexes = sentences.map((_, index) => index);
  if (mode === 'random') indexes = [Math.min(sentences.length - 1, Math.max(0, Math.floor(random() * sentences.length)))];
  if (mode === 'rotation') {
    const key = JSON.stringify([sourceRow, column]), index = (state.rotations[key] ?? 0) % sentences.length;
    indexes = [index]; state.rotations[key] = (index + 1) % sentences.length;
  }
  return indexes.map(index => ({ text: sentences[index]!, lineAssetId: interactionVoiceLineId(sourceRow, column, index) }));
}
export type InteractionVerb = { id: string; label: string };
export type InteractionManifest = {
  schemaVersion: 1;
  verbs: InteractionVerb[];
  heroVoiceAssetId: string;
  /** Missing cells are unassigned. Inventory columns use prefab ids, never display names. */
  cells: Record<string, Record<string, Interaction>>;
};
export type InteractionTarget = {
  id: string; name: string; kind: 'character' | 'object' | 'hotspot' | 'inventory-item';
  properties: PointleshProperties;
  locations: { sceneId: string; sceneName: string; entityId: string }[];
};
export const verbInteractionColumn = (verb: string) => `verb:${verb}`;
export const itemInteractionColumn = (prefabId: string) => `item:${prefabId}`;
export const prefabInteractionTarget = (prefabId: string) => `prefab:${prefabId}`;
export const sceneInteractionTarget = (sceneId: string, entity: Pick<ResolvedPointleshEntity, 'id' | 'prefabId'>) =>
  entity.prefabId ? prefabInteractionTarget(entity.prefabId) : `scene:${JSON.stringify([sceneId, entity.id])}`;

/** Shared characters/objects appear once; scene-local hotspots remain distinct.
 * interactiveOnly respects resolved instance overrides, independently of editor visibility.
 * The full catalog remains available for retaining authored interactions and voice labels. */
export function interactionTargets(scenes: SceneDesignerManifest, options: { interactiveOnly?: boolean } = {}): InteractionTarget[] {
  const targets = new Map<string, InteractionTarget>();
  for (const sceneId of Object.keys(scenes.scenes)) {
    const scene = resolvePointleshScene(scenes, sceneId);
    for (const entity of [...scene.objects, ...scene.areas.filter(area => area.kind === 'hotspot')]) {
      if (!['character', 'object', 'hotspot'].includes(entity.kind)) continue;
      if (options.interactiveOnly && entity.properties.interactive === false) continue;
      const id = sceneInteractionTarget(sceneId, entity);
      const row = targets.get(id) ?? { id, name: entity.name, kind: entity.kind as InteractionTarget['kind'], properties: entity.properties, locations: [] };
      row.locations.push({ sceneId, sceneName: scenes.scenes[sceneId]!.name, entityId: entity.id });
      targets.set(id, row);
    }
  }
  for (const prefab of Object.values(scenes.prefabs ?? {})) {
    if (isPointleshPrefab(prefab) && prefab.pointlesh.kind === 'inventory-item' && !prefab.pointlesh.editor?.template) {
      if (options.interactiveOnly && prefab.pointlesh.properties.interactive === false) continue;
      const id = prefabInteractionTarget(prefab.id);
      targets.set(id, { id, name: prefab.name, kind: 'inventory-item', properties: prefab.pointlesh.properties, locations: [] });
    }
  }
  return [...targets.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}

export function assertInteractionManifest(value: unknown): asserts value is InteractionManifest {
  assertJSON(value);
  const manifest = value as InteractionManifest;
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.verbs) || !manifest.verbs.length ||
    typeof manifest.heroVoiceAssetId !== 'string' || !manifest.heroVoiceAssetId.trim() ||
    !manifest.cells || typeof manifest.cells !== 'object' || Array.isArray(manifest.cells)) throw new Error('Invalid interaction manifest');
  const verbs = new Set<string>();
  for (const verb of manifest.verbs) {
    if (!verb || typeof verb.id !== 'string' || !verb.id.trim() || typeof verb.label !== 'string' || !verb.label.trim() || verbs.has(verb.id)) throw new Error('Interaction verbs require unique ids and labels');
    verbs.add(verb.id);
  }
  for (const [row, cells] of Object.entries(manifest.cells)) {
    if (!row || !cells || typeof cells !== 'object' || Array.isArray(cells)) throw new Error('Invalid interaction row');
    for (const [column, cell] of Object.entries(cells)) {
      if (!(column.startsWith('item:') && column.length > 5) && !(column.startsWith('verb:') && verbs.has(column.slice(5)))) throw new Error(`Unknown interaction column: ${column}`);
      if (!cell || !['code', 'simple', 'impossible'].includes(cell.kind)) throw new Error('Invalid interaction state');
      if (cell.kind === 'simple') {
        const sentences = interactionSentences(cell);
        if (!Array.isArray(sentences) || !sentences.length || sentences.some(text => typeof text !== 'string' || !text.trim()) ||
          (cell.sentences !== undefined && cell.text !== undefined)) throw new Error('A simple interaction needs speech text in each sentence');
        if (cell.mode !== undefined && !['random', 'rotation', 'sequence'].includes(cell.mode)) throw new Error('Invalid speech playback mode');
      }
    }
  }
}

/** A deterministic, safe asset id independent of editable row labels and speech text. */
export function interactionVoiceLineId(row: string, column: string, sentenceIndex = 0): string {
  let hash = 14695981039346656037n;
  for (const byte of new TextEncoder().encode(JSON.stringify([row, column]))) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 1099511628211n);
  const base = `voice.line.interaction.${hash.toString(16).padStart(16, '0')}`;
  return sentenceIndex === 0 ? base : `${base}.sentence-${sentenceIndex + 1}`;
}

/** Retains generated versions; changed speech clears the active recording so stale audio cannot play. */
export function syncInteractionVoiceLines(manifest: InteractionManifest, source: AiAssetManifest, targets: InteractionTarget[] = []): AiAssetManifest {
  assertInteractionManifest(manifest);
  const assets = structuredClone(source), voice = assets.assets[manifest.heroVoiceAssetId];
  if (!voice || voice.kind !== 'voice') throw new Error(`Missing hero voice: ${manifest.heroVoiceAssetId}`);
  for (const [row, cells] of Object.entries(manifest.cells)) for (const [column, cell] of Object.entries(cells)) {
    if (cell.kind !== 'simple') continue;
    for (const [index, text] of interactionSentences(cell).entries()) {
      const id = interactionVoiceLineId(row, column, index), existing = assets.assets[id];
      if (existing && existing.kind !== 'voice-line') throw new Error(`Interaction voice id is already used: ${id}`);
      const settings = { ...existing?.voiceSettings, ...existing?.versions[existing.activeVersion]?.voiceSettings };
      const changed = settings.text !== text || settings.voiceAssetId !== manifest.heroVoiceAssetId;
      const asset = existing ?? { id, kind: 'voice-line' as const, prompt: text, activeVersion: '', versions: {} };
      asset.prompt = text;
      asset.voiceSettings = { ...asset.voiceSettings, voiceAssetId: manifest.heroVoiceAssetId, text };
      if (changed) asset.activeVersion = '';
      assets.assets[id] = asset;
      for (const other of Object.values(assets.assets)) if (other.kind === 'voice' && other.id !== voice.id) {
        for (const [key, link] of Object.entries(other.linkedAnimationAssets ?? {})) if (link.assetId === id) delete other.linkedAnimationAssets![key];
      }
      const name = row === DEFAULT_INTERACTION_TARGET ? 'Defaults' : targets.find(target => target.id === row)?.name ?? row;
      const action = column.startsWith('verb:') ? manifest.verbs.find(verb => verb.id === column.slice(5))?.label ?? column : targets.find(target => target.id === prefabInteractionTarget(column.slice(5)))?.name ?? column.slice(5);
      const existingLabel = voice.linkedAnimationAssets?.[id]?.label;
      (voice.linkedAnimationAssets ??= {})[id] = { assetId: id, label: !targets.length && existingLabel ? existingLabel : `${name} · ${action}${interactionSentences(cell).length > 1 ? ` · Sentence ${index + 1}` : ''}` };
      (assets.assetPaths ??= {})[id] = ['Voices'];
    }
  }
  return assets;
}

const defaultPlayback = new WeakMap<InteractionManifest, InteractionPlaybackState>();
/** Empty inherits Defaults; sequence awaits each say callback before starting the next sentence. */
export async function runInteraction(manifest: InteractionManifest, row: string, column: string, handlers: {
  say(text: string, lineAssetId: string): unknown | Promise<unknown>;
  code?(row: string, column: string): unknown | Promise<unknown>;
  impossible?(row: string, column: string): unknown | Promise<unknown>;
}, playback?: { state?: InteractionPlaybackState; random?: () => number }): Promise<boolean> {
  const { cell, sourceRow } = resolveInteraction(manifest, row, column);
  if (!cell) return false;
  if (cell.kind === 'simple') {
    let state = playback?.state ?? defaultPlayback.get(manifest);
    if (!state) { state = createInteractionPlaybackState(); defaultPlayback.set(manifest, state); }
    for (const line of selectInteractionSpeech(cell, sourceRow, column, state, playback?.random)) await handlers.say(line.text, line.lineAssetId);
  }
  else if (cell.kind === 'impossible') await handlers.impossible?.(row, column);
  else {
    if (!handlers.code) throw new Error(`No game handler for ${row} / ${column}`);
    await handlers.code(row, column);
  }
  return true;
}
