export const roomIds = ['village', 'pub', 'house', 'forest', 'mine', 'camp'] as const;
export type RoomId = typeof roomIds[number];
export const roomNames: Record<RoomId, string> = { village: 'Bramblehollow', pub: 'The Copper Tankard', house: 'Borin’s Cottage', forest: 'The Whispering Wood', mine: 'The Goldroot Mine', camp: 'The Orc Encampment' };
export const items = {
  coin: { name: 'Copper coin', icon: '◉', description: 'One copper. A small fortune before breakfast.' },
  rope: { name: 'Climbing rope', icon: '∞', description: 'Strong enough to lower a king. Probably.' },
  stout: { name: 'Honey stout', icon: '▥', description: 'Orcs cannot resist the smell. Combine it with something soporific.' },
  mushroom: { name: 'Dreamcap', icon: '♠', description: 'A harmless sleeping mushroom. Best served in a drink.' },
  sleepyStout: { name: 'Dreamcap stout', icon: '◈', description: 'An exceptionally relaxing brew.' },
  pickaxe: { name: 'Goldroot pickaxe', icon: '⚒', description: 'The dwarven answer to a stubborn lock.' }
} as const;
export type ItemId = keyof typeof items;
export interface StoryState {
  roomId: RoomId;
  inventory: ItemId[];
  flags: Record<string, boolean>;
  journal: string[];
  guardClock: number;
  introStep: number;
  endingStep: number;
}
export function newStory(): StoryState {
  return { roomId: 'village', inventory: [], flags: {}, journal: ['King Aldric was taken east. Find a way into the orc camp.'], guardClock: 0, introStep: 0, endingStep: -1 };
}
export function guardLookingAway(state: StoryState): boolean { return state.guardClock % 7200 >= 4100; }
export function addClue(state: StoryState, flag: string, clue: string): void {
  if (!state.flags[flag]) { state.flags[flag] = true; state.journal.push(clue); }
}
export function combineItems(state: StoryState, first: ItemId, second: ItemId): string {
  if (!state.inventory.includes(first) || !state.inventory.includes(second)) return 'I need both things in my satchel first.';
  if ([first, second].includes('stout') && [first, second].includes('mushroom')) {
    state.inventory = state.inventory.filter(item => item !== 'stout' && item !== 'mushroom');
    state.inventory.push('sleepyStout');
    addClue(state, 'mixedBrew', 'The dreamcap stout is ready. Add it to the camp’s cauldron while the guard looks away.');
    return 'A pinch of dreamcap, a splash of stout. Sweet dreams, large unpleasant fellow.';
  }
  return 'An inspired idea. Unfortunately, inspiration is not enough here.';
}
export type Target = { id: string; name: string; x: number; y: number; walkX?: number; walkY?: number; exit?: RoomId; description: string };
export const targets: Record<RoomId, Target[]> = {
  village: [
    { id: 'pub-door', name: 'The Copper Tankard', x: 221, y: 340, exit: 'pub', description: 'The windows glow with breakfast, gossip, and questionable decisions.' },
    { id: 'home-door', name: 'My cottage', x: 752, y: 356, exit: 'house', description: 'Home. I should take supplies before venturing into the wood.' },
    { id: 'forest-path', name: 'Forest path', x: 508, y: 310, exit: 'forest', description: 'Fresh orc tracks head east beneath the ancient trees.' },
    { id: 'elder', name: 'Elder Rowan', x: 387, y: 418, description: 'The oldest beard in Bramblehollow. He knows every story.' }
  ],
  house: [
    { id: 'coin', name: 'Copper coin', x: 516, y: 297, walkY: 421, description: 'My emergency breakfast fund.' },
    { id: 'rope', name: 'Climbing rope', x: 127, y: 375, walkY: 443, description: 'A coil of good dwarven climbing rope on the old chest.' },
    { id: 'house-exit', name: 'Back to the village', x: 874, y: 336, exit: 'village', description: 'There is a king out there who needs me.' }
  ],
  pub: [
    { id: 'innkeeper', name: 'Mara the innkeeper', x: 526, y: 348, walkY: 421, description: 'A brewer, a storyteller, and a formidable keeper of tabs.' },
    { id: 'miner', name: 'Orrin the miner', x: 245, y: 420, description: 'Orrin warms his boots and guards the mine’s secrets.' },
    { id: 'pub-exit', name: 'Back to the village', x: 863, y: 448, exit: 'village', description: 'The morning air might clear my head.' }
  ],
  forest: [
    { id: 'mushroom', name: 'Dreamcap mushrooms', x: 111, y: 409, walkY: 448, description: 'Violet caps with silver spots. Mara will know what they do.' },
    { id: 'mine-path', name: 'Goldroot Mine', x: 253, y: 295, exit: 'mine', description: 'A lantern flickers in the old gold mine.' },
    { id: 'camp-path', name: 'Orc encampment', x: 784, y: 293, exit: 'camp', description: 'A crooked palisade. Smoke. Terrible singing.' },
    { id: 'forest-exit', name: 'Bramblehollow', x: 471, y: 490, exit: 'village', description: 'The path home winds between the roots.' }
  ],
  mine: [
    { id: 'tool-chest', name: 'Runed tool chest', x: 258, y: 400, description: 'The inscription reads: “What does the mountain remember?”' },
    { id: 'gold', name: 'Gold seam', x: 658, y: 331, walkY: 432, description: 'All that glitters. It can wait until the king is safe.' },
    { id: 'mine-exit', name: 'Back to the wood', x: 68, y: 459, exit: 'forest', description: 'Cool air drifts in from the forest.' }
  ],
  camp: [
    { id: 'cauldron', name: 'Stew cauldron', x: 306, y: 398, walkX: 402, walkY: 466, description: 'The orcs’ supper. Even a sleeping potion would improve it.' },
    { id: 'guard', name: 'Grub the guard', x: 568, y: 412, description: 'An enormous orc. He turns away to inspect the stew every few seconds.' },
    { id: 'cage', name: 'King Aldric’s cage', x: 777, y: 344, walkX: 721, walkY: 450, description: 'The king is imprisoned above a steep ledge. I need a safe way down.' },
    { id: 'camp-exit', name: 'Back to the wood', x: 90, y: 474, exit: 'forest', description: 'A discreet retreat is also a kind of strategy.' }
  ]
};
export function targetVisible(state: StoryState, id: string): boolean {
  return !(id === 'coin' && state.flags.tookCoin || id === 'rope' && state.flags.tookRope || id === 'mushroom' && state.flags.tookMushroom);
}
export type InteractionResult = { text?: string; dialog?: string; room?: RoomId; ending?: boolean };
export function interact(state: StoryState, targetId: string, item?: ItemId): InteractionResult {
  const target = targets[state.roomId].find(target => target.id === targetId);
  if (!target || !targetVisible(state, targetId)) return { text: 'Nothing to do here.' };
  if (item && !state.inventory.includes(item)) return { text: 'That is no longer in my satchel.' };
  if (item) {
    if (item === 'coin' && targetId === 'innkeeper') {
      state.inventory = state.inventory.filter(value => value !== 'coin'); state.inventory.push('stout');
      addClue(state, 'boughtStout', 'Mara sold me honey stout. Orcs love its smell.');
      return { text: 'Mara: One honey stout. If you are taking that to the orcs, please do not tell them who brewed it.' };
    }
    if (item === 'sleepyStout' && targetId === 'cauldron') {
      if (!guardLookingAway(state)) return { text: 'He is watching! Wait until he turns his back, then try the brew again.' };
      state.inventory = state.inventory.filter(value => value !== item);
      addClue(state, 'guardAsleep', 'Grub drank the doctored stew. His snores are shaking the palisade.');
      return { text: 'A discreet splash. One enthusiastic taste. Grub falls asleep mid-complaint.' };
    }
    if (item === 'rope' && targetId === 'cage') {
      if (!state.flags.guardAsleep) return { text: 'The guard would hear me. I need to send him to sleep first.' };
      state.inventory = state.inventory.filter(value => value !== item);
      addClue(state, 'ropeTied', 'The rope is secured to the cage. Now break the lock.');
      return { text: 'The rope is secure, Your Majesty. An undignified descent is better than an orc supper.' };
    }
    if (item === 'pickaxe' && targetId === 'cage') {
      if (!state.flags.guardAsleep) return { text: 'One clang and that guard will catch us. Quiet first, heroics second.' };
      if (!state.flags.ropeTied) return { text: 'That ledge is too high. I should secure a rope before breaking the cage open.' };
      addClue(state, 'won', 'King Aldric is free. Bramblehollow will have its king—and a new story.');
      state.endingStep = 0;
      return { ending: true };
    }
    return { text: 'I cannot see how that would help here.' };
  }
  if (target.exit) { state.roomId = target.exit; return { room: target.exit }; }
  if (targetId === 'coin' || targetId === 'rope') {
    state.inventory.push(targetId); state.flags[targetId === 'coin' ? 'tookCoin' : 'tookRope'] = true;
    return { text: targetId === 'coin' ? 'One copper coin. Enough to buy an idea a drink.' : 'Never go on a rescue without a rope. Father was quite firm about that.' };
  }
  if (targetId === 'mushroom') {
    if (!state.flags.knowsDreamcap) return { text: 'I should ask someone about these before I put them in my bag. Or my mouth.' };
    state.inventory.push('mushroom'); state.flags.tookMushroom = true;
    return { text: 'A dreamcap. Mara said it makes a very effective sleeping draught when mixed with stout.' };
  }
  if (targetId === 'elder' || targetId === 'innkeeper' || targetId === 'miner') return { dialog: targetId };
  if (targetId === 'tool-chest') {
    if (state.flags.tookPickaxe) return { text: 'The tool chest is empty. Its pickaxe is in capable, if rather small, hands.' };
    return { dialog: state.flags.knowsPassword ? 'chest-open' : 'chest-locked' };
  }
  if (targetId === 'guard') return { text: state.flags.guardAsleep ? 'A beautiful sound. I never thought I would say that about an orc snoring.' : 'Grub: No visitors! Especially short ones with suspiciously heroic expressions.' };
  if (targetId === 'cage') return { text: state.flags.guardAsleep ? 'Aldric: Borin! A rope for the drop and something to break this lock. Quickly, lad!' : 'Aldric whispers: Borin, deal with the guard. Quietly!' };
  return { text: target.description };
}
export function applyDialogChoice(state: StoryState, optionId: string): void {
  if (optionId === 'dreamcap') addClue(state, 'knowsDreamcap', 'Mara says dreamcaps grow in the wood. Mix one with honey stout to make a sleeping draught.');
  if (optionId === 'password') addClue(state, 'knowsPassword', 'Orrin’s secret: the tool chest opens to “Stone remembers.”');
  if (optionId === 'open-chest' && !state.flags.tookPickaxe) {
    state.inventory.push('pickaxe'); addClue(state, 'tookPickaxe', 'The runed chest yielded a pickaxe. It should break the king’s lock.');
  }
}
export function hint(state: StoryState): string {
  if (!state.flags.tookCoin || !state.flags.tookRope) return 'Start at home. A copper coin and a strong rope may come in handy.';
  if (!state.flags.knowsDreamcap || !state.flags.knowsPassword) return 'Visit the pub. Ask Mara about the orcs and Orrin about the mine.';
  if (!state.flags.boughtStout) return 'Select the copper coin in your satchel, then give it to Mara.';
  if (!state.flags.tookMushroom) return 'Mara described the silver-spotted mushrooms beside the forest path.';
  if (!state.flags.mixedBrew) return 'Select the dreamcap, then select the stout to combine them.';
  if (!state.flags.tookPickaxe) return 'The runed chest in Goldroot Mine opens with Orrin’s words.';
  if (!state.flags.guardAsleep) return 'At the camp, use the dreamcap stout on the cauldron when the guard turns away.';
  if (!state.flags.ropeTied) return 'Tie your rope to the cage so the king can climb down safely.';
  if (!state.flags.won) return 'Use the pickaxe on the cage’s lock. The way home is almost open.';
  return 'The king is home. There are worse reasons to have another round.';
}
export const intro = [
  { speaker: 'Bramblehollow · before dawn', text: 'For three hundred years, the forest kept the dwarven village hidden. Then the orcs found the king’s road.' },
  { speaker: 'King Aldric', text: 'They came through the mist. I sent the others home… but an old king is not as quick as he remembers.' },
  { speaker: 'Elder Rowan', text: 'They have taken Aldric to the eastern camp. Their captain will return by nightfall. Borin, we need a quieter kind of hero.' },
  { speaker: 'Borin', text: 'A quieter hero? I am a dwarf in iron boots. But he is our king. I will bring him home.' }
];
export const ending = [
  { speaker: 'Borin', text: 'One good strike. The lock falls. Aldric grips the rope, and the forest swallows two very relieved dwarves.' },
  { speaker: 'King Aldric', text: 'No army. No grand battle. Just a clever head, a stout rope, and… is that Mara’s honey stout?' },
  { speaker: 'Borin', text: 'A vital diplomatic expense, Your Majesty.' },
  { speaker: 'Bramblehollow · home again', text: 'That evening, the village raised its tankards to the smallest rescue party in dwarven history. And far away, Grub slept through supper.' }
];
