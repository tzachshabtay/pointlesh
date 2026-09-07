/** Browser/world coordinates: X increases rightward; Y increases downward. */
export interface Point { x: number; y: number }
export type Polygon = Point[];
export type JSONValue = null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue };
export type JSONObject = { [key: string]: JSONValue };
export type Direction = 'up' | 'down' | 'left' | 'right' | 'up-left' | 'up-right' | 'down-left' | 'down-right';
export type CharacterActivity = 'idle' | 'walking' | 'speaking';
export type ApproachMode = 'none' | 'face' | 'walk-if-point' | 'walk';

export interface CharacterSnapshot {
  id: string;
  position: Point;
  facing: Direction;
  activity: CharacterActivity;
  animationFrame: number;
  animationElapsedMs: number;
  /** Remaining waypoints, in world coordinates. */
  path: Point[];
  scale: number;
  speech: { text: string; remainingMs: number } | null;
}

export interface GameState {
  roomId: string;
  inventory: string[];
  flags: JSONObject;
  characters: Record<string, CharacterSnapshot>;
  extensions: JSONObject;
  selectedItem?: string | null;
  dialog?: JSONValue;
  cutscene?: JSONValue;
}

export const isPoint = (value: unknown): value is Point => {
  if (!value || typeof value !== 'object') return false;
  const point = value as Point;
  return Number.isFinite(point.x) && Number.isFinite(point.y);
};

/** Reject values JSON.stringify would silently discard or change. */
export function assertJSON(value: unknown, path = '$', ancestors = new Set<object>()): asserts value is JSONValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object' || value === null) throw new Error(`${path} must contain only finite JSON data`);
  if (ancestors.has(value)) throw new Error(`${path} contains a circular reference`);
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new Error(`${path} must be a plain JSON object`);
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) assertJSON(value[index], `${path}[${index}]`, ancestors);
  } else {
    if (Object.getOwnPropertySymbols(value).length) throw new Error(`${path} contains symbol properties`);
    for (const [key, item] of Object.entries(value)) assertJSON(item, `${path}.${key}`, ancestors);
  }
  ancestors.delete(value);
}

export function cloneJSON<T>(value: T): T {
  assertJSON(value);
  return JSON.parse(JSON.stringify(value)) as T;
}
