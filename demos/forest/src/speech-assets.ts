import type { AiAssetManifest } from '@ai-game-assets/core';
import type { SceneDesignerManifest } from '@scene-designer/core';
import { resolvePointleshScene } from '@pointlesh/core';
import { spokenLines } from './spoken-lines';
import { intro, ending, items, targets } from './story';
import { portraitCharacters } from './portrait-assets';
import { narrationLineId } from './narrator-assets';
import { entityInteractionId } from './interactions';

export function speechVoice(speaker = 'Borin'): string {
  return Object.entries(portraitCharacters).find(([id, name]) => id === speaker || name === speaker)?.[0]
    ?? (speaker === 'Runed chest' ? 'chest' : 'borin');
}
const lineText = (asset: AiAssetManifest['assets'][string]) =>
  asset.versions[asset.activeVersion]?.voiceSettings?.text ?? asset.voiceSettings?.text;

/** Reuse existing interaction/dialog recordings when the same character says the same text. */
export function findSpeechLine(manifest: AiAssetManifest, text: string, voice: string): string | undefined {
  const matches = Object.values(manifest.assets).filter(asset => asset.kind === 'voice-line'
    && (asset.versions[asset.activeVersion]?.voiceSettings?.voiceAssetId ?? asset.voiceSettings?.voiceAssetId) === `voice.${voice}`
    && lineText(asset) === text);
  return (matches.find(asset => asset.versions[asset.activeVersion]?.file) ?? matches[0])?.id;
}

export function resolveGameSpeech(manifest: AiAssetManifest, text: string, speaker = 'Borin', explicitLineId?: string) {
  const voice = speechVoice(speaker);
  const scripted = Object.entries(spokenLines).find(([, line]) => line.voice === voice && line.text === text);
  const id = explicitLineId ?? (scripted ? `line.game.${voice}.${scripted[0]}` : undefined);
  const asset = id ? manifest.assets[id] : undefined;
  const resolvedText = asset ? lineText(asset) ?? text : text;
  // Explicit interaction IDs always win, including an unpromoted selection.
  const lineAssetId = explicitLineId ?? findSpeechLine(manifest, resolvedText, voice) ?? asset?.id;
  return { text: resolvedText, voice, lineAssetId };
}

export function cutsceneSpeechLine(manifest: AiAssetManifest, kind: 'intro' | 'ending', index: number): string | undefined {
  const narration = narrationLineId(kind, index);
  const step = (kind === 'intro' ? intro : ending)[index];
  return narration ?? (step ? resolveGameSpeech(manifest, step.text, step.speaker).lineAssetId : undefined);
}

export function addGameSpeechAssets(manifest: AiAssetManifest, scenes?: SceneDesignerManifest): void {
  const add = (id: string, voiceId: string, text: string, label: string) => {
    const voiceAssetId = `voice.${voiceId}`;
    const voice = manifest.assets[voiceAssetId] ??= {
      id: voiceAssetId, kind: 'voice', activeVersion: '', versions: {},
      prompt: voiceId === 'guard' ? 'A gruff, gravelly orc guard. Deep and grumbling, with comic bluster; clearly intelligible speech.'
        : `Warm fantasy storytelling voice for ${portraitCharacters[voiceId as keyof typeof portraitCharacters] ?? voiceId}.`,
    };
    manifest.assets[id] ??= { id, kind: 'voice-line', prompt: text, activeVersion: '', versions: {},
      voiceSettings: { voiceAssetId, text, direction: '' } };
    (voice.linkedAnimationAssets ??= {})[id] ??= { assetId: id, label };
    (manifest.assetPaths ??= {})[voiceAssetId] ??= ['Voices'];
  };
  for (const [key, line] of Object.entries(spokenLines)) add(`line.game.${line.voice}.${key}`, line.voice, line.text, line.label);
  const description = (key: string, text: string, label: string) => {
    if (text.trim() && !findSpeechLine(manifest, text, 'borin')) add(`line.game.borin.look.${key}`, 'borin', text, `Look · ${label}`);
  };
  for (const [id, item] of Object.entries(items)) description(`inventory-${id}`, item.description, item.name);
  for (const [room, entries] of Object.entries(targets)) for (const target of entries) description(`${room}-${target.id}`, target.description, target.name);
  if (scenes) for (const id of Object.keys(scenes.scenes)) {
    const room = resolvePointleshScene(scenes, id);
    for (const entity of [...room.objects, ...room.areas]) {
      if (!entity.enabled || entity.properties.interactive === false) continue;
      const target = Object.values(targets).flat().find(target => target.id === entityInteractionId(entity));
      const text = typeof entity.properties.description === 'string' ? entity.properties.description : target?.description ?? entity.name;
      // Text participates in the ID so changing a designer description cannot play stale audio.
      let hash = 2166136261;
      for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
      description(`${id}-${entity.id}-${hash.toString(16)}`, text, entity.name);
    }
  }
}
