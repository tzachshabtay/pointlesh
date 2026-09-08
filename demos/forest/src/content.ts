import { defineAiAssets, type AiAssetDefinition } from '@ai-game-assets/core';
import { defineDialogManifest, type DialogDefinition, type DialogNode } from '@dialog-designer/core';
import { createPointleshInstance, pointleshPrefabs, extendPointleshPrefab } from '@pointlesh/core';
import { createLayer, createScene, defineSceneManifest, type ScenePrefabInstance } from '@scene-designer/core';
import { roomIds, roomNames, targets } from './story';
import { CHARACTER_IDS, CHARACTER_VIEWS, CHARACTER_ACTIVITY_FRAMES, type ForestCharacterId } from './sprites';
import { bramblehollowStyleGuide } from './art-style';

export const roomDimensions = Object.fromEntries(roomIds.map(id => [id, { width: id === 'forest' ? 1620 : 960, height: 540 }])) as Record<typeof roomIds[number], { width: number; height: number }>;

export const atlasRooms = {
  village: { asset: 'background.village-pub', row: 0 }, pub: { asset: 'background.village-pub', row: 1 },
  house: { asset: 'background.house-forest', row: 0 }, forest: { asset: 'background.forest-wide', row: null },
  mine: { asset: 'background.mine-camp', row: 0 }, camp: { asset: 'background.mine-camp', row: 1 }
} as const;
const definitions: Record<string, AiAssetDefinition> = {};
for (const id of ['village-pub', 'house-forest', 'mine-camp']) {
  const assetId = `background.${id}`;
  definitions[assetId] = {
    id: assetId, kind: 'image', prompt: `Two vertically stacked pixel-art adventure rooms: ${id}. 16:9 each, no characters or text. See docs/art-prompts.md for full production prompt.`,
    dimensions: { width: 1182, height: 1330 }, activeVersion: 'original',
    versions: { original: { name: 'original', file: `art/atlas-${id}.png`, prompt: `Pixel-art ${id} room atlas`, createdAt: '2026-09-07T00:00:00.000Z', model: 'imagegen' } }
  };
}
definitions['background.forest-wide'] = {
  id: 'background.forest-wide', kind: 'image',
  prompt: 'A continuous 3:1 pixel-art panorama of the Whispering Wood. Ancient mossy trees frame a broad walkable forest path, with violet dreamcaps at the left roots, a timbered gold mine in the left quarter, an old oak and unlettered signpost in the middle, and an orc palisade gate at the far right. Match the Bramblehollow style reference. No characters, UI or lettering. See docs/art-prompts.md for the full production prompt.',
  dimensions: { width: 2172, height: 724 }, activeVersion: 'original', tags: ['forest', 'background', 'panorama'],
  versions: { original: { name: 'original', file: 'art/forest-wide.png', prompt: 'Horizontally extended Whispering Wood panorama; full prompt in docs/art-prompts.md.', createdAt: '2026-09-07T00:00:00.000Z', model: 'imagegen' } },
};
/** Real AI Assets animation children keep the same pixels available in the designer and game. */
export const characterAssetDefinitions: Record<string, AiAssetDefinition> = {};
for (const id of CHARACTER_IDS) {
  const assetId = `character.${id}`;
  const prompt = `A small pixel-art ${id === 'guard' ? 'orc guard' : 'dwarf named ' + id}, full body, transparent background.`;
  const version = (file: string, description: string) => ({ name: 'original', file, prompt: description, createdAt: '2026-09-07T00:00:00.000Z', model: 'pointlesh-pixel-art', notes: 'Original code-authored pixel art. Regenerate with demos/forest/scripts/generate-character-art.ts.' });
  const linkedAnimationAssets: NonNullable<AiAssetDefinition['linkedAnimationAssets']> = {};
  for (const activity of ['idle', 'walk', 'speak'] as const) for (const view of CHARACTER_VIEWS) {
    const state = `${activity}-${view}`, childId = `${assetId}.${state}`;
    const frameCount = CHARACTER_ACTIVITY_FRAMES[activity].length;
    linkedAnimationAssets[state] = { label: `${activity[0].toUpperCase()}${activity.slice(1)} · ${view}`, assetId: childId };
    characterAssetDefinitions[childId] = {
      id: childId, kind: 'animation', prompt: `${prompt} ${activity} animation, facing ${view}; ${frameCount} horizontal frames.`,
      dimensions: { width: 24 * frameCount, height: 32 },
      frameGrid: { frameWidth: 24, frameHeight: 32, columns: frameCount, rows: 1, frameCount },
      animations: [{ key: childId, frames: Array.from({ length: frameCount }, (_, frame) => frame), frameRate: activity === 'walk' ? 10 : activity === 'speak' ? 6 : 2, repeat: -1 }],
      activeVersion: 'original', versions: { original: version(`art/characters/${id}/${state}.png`, `${prompt} ${activity}, ${view}.`) },
      tags: ['forest', 'character', id, activity, view]
    };
  }
  characterAssetDefinitions[assetId] = {
    id: assetId, kind: 'spritesheet', prompt: `${prompt} Front, back, and left-profile rows; right facing mirrors the left profile.`,
    dimensions: { width: 192, height: 96 }, frameGrid: { frameWidth: 24, frameHeight: 32, columns: 8, rows: 3, frameCount: 24 },
    linkedAnimationAssets, activeVersion: 'original', versions: { original: version(`art/characters/${id}/sheet.png`, prompt) },
    tags: ['forest', 'character', id]
  };
}
Object.assign(definitions, characterAssetDefinitions);

