import { defineAiAssets, type AiAssetDefinition } from '@ai-game-assets/core';
import { defineDialogManifest, type DialogDefinition, type DialogNode } from '@dialog-designer/core';
import { createPointleshInstance, pointleshPrefabs, extendPointleshPrefab } from '@pointlesh/core';
import { createLayer, createScene, defineSceneManifest, type ScenePrefabInstance } from '@scene-designer/core';
import { roomIds, roomNames, targets } from './story';

export const atlasRooms = {
  village: { asset: 'background.village-pub', row: 0 }, pub: { asset: 'background.village-pub', row: 1 },
  house: { asset: 'background.house-forest', row: 0 }, forest: { asset: 'background.house-forest', row: 1 },
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
for (const id of ['borin', 'elder', 'innkeeper', 'miner', 'guard', 'king']) {
  definitions[`character.${id}`] = { id: `character.${id}`, kind: 'image', prompt: `A small pixel-art ${id === 'guard' ? 'orc guard' : 'dwarf named ' + id}, full body, transparent background.`, dimensions: { width: 24, height: 32 }, activeVersion: '', versions: {} };
}
for (const [id, description] of Object.entries({ coin: 'A small gleaming copper coin', rope: 'A coil of sturdy dwarven climbing rope', mushroom: 'A purple dreamcap mushroom with silver spots' })) {
  definitions[`object.${id}`] = { id: `object.${id}`, kind: 'image', prompt: `${description}, pixel art, transparent background.`, dimensions: { width: 16, height: 16 }, activeVersion: '', versions: {} };
}
for (const [id, label] of Object.entries({ borin: 'Borin', elder: 'Elder Rowan', innkeeper: 'Mara', miner: 'Orrin', chest: 'The runed chest' })) {
  definitions[`voice.${id}`] = { id: `voice.${id}`, kind: 'voice', prompt: `Warm fantasy storytelling voice for ${label}.`, activeVersion: '', versions: {} };
}
function dialog(id: string, speaker: string, greeting: string, options: { id: string; text: string; reply: string }[]): DialogDefinition {
  const nodes: Record<string, DialogNode> = {};
  const line = (key: string, text: string) => {
    const assetId = `line.${id}.${key}`;
    definitions[assetId] = { id: assetId, kind: 'voice-line', prompt: text, voiceSettings: { voiceAssetId: `voice.${speaker}`, text }, activeVersion: '', versions: {} };
    return { id: key, enabled: true, voiceAssetId: `voice.${speaker}`, lineAssetId: assetId };
  };
  nodes.opening = { id: 'opening', type: 'block', name: 'Greeting', enabled: true, lines: [line('greeting', greeting)], nextNodeId: 'topics' };
  nodes.topics = { id: 'topics', type: 'decision', name: 'Topics', prompt: 'What will you say?', enabled: true, options: options.map(option => ({ id: option.id, text: option.text, enabled: true, nextNodeId: `answer-${option.id}` })) };
  for (const option of options) nodes[`answer-${option.id}`] = { id: `answer-${option.id}`, type: 'block', name: option.text, enabled: true, lines: [line(option.id, option.reply)] };
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
export const assets = defineAiAssets(definitions);

const base = pointleshPrefabs({ characterAssetId: 'character.borin', objectAssetId: 'object.coin' });
base['forest.rescue-character'] = extendPointleshPrefab(base['pointlesh.character'], {
  id: 'forest.rescue-character', name: 'Rescue character', properties: { role: 'player', courage: 10 }, behaviors: ['forest.rescue'],
  propertySchema: { courage: { type: 'number', label: 'Courage', min: 0, max: 100 }, role: { type: 'string', label: 'Story role' } }
});
const rectangle = (x: number, y: number, width: number, height: number) => [
  { id: 'a', x, y }, { id: 'b', x: x + width, y }, { id: 'c', x: x + width, y: y + height }, { id: 'd', x, y: y + height }
];
const roomCharacters: Partial<Record<typeof roomIds[number], { actorName: string; name: string; x: number; y: number; displayedScale: number }[]>> = {
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
    createPointleshInstance({ id: `${roomId}.floor`, prefabId: 'pointlesh.walkable', name: 'Walkable ground', overrides: { area: { vertices: rectangle(35, 355, 890, 160), closed: true } } }),
    createPointleshInstance({ id: `${roomId}.perspective`, prefabId: 'pointlesh.scale', name: 'Room perspective', overrides: { area: { vertices: rectangle(0, 315, 960, 225), closed: true }, minScale: { value: 0.75 }, maxScale: { value: 1.22 } } }),
    createPointleshInstance({ id: `${roomId}.zoom`, prefabId: 'pointlesh.zoom', name: 'Gentle camera approach', overrides: { area: { vertices: rectangle(0, 315, 960, 225), closed: true }, minZoom: { value: 1.035 }, maxZoom: { value: 1 } } }),
    createPointleshInstance({ id: `${roomId}.foreground`, prefabId: 'pointlesh.walk-behind', name: 'Foreground occlusion', overrides: { area: { vertices: rectangle(roomId === 'forest' ? 0 : 0, 200, roomId === 'forest' ? 163 : 80, 340), closed: true }, baseline: { value: 505 } } }),
    createPointleshInstance({ id: `${roomId}.borin`, prefabId: 'forest.rescue-character', name: 'Borin', overrides: { object: { x: 471, y: 462, scaleX: 2.4, scaleY: 2.4 }, speed: { value: 165 }, walkStep: { value: 16 }, frameDurationMs: { value: 100 } } }),
    ...(roomCharacters[roomId] ?? []).map(npc => createPointleshInstance({
      id: `${roomId}.npc.${npc.actorName}`, prefabId: 'pointlesh.character', name: npc.name,
      properties: { role: 'npc', actorName: npc.actorName, displayedScale: npc.displayedScale },
      overrides: { object: { assetId: `character.${npc.actorName}`, x: npc.x, y: npc.y, scaleX: npc.displayedScale, scaleY: npc.displayedScale } },
    })),
    ...(roomPickups[roomId] ?? []).map(pickup => createPointleshInstance({
      id: `${roomId}.pickup.${pickup.pickupId}`, prefabId: 'pointlesh.object', name: pickup.name,
      properties: { role: 'pickup', pickupId: pickup.pickupId, displayedScale: 2 },
      overrides: { object: { assetId: `object.${pickup.pickupId}`, x: pickup.x, y: pickup.y, scaleX: 2, scaleY: 2 } },
    })),
    ...targets[roomId].map(target => createPointleshInstance({ id: target.id, prefabId: 'pointlesh.hotspot', name: target.name, properties: { label: target.name, exit: target.exit ?? '', description: target.description }, behaviors: ['forest.interact'], overrides: { area: { vertices: rectangle(target.x - 34, target.y - 35, 68, 64), closed: true }, approachX: { value: target.walkX ?? target.x }, approachY: { value: target.walkY ?? Math.max(403, Math.min(494, target.y + 25)) } } }))
  ];
  const layer = { ...createLayer({ id: `${roomId}.adventure`, name: 'Adventure prefabs' }), prefabs: instances };
  const scene = { ...createScene({ id: roomId, name: roomNames[roomId], width: 960, height: 540 }), layers: [layer] };
  return [roomId, scene];
})) });
