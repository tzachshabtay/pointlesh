import { spokenLines } from './spoken-lines';
export const roomIds = ['village', 'pub', 'house', 'forest', 'mine', 'camp'] as const;
export type RoomId = typeof roomIds[number];
export const roomNames: Record<RoomId, string> = { village: 'Bramblehollow', pub: 'The Copper Tankard', house: 'Borin’s Cottage', forest: 'The Whispering Wood', mine: 'The Goldroot Mine', camp: 'The Orc Encampment' };
export const items = {
  coin: { name: 'Copper coin', description: 'One copper. A small fortune before breakfast.' },
  rope: { name: 'Climbing rope', description: 'Strong dwarven rope. A few good knots should hold even an orc.' },
  stout: { name: 'Honey stout', description: 'Orcs cannot resist the smell. Combine it with something soporific.' },
  mushroom: { name: 'Dreamcap', description: 'A harmless sleeping mushroom. Best served in a drink.' },
  sleepyStout: { name: 'Dreamcap stout', description: 'An exceptionally relaxing brew.' },
  pickaxe: { name: 'Goldroot pickaxe', description: 'The dwarven answer to a stubborn lock.' }
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
  chestOpening?: { elapsedMs: number };
  tyingGuard?: { elapsedMs: number };
}
export function newStory(): StoryState {
  return { roomId: 'village', inventory: [], flags: {}, journal: ['King Aldric was taken east. Find a way into the orc camp.'], guardClock: 0, introStep: 0, endingStep: -1 };
}
/** Return a spent cage rope in older saves so the revised rescue stays solvable. */
export function migrateRescueStory(source: StoryState): StoryState {
  const state = structuredClone(source);
  if (state.flags.ropeTied) {
    delete state.flags.ropeTied;
    state.journal = state.journal.filter(line => line !== 'The rope is secured to the cage. Now break the lock.');
    if (state.flags.won) state.flags.guardBound = true;
    else if (!state.flags.guardBound && !state.inventory.includes('rope')) {
      state.inventory.push('rope');
      state.journal.push('The climbing rope is back in my satchel. It could secure the sleeping guard.');
    }
  }
  if (state.flags.tookPickaxe) state.flags.chestOpen = true;
  if (state.flags.won && state.endingStep < 0) state.endingStep = 4;
  return state;
}
export function guardLookingAway(state: StoryState): boolean { return state.flags.guardDistracted === true; }
export function finishGuardDrink(state: StoryState): boolean {
  if (!state.flags.stewSpiked) return false;
  addClue(state, 'guardAsleep', 'Grub drank the doctored stew. His snores are shaking the palisade.');
  return true;
}
export function addClue(state: StoryState, flag: string, clue: string): void {
  if (!state.flags[flag]) { state.flags[flag] = true; state.journal.push(clue); }
}
export function combineItems(state: StoryState, first: ItemId, second: ItemId): string {
  if (!state.inventory.includes(first) || !state.inventory.includes(second)) return spokenLines["i-need-both-things-in-my-satchel"].text;
  if ([first, second].includes('stout') && [first, second].includes('mushroom')) {
    state.inventory = state.inventory.filter(item => item !== 'stout' && item !== 'mushroom');
    state.inventory.push('sleepyStout');
    addClue(state, 'mixedBrew', 'The dreamcap stout is ready. Add it to the camp’s cauldron while the guard looks away.');
    return spokenLines["a-pinch-of-dreamcap-a-splash-of"].text;
  }
  return spokenLines["an-inspired-idea-unfortunately-inspiration-is-not"].text;
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
    { id: 'house-exit', name: 'Back to the village', x: 874, y: 336, walkX: 740, walkY: 440, exit: 'village', description: 'There is a king out there who needs me.' }
  ],
  pub: [
    { id: 'innkeeper', name: 'Mara the innkeeper', x: 526, y: 348, walkY: 421, description: 'A brewer, a storyteller, and a formidable keeper of tabs.' },
    { id: 'miner', name: 'Orrin the miner', x: 245, y: 420, description: 'Orrin warms his boots and guards the mine’s secrets.' },
    { id: 'pub-exit', name: 'Back to the village', x: 863, y: 448, exit: 'village', description: 'The morning air might clear my head.' }
  ],
  forest: [
    { id: 'mushroom', name: 'Dreamcap mushrooms', x: 111, y: 409, walkY: 448, description: 'Violet caps with silver spots. Mara will know what they do.' },
    { id: 'mine-path', name: 'Goldroot Mine', x: 274, y: 285, walkX: 440, walkY: 460, exit: 'mine', description: 'A lantern flickers in the old gold mine.' },
    { id: 'camp-path', name: 'Orc encampment', x: 1385, y: 275, walkY: 410, exit: 'camp', description: 'A crooked palisade. Smoke. Terrible singing.' },
    { id: 'forest-exit', name: 'Bramblehollow', x: 471, y: 490, exit: 'village', description: 'The path home winds between the roots.' }
  ],
  mine: [
    { id: 'tool-chest', name: 'Runed tool chest', x: 258, y: 400, description: 'The inscription reads: “What does the mountain remember?”' },
    { id: 'gold', name: 'Gold seam', x: 658, y: 331, walkY: 432, description: 'All that glitters. It can wait until the king is safe.' },
    { id: 'mine-exit', name: 'Back to the wood', x: 440, y: 510, walkY: 497, exit: 'forest', description: 'Cool air drifts in from the forest.' }
  ],
  camp: [
    { id: 'cauldron', name: 'Stew cauldron', x: 306, y: 398, walkX: 402, walkY: 466, description: 'The orcs’ supper. Even a sleeping potion would improve it.' },
    { id: 'guard', name: 'Grub the guard', x: 568, y: 412, description: 'An enormous orc with a well-worn route between the cage and the stew.' },
    { id: 'cage', name: 'King Aldric’s cage', x: 777, y: 344, walkX: 721, walkY: 450, description: 'A heavy lock keeps the king in this wooden cage. One good strike should open it.' },
    { id: 'camp-exit', name: 'Back to the wood', x: 90, y: 474, exit: 'forest', description: 'A discreet retreat is also a kind of strategy.' }
  ]
};
/** Stateful descriptions run through the same speech/voice lookup as other Borin lines. */
export function lookAtTarget(state: StoryState, targetId: string, fallback: string): string {
  if (state.roomId === 'mine' && targetId === 'tool-chest') {
    if (state.flags.tookPickaxe) return spokenLines['look-chest-empty'].text;
    if (state.flags.chestOpen) return spokenLines['look-chest-open'].text;
  }
  return fallback;
}
export function targetVisible(state: StoryState, id: string): boolean {
  return !(id === 'coin' && state.flags.tookCoin || id === 'rope' && state.flags.tookRope || id === 'mushroom' && state.flags.tookMushroom);
}
export type InteractionResult = { text?: string; speaker?: string; dialog?: string; room?: RoomId; ending?: boolean; action?: 'tie-guard' };
/** Called after an accepted pour finishes; the guard check happens before raising the mug. */
export function finishPouringBrew(state: StoryState): InteractionResult {
  if (!state.inventory.includes('sleepyStout') || state.flags.stewSpiked) return {};
  state.inventory = state.inventory.filter(value => value !== 'sleepyStout');
  addClue(state, 'stewSpiked', 'The dreamcap stout is in the stew. Now wait for Grub’s next drink.');
  return { text: spokenLines["a-discreet-splash-now-to-wait-for"].text };
}
export function finishTyingGuard(state: StoryState): InteractionResult {
  if (!state.tyingGuard || !state.flags.guardAsleep || !state.inventory.includes('rope')) return {};
  delete state.tyingGuard;
  state.inventory = state.inventory.filter(item => item !== 'rope');
  addClue(state, 'guardBound', 'Grub is securely tied up. Even if the lock wakes him, he cannot stop us.');
  return { text: spokenLines["the-knots-are-secure-if-the-noise"].text };
}
export function interact(state: StoryState, targetId: string, item?: ItemId): InteractionResult {
  if (state.tyingGuard || state.chestOpening) return {};
  const target = targets[state.roomId].find(target => target.id === targetId);
  if (!target || !targetVisible(state, targetId)) return { text: spokenLines["nothing-to-do-here"].text };
  if (item && !state.inventory.includes(item)) return { text: spokenLines["that-is-no-longer-in-my-satchel"].text };
  if (item) {
    if (item === 'coin' && targetId === 'innkeeper') {
      state.inventory = state.inventory.filter(value => value !== 'coin'); state.inventory.push('stout');
      addClue(state, 'boughtStout', 'Mara sold me honey stout. Orcs love its smell.');
      return { speaker: 'Mara', text: spokenLines["stout-sale"].text };
    }
    if (item === 'sleepyStout' && targetId === 'cauldron') {
      if (!guardLookingAway(state)) return { text: spokenLines["he-is-watching-wait-until-he-turns"].text };
      return finishPouringBrew(state);
    }
    if (item === 'rope' && targetId === 'guard') {
      if (!state.flags.guardAsleep) return { text: spokenLines["he-would-never-let-me-tie-him"].text };
      state.tyingGuard = { elapsedMs: 0 };
      return { action: 'tie-guard' };
    }
    if (item === 'pickaxe' && targetId === 'cage') {
      if (!state.flags.guardAsleep) return { text: spokenLines["one-clang-and-that-guard-will-catch"].text };
      if (!state.flags.guardBound) return { text: spokenLines["breaking-the-lock-might-wake-him-i"].text };
      addClue(state, 'won', 'King Aldric is free. Bramblehollow will have its king—and a new story.');
      state.endingStep = 0;
      return { ending: true };
    }
    return { text: spokenLines["i-cannot-see-how-that-would-help"].text };
  }
  if (target.exit) { state.roomId = target.exit; return { room: target.exit }; }
  if (targetId === 'coin' || targetId === 'rope') {
    state.inventory.push(targetId); state.flags[targetId === 'coin' ? 'tookCoin' : 'tookRope'] = true;
    return { text: targetId === 'coin' ? spokenLines["one-copper-coin-enough-to-buy-an"].text : spokenLines["never-go-on-a-rescue-without-a"].text };
  }
  if (targetId === 'mushroom') {
    if (!state.flags.knowsDreamcap) return { text: spokenLines["i-should-ask-someone-about-these-before"].text };
    state.inventory.push('mushroom'); state.flags.tookMushroom = true;
    return { text: spokenLines["a-dreamcap-mara-said-it-makes-a"].text };
  }
  if (targetId === 'elder' || targetId === 'innkeeper' || targetId === 'miner') return { dialog: targetId };
  if (targetId === 'tool-chest') {
    if (state.flags.tookPickaxe) return { text: spokenLines["the-tool-chest-is-empty-its-pickaxe"].text };
    if (state.flags.chestOpen) {
      state.inventory.push('pickaxe');
      addClue(state, 'tookPickaxe', 'The runed chest yielded a pickaxe. It should break the king’s lock.');
      return { text: spokenLines["orrins-finest-pickaxe-for-the-king"].text };
    }
    return { dialog: state.flags.knowsPassword ? 'chest-open' : 'chest-locked' };
  }
  if (targetId === 'guard') return { speaker: state.flags.guardAsleep || state.flags.guardBound ? 'Borin' : 'Orc guard', text: state.flags.guardBound ? spokenLines["sound-asleep-and-securely-tied-those-knots"].text : state.flags.guardAsleep ? spokenLines["sound-asleep-but-breaking-that-lock-could"].text : spokenLines["no-visitors"].text };
  if (targetId === 'cage') return { speaker: 'King Aldric', text: state.flags.guardBound ? spokenLines["bound-guard"].text : state.flags.guardAsleep ? spokenLines["tie-guard"].text : spokenLines["quietly"].text };
  return { text: target.description };
}
export function applyDialogChoice(state: StoryState, optionId: string): void {
  if (optionId === 'dreamcap') addClue(state, 'knowsDreamcap', 'Mara says dreamcaps grow in the wood. Mix one with honey stout to make a sleeping draught.');
  if (optionId === 'password') addClue(state, 'knowsPassword', 'Orrin’s secret: the tool chest opens to “Stone remembers.”');
  if (optionId === 'open-chest' && state.flags.knowsPassword && !state.flags.chestOpen && !state.flags.tookPickaxe && !state.chestOpening) state.chestOpening = { elapsedMs: 0 };
}
export function finishOpeningChest(state: StoryState): void {
  if (!state.chestOpening) return;
  delete state.chestOpening;
  state.flags.chestOpen = true;
}
export function hint(state: StoryState): string {
  if (!state.flags.tookCoin || !state.flags.tookRope) return spokenLines["start-at-home-a-copper-coin-and"].text;
  if (!state.flags.knowsDreamcap || !state.flags.knowsPassword) return spokenLines["visit-the-pub-ask-mara-about-the"].text;
  if (!state.flags.boughtStout) return spokenLines["select-the-copper-coin-in-your-satchel"].text;
  if (!state.flags.tookMushroom) return spokenLines["mara-described-the-silverspotted-mushrooms-beside-the"].text;
  if (!state.flags.mixedBrew) return spokenLines["select-the-dreamcap-then-select-the-stout"].text;
  if (state.flags.chestOpen && !state.flags.tookPickaxe) return spokenLines["search-the-open-chest-for-orrins-pickaxe"].text;
  if (!state.flags.tookPickaxe) return spokenLines["the-runed-chest-in-goldroot-mine-opens"].text;
  if (!state.flags.guardAsleep) return state.flags.stewSpiked ? spokenLines["the-stew-is-ready-let-grub-finish"].text : spokenLines["at-the-camp-use-the-dreamcap-stout"].text;
  if (!state.flags.guardBound) return spokenLines["use-the-climbing-rope-on-the-sleeping"].text;
  if (!state.flags.won) return spokenLines["use-the-pickaxe-on-the-cages-lock"].text;
  return spokenLines["the-king-is-home-there-are-worse"].text;
}
export const intro = [
  { speaker: 'Bramblehollow · before dawn', narration: 'dawn', text: 'The orcs found the king’s road.' },
  { speaker: 'King Aldric', text: spokenLines["abduction"].text },
  { speaker: 'The eastern camp', narration: 'camp', text: 'By nightfall, their captain would return. The king was running out of time.' }
];
export const introArrivalLine = spokenLines["intro-arrival"].text;
export const ending = [
  { speaker: 'Borin', text: spokenLines["lock-strike"].text },
  { speaker: 'King Aldric', text: spokenLines["free"].text },
  { speaker: 'Borin', text: spokenLines["homeward"].text },
  { speaker: 'Bramblehollow · home again', narration: 'homecoming', text: 'Tankards rose for the smallest rescue party in dwarven history.' }
];
