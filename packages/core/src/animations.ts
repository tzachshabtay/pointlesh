import { assertJSON, type CharacterSnapshot, type Direction } from './types.js';

export const CHARACTER_ANIMATION_ACTIVITIES = ['idle', 'walk', 'speak'] as const;
export const CHARACTER_ANIMATION_DIRECTIONS = ['front', 'back', 'left', 'right', 'front-left', 'front-right', 'back-left', 'back-right'] as const;
export type CharacterAnimationActivity = typeof CHARACTER_ANIMATION_ACTIVITIES[number];
export type CharacterAnimationDirection = typeof CHARACTER_ANIMATION_DIRECTIONS[number];
/** key is an ai-assets animation key or a linked animation state on assetId. */
export type CharacterAnimationAssignment = { assetId: string; key: string; flipX?: boolean };
export type CharacterAnimations = Partial<Record<CharacterAnimationActivity, Partial<Record<CharacterAnimationDirection, CharacterAnimationAssignment>>>>;

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export function assertCharacterAnimations(value: unknown): asserts value is CharacterAnimations {
  assertJSON(value);
  if (!object(value)) throw new Error('Character animations must be an object');
  for (const [activity, directions] of Object.entries(value)) {
    if (!(CHARACTER_ANIMATION_ACTIVITIES as readonly string[]).includes(activity) || !object(directions)) throw new Error(`Invalid character animation activity: ${activity}`);
    for (const [direction, assignment] of Object.entries(directions)) {
      if (!(CHARACTER_ANIMATION_DIRECTIONS as readonly string[]).includes(direction) || !object(assignment) ||
        typeof assignment.assetId !== 'string' || !assignment.assetId.trim() || typeof assignment.key !== 'string' || !assignment.key.trim() ||
        (assignment.flipX !== undefined && typeof assignment.flipX !== 'boolean')) throw new Error(`Invalid character animation assignment: ${activity}.${direction}`);
    }
  }
}

/** Read the typed built-in property from a resolved prefab's extensible JSON properties. */
export function readCharacterAnimations(properties: Readonly<Record<string, unknown>>): CharacterAnimations | undefined {
  if (properties.animations === undefined) return undefined;
  assertCharacterAnimations(properties.animations);
  return structuredClone(properties.animations);
}

/** Sparse instance overrides inherit untouched slots; each assignment replaces its entire slot. */
export function mergeCharacterAnimations(base: CharacterAnimations | undefined, overrides: CharacterAnimations | undefined): CharacterAnimations {
  if (base !== undefined) assertCharacterAnimations(base);
  if (overrides !== undefined) assertCharacterAnimations(overrides);
  const result: CharacterAnimations = {};
  for (const activity of CHARACTER_ANIMATION_ACTIVITIES) {
    if (base?.[activity] || overrides?.[activity]) result[activity] = structuredClone({ ...base?.[activity], ...overrides?.[activity] });
  }
  return result;
}

const facingSlots: Record<Direction, CharacterAnimationDirection> = {
  down: 'front', up: 'back', left: 'left', right: 'right',
  'down-left': 'front-left', 'down-right': 'front-right', 'up-left': 'back-left', 'up-right': 'back-right',
};

/** Missing diagonals use their front/back view; missing walk/speak art uses idle for that facing. */
export function resolveCharacterAnimation(animations: CharacterAnimations | undefined, activity: CharacterSnapshot['activity'], facing: Direction): CharacterAnimationAssignment | undefined {
  if (animations === undefined) return undefined;
  assertCharacterAnimations(animations);
  const state = activity === 'walking' ? 'walk' : activity === 'speaking' ? 'speak' : 'idle';
  const slot = facingSlots[facing];
  const cardinal = slot.startsWith('front-') ? 'front' : slot.startsWith('back-') ? 'back' : slot;
  const assignment = animations[state]?.[slot] ?? animations[state]?.[cardinal] ?? animations.idle?.[slot] ?? animations.idle?.[cardinal];
  return assignment ? structuredClone(assignment) : undefined;
}