/** Facing slots use parent asset states so linked animation replacement stays editable. */
export function characterAnimations(id: ForestCharacterId) {
  const activity = (state: 'idle' | 'walk' | 'speak') => ({
    front: { assetId: `character.${id}`, key: `${state}-front`, flipX: false },
    back: { assetId: `character.${id}`, key: `${state}-back`, flipX: false },
    left: { assetId: `character.${id}`, key: `${state}-left`, flipX: false },
    right: { assetId: `character.${id}`, key: `${state}-left`, flipX: true }
  });
  return { idle: activity('idle'), walk: activity('walk'), speak: activity('speak') };
}
for (const [id, description] of Object.entries({ coin: 'A small gleaming copper coin', rope: 'A coil of sturdy dwarven climbing rope', mushroom: 'A purple dreamcap mushroom with silver spots' })) {
  definitions[`object.${id}`] = { id: `object.${id}`, kind: 'image', prompt: `${description}, pixel art, transparent background.`, dimensions: { width: 16, height: 16 }, activeVersion: '', versions: {} };
}
for (const [id, label] of Object.entries({ borin: 'Borin', elder: 'Elder Rowan', innkeeper: 'Mara', miner: 'Orrin', chest: 'The runed chest' })) {
  definitions[`voice.${id}`] = { id: `voice.${id}`, kind: 'voice', prompt: `Warm fantasy storytelling voice for ${label}.`, activeVersion: '', versions: {} };
}
function dialog(id: string, speaker: string, greeting: string, options: { id: string; text: string; reply: string }[]): DialogDefinition {
  const nodes: Record<string, DialogNode> = {};
  const line = (key: string, text: string, label: string) => {
    const assetId = `line.${id}.${key}`;
    definitions[assetId] = { id: assetId, kind: 'voice-line', prompt: text, voiceSettings: { voiceAssetId: `voice.${speaker}`, text }, activeVersion: '', versions: {} };
    // AI Assets uses these links for the voice's Line selector and regeneration.
    const voice = definitions[`voice.${speaker}`]!;
    const dialogLabel = id.split('-').map(part => part[0]!.toUpperCase() + part.slice(1)).join(' ');
    (voice.linkedAnimationAssets ??= {})[assetId] = { label: id === speaker ? label : `${dialogLabel} · ${label}`, assetId };
    return { id: key, enabled: true, voiceAssetId: `voice.${speaker}`, lineAssetId: assetId };
  };
  nodes.opening = { id: 'opening', type: 'block', name: 'Greeting', enabled: true, lines: [line('greeting', greeting, 'Greeting')], nextNodeId: 'topics' };
  nodes.topics = { id: 'topics', type: 'decision', name: 'Topics', prompt: 'What will you say?', enabled: true, options: options.map(option => ({ id: option.id, text: option.text, enabled: true, nextNodeId: `answer-${option.id}` })) };
  for (const option of options) nodes[`answer-${option.id}`] = { id: `answer-${option.id}`, type: 'block', name: option.text, enabled: true, lines: [line(option.id, option.reply, option.text)] };
  return { id, name: roomNames[id as keyof typeof roomNames] ?? id, enabled: true, entryNodeId: 'opening', nodes };
}
export const dialogs = defineDialogManifest({ schemaVersion: 1, dialogs: {
  elder: dialog('elder', 'elder', 'Borin. You have your father’s stubborn look. Good. We will need it.', [
    { id: 'king', text: 'Where did they take the king?', reply: 'East, through the wood. Aldric’s cage is above a ledge in the orc camp. Take a rope, and find a way to open the lock.' },
    { id: 'advice', text: 'I could use a little advice.', reply: 'Visit your cottage for supplies. Then speak to Mara and Orrin at the Copper Tankard. A conversation opens more doors than an axe.' },
    { id: 'goodbye', text: 'I will bring him home.', reply: 'I know, lad. I know.' }
  ]),
  innkeeper: dialog('innkeeper', 'innkeeper', 'If you are planning a rescue, I hope you are planning to come back for supper.', [
    { id: 'dreamcap', text: 'How do I get past an orc guard?', reply: 'Orcs love honey stout. Add a silver-spotted dreamcap from the wood and they will sleep for hours. Combine them in your satchel, then slip the brew into their stew when the guard looks away.' },
    { id: 'buy', text: 'Do you have any honey stout?', reply: 'One copper coin. Bring me one from home, select it in your satchel, and hand it over. This is a pub, not a charity for heroes.' },
    { id: 'goodbye', text: 'Keep a seat by the fire for us.', reply: 'Two seats. And something better than orc stew.' }
  ]),
  miner: dialog('miner', 'miner', 'My pickaxe is locked in the runed chest at Goldroot. Can’t be too careful with good steel.', [
    { id: 'password', text: 'The king needs us. How do I open the chest?', reply: 'For the king? Of course. When the chest asks its question, say: “Stone remembers.” Take the pickaxe. It will break an orc lock.' },
    { id: 'mining', text: 'Finding much gold these days?', reply: 'Enough to pay Mara. So, no.' },
    { id: 'goodbye', text: 'I will return your pickaxe.', reply: 'Bring the king back first. The pickaxe can wait.' }
  ]),
  'chest-locked': dialog('chest-locked', 'chest', 'WHAT DOES THE MOUNTAIN REMEMBER?', [
    { id: 'guess', text: '…where I left my keys?', reply: 'THE CHEST REMAINS UNIMPRESSED. Perhaps Orrin at the pub knows the words.' }
  ]),
  'chest-open': dialog('chest-open', 'chest', 'WHAT DOES THE MOUNTAIN REMEMBER?', [
    { id: 'open-chest', text: 'Stone remembers.', reply: 'The runes glow like embers. The lid lifts, revealing Orrin’s finest pickaxe. “For the king,” you whisper.' }
  ])
} });
export const assets = { ...defineAiAssets(definitions), styleGuide: bramblehollowStyleGuide };

const base = pointleshPrefabs({ characterAssetId: 'character.borin', objectAssetId: 'object.coin' });
base['pointlesh.character'].pointlesh!.properties.animations = characterAnimations('borin');
base['forest.rescue-character'] = extendPointleshPrefab(base['pointlesh.character'], {
  id: 'forest.rescue-character', name: 'Rescue character', properties: { role: 'player', courage: 10 }, behaviors: ['forest.rescue'],
  propertySchema: { courage: { type: 'number', label: 'Courage', min: 0, max: 100 }, role: { type: 'string', label: 'Story role' } }
});
const rectangle = (x: number, y: number, width: number, height: number) => [
  { id: 'a', x, y }, { id: 'b', x: x + width, y }, { id: 'c', x: x + width, y: y + height }, { id: 'd', x, y: y + height }
];
/** Room-specific floor outlines retain the broad corridor used by all approach points. */
export function roomFloorVertices(room: typeof roomIds[number]) {
  if (room === 'forest') return [[35, 443], [190, 448], [274, 371], [360, 398], [450, 435], [680, 445], [920, 438], [1170, 419], [1365, 365], [1450, 389], [1585, 443], [1585, 515], [35, 515]].map(([x, y], index) => ({ id: `floor-${index}`, x, y }));
  const shoulders = { village: [124, 371, 835, 381], pub: [85, 380, 876, 373], house: [158, 365, 819, 390], forest: [167, 387, 832, 378], mine: [142, 374, 865, 390], camp: [116, 392, 848, 366] }[room];
  return [[35, 403], [shoulders[0], shoulders[1]], [360, 355], [710, 355], [shoulders[2], shoulders[3]], [925, 403], [925, 494], [850, 515], [110, 515], [35, 494]].map(([x, y], index) => ({ id: `floor-${index}`, x, y }));
}
/** Native quadratic edges describe a foreground trunk, table, or rocky silhouette. */
export function roomForegroundVertices(room: typeof roomIds[number]) {
  const outlines = {
    village: [[0, 160], [57, 162, 90, 248], [65, 338, 60, 435], [102, 504, 83, 525], [149, 540], [0, 540]],
    pub: [[0, 401, 55, 385], [121, 414], [139, 444], [92, 458], [111, 540], [0, 540]],
    house: [[0, 357], [57, 354, 84, 387], [83, 423], [106, 472, 77, 499], [111, 540], [0, 540]],
    forest: [[0, 113], [98, 103, 137, 204], [123, 311, 92, 409], [148, 465, 163, 495], [208, 515], [176, 540], [0, 540]],
    mine: [[0, 291], [44, 305], [57, 350, 96, 377], [70, 421], [115, 474, 86, 510], [147, 540], [0, 540]],
    camp: [[0, 465, 62, 458], [143, 471], [172, 493, 105, 500], [132, 540], [0, 540]]
  }[room];
  return outlines.map(([x, y, cx, cy], index) => ({ id: `foreground-${index}`, x, y, ...(cx !== undefined && cy !== undefined ? { curve: { cx, cy } } : {}) }));
}
const roomCharacters: Partial<Record<typeof roomIds[number], { actorName: ForestCharacterId; name: string; x: number; y: number; displayedScale: number }[]>> = {
  village: [{ actorName: 'elder', name: 'Elder Rowan', x: 387, y: 418, displayedScale: 2.1 }],
  pub: [
    { actorName: 'innkeeper', name: 'Mara the innkeeper', x: 526, y: 348, displayedScale: 2.1 },
    { actorName: 'miner', name: 'Orrin the miner', x: 245, y: 420, displayedScale: 2.1 },
  ],
  camp: [
    { actorName: 'guard', name: 'Grub the guard', x: 568, y: 412, displayedScale: 3.1 },
    { actorName: 'king', name: 'King Aldric', x: 777, y: 344, displayedScale: 2.1 },
  ],
};
const roomPickups: Partial<Record<typeof roomIds[number], { pickupId: string; name: string; x: number; y: number }[]>> = {
  house: [
    { pickupId: 'coin', name: 'Copper coin', x: 516, y: 297 },
    { pickupId: 'rope', name: 'Climbing rope', x: 127, y: 375 },
  ],
  forest: [{ pickupId: 'mushroom', name: 'Dreamcap mushroom', x: 111, y: 409 }],
};
export const scenes = defineSceneManifest({ schemaVersion: 2, prefabs: base, scenes: Object.fromEntries(roomIds.map(roomId => {
  const instances: ScenePrefabInstance[] = [
    createPointleshInstance({ id: `${roomId}.floor`, prefabId: 'pointlesh.area', name: 'Walkable ground & perspective', properties: { walkable: true, scaleEnabled: true, zoomEnabled: true }, overrides: { area: { vertices: roomFloorVertices(roomId), closed: true }, minScale: { value: 0.75 }, maxScale: { value: 1.22 }, minZoom: { value: 1.035 }, maxZoom: { value: 1 } } }),
    createPointleshInstance({ id: `${roomId}.foreground`, prefabId: 'pointlesh.area', name: 'Foreground occlusion', properties: { walkBehindEnabled: true }, overrides: { area: { vertices: roomForegroundVertices(roomId), closed: true }, baseline: { value: 505 } } }),
    createPointleshInstance({ id: `${roomId}.borin`, prefabId: 'forest.rescue-character', name: 'Borin', overrides: { object: { x: 471, y: 462, scaleX: 2.4, scaleY: 2.4 }, speed: { value: 165 }, walkStep: { value: 16 }, frameDurationMs: { value: 100 } } }),
    ...(roomCharacters[roomId] ?? []).map(npc => {
      const targetId = npc.actorName === 'king' ? 'cage' : npc.actorName;
      const target = targets[roomId].find(target => target.id === targetId)!;
      return createPointleshInstance({
        id: `${roomId}.npc.${npc.actorName}`, prefabId: 'pointlesh.character', name: npc.name,
        properties: {
          role: 'npc', actorName: npc.actorName, targetId, description: target.description,
          approachOffsetX: (target.walkX ?? target.x) - npc.x,
          approachOffsetY: (target.walkY ?? Math.max(403, Math.min(494, target.y + 25))) - npc.y,
          displayedScale: npc.displayedScale, animations: characterAnimations(npc.actorName),
        },
        behaviors: ['forest.interact'],
        overrides: { object: { assetId: `character.${npc.actorName}`, x: npc.x, y: npc.y, scaleX: npc.displayedScale, scaleY: npc.displayedScale } },
      });
    }),
    ...(roomPickups[roomId] ?? []).map(pickup => {
      const target = targets[roomId].find(target => target.id === pickup.pickupId)!;
      return createPointleshInstance({
        id: `${roomId}.pickup.${pickup.pickupId}`, prefabId: 'pointlesh.object', name: pickup.name,
        properties: {
          role: 'pickup', pickupId: pickup.pickupId, targetId: target.id, description: target.description, displayedScale: 2,
          approachOffsetX: (target.walkX ?? target.x) - pickup.x,
          approachOffsetY: (target.walkY ?? Math.max(403, Math.min(494, target.y + 25))) - pickup.y,
        },
        behaviors: ['forest.interact'],
        overrides: { object: { assetId: `object.${pickup.pickupId}`, x: pickup.x, y: pickup.y, scaleX: 2, scaleY: 2 } },
      });
    }),
    ...targets[roomId].filter(target => !(roomCharacters[roomId] ?? []).some(npc => npc.actorName !== 'king' && npc.actorName === target.id) && !(roomPickups[roomId] ?? []).some(pickup => pickup.pickupId === target.id)).map(target => createPointleshInstance({ id: target.id, prefabId: 'pointlesh.hotspot', name: target.name, properties: { label: target.name, exit: target.exit ?? '', description: target.description }, behaviors: ['forest.interact'], overrides: { area: { vertices: rectangle(target.x - 34, target.y - 35, 68, 64), closed: true }, approachX: { value: target.walkX ?? target.x }, approachY: { value: target.walkY ?? Math.max(403, Math.min(494, target.y + 25)) } } }))
  ];
  const layer = { ...createLayer({ id: `${roomId}.adventure`, name: 'Adventure prefabs' }), prefabs: instances };
  const scene = { ...createScene({ id: roomId, name: roomNames[roomId], ...roomDimensions[roomId] }), layers: [layer] };
  return [roomId, scene];
})) });
