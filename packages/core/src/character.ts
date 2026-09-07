import { clipMovementToWalkable, distance, findClosestReachablePath, findPath } from './navigation.js';
import { cloneJSON, isPoint, type ApproachMode, type CharacterSnapshot, type Direction, type Point, type Polygon } from './types.js';

export interface CharacterConfig {
  id: string;
  position: Point;
  facing?: Direction;
  /** Smooth-walking pixels per second, before perspective scaling. */
  speed?: number;
  /** Pixels of planted-foot travel per animation frame. */
  walkStep?: number;
  frameDurationMs?: number;
  frameCount?: number;
  movementLinkedToAnimation?: boolean;
  adjustSpeedToScale?: boolean;
  directions?: 4 | 8;
}

export interface ApproachTarget { position: Point; walkPoint?: Point; facing?: Direction }
export interface WalkToOptions { /** Snap an unreachable click to the nearest reachable point. Defaults to true. */ snap?: boolean }
const DIRECTIONS: Direction[] = ['right', 'down-right', 'down', 'down-left', 'left', 'up-left', 'up', 'up-right'];
const positive = (value: number, name: string): number => {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be finite and positive`);
  return value;
};

export function facingDirection(from: Point, to: Point, directions: 4 | 8 = 8, fallback: Direction = 'down'): Direction {
  if (distance(from, to) < 1e-7) return fallback;
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  if (directions === 4) return (['right', 'down', 'left', 'up'] as const)[((Math.round(angle / (Math.PI / 2)) % 4) + 4) % 4]!;
  return DIRECTIONS[((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8]!;
}

/** Deterministic actor state machine. Drive tick with elapsed milliseconds from your renderer. */
export class CharacterController {
  readonly config: Required<CharacterConfig>;
  readonly state: CharacterSnapshot;
  private walkCompletion: ((completed: boolean) => void) | undefined;
  private speechCompletion: (() => void) | undefined;
  private directionalMovement?: { direction: Point; walkables: readonly Polygon[]; obstacles: readonly Polygon[] };
  private animationDurations?: number[];
  private operation = 0;

  constructor(config: CharacterConfig) {
    if (!config.id || !isPoint(config.position)) throw new Error('Character needs an ID and finite position');
    const frameCount = positive(config.frameCount ?? 4, 'frameCount');
    if (!Number.isInteger(frameCount)) throw new Error('frameCount must be an integer');
    this.config = {
      id: config.id, position: { ...config.position }, facing: config.facing ?? 'down',
      speed: positive(config.speed ?? 90, 'speed'), walkStep: positive(config.walkStep ?? 7, 'walkStep'),
      frameDurationMs: positive(config.frameDurationMs ?? 100, 'frameDurationMs'), frameCount,
      movementLinkedToAnimation: config.movementLinkedToAnimation ?? true,
      adjustSpeedToScale: config.adjustSpeedToScale ?? true, directions: config.directions ?? 8,
    };
    if (!DIRECTIONS.includes(this.config.facing) || ![4, 8].includes(this.config.directions)) throw new Error('Invalid character facing/directions');
    this.state = {
      id: config.id, position: { ...config.position }, facing: this.config.facing, activity: 'idle',
      animationFrame: 0, animationElapsedMs: 0, path: [], scale: 1, speech: null,
    };
  }

  get isWalking(): boolean { return this.state.activity === 'walking'; }
  get destination(): Point | null { const destination = this.state.path.at(-1); return destination ? { ...destination } : null; }

  face(target: Point | Direction): void {
    if (typeof target === 'string') {
      if (!DIRECTIONS.includes(target)) throw new Error('Unknown facing direction');
      this.state.facing = target;
    } else {
      if (!isPoint(target)) throw new Error('Facing target must be finite');
      this.state.facing = facingDirection(this.state.position, target, this.config.directions, this.state.facing);
    }
  }

  setScale(scale: number): void { this.state.scale = positive(scale, 'scale'); }

  /** Renderer-selected frame delays, including idle cycles. Null returns to config's uniform clock. */
  setAnimationTiming(frameDurationsMs: readonly number[] | null): void {
    if (frameDurationsMs === null) { this.animationDurations = undefined; return; }
    if (!frameDurationsMs.length) throw new Error('Animation timing needs at least one frame');
    for (const duration of frameDurationsMs) positive(duration, 'Animation frame duration');
    this.animationDurations = [...frameDurationsMs];
    this.config.frameCount = frameDurationsMs.length;
    this.config.frameDurationMs = frameDurationsMs[0]!;
    this.state.animationFrame %= frameDurationsMs.length;
    this.state.animationElapsedMs %= frameDurationsMs[this.state.animationFrame]!;
  }

  /** A new click walk interrupts the old activity. Completion means the resolved destination was reached. */
  walkTo(destination: Point, walkables: readonly Polygon[], obstacles: readonly Polygon[] = [], options: WalkToOptions = {}): Promise<boolean> {
    // Validate/compute before cancelling an existing valid action.
    const path = options.snap === false
      ? findPath(this.state.position, destination, walkables, obstacles)
      : findClosestReachablePath(this.state.position, destination, walkables, obstacles);
    this.stop();
    if (!path) return Promise.resolve(false);
    this.state.path = path.slice(1);
    if (!this.state.path.length) return Promise.resolve(true);
    this.state.activity = 'walking';
    this.state.animationFrame = 0;
    this.state.animationElapsedMs = 0;
    this.face(this.state.path[0]!);
    return new Promise(resolve => { this.walkCompletion = resolve; });
  }

  /**
   * Set held-key/joystick intent. Repeated nonzero updates preserve animation/frame timing.
   * Passing null or a zero vector releases only directional movement, not a pending click walk.
   */
  setMovementDirection(direction: Point | null, walkables: readonly Polygon[], obstacles: readonly Polygon[] = []): void {
    if (direction === null || (isPoint(direction) && direction.x === 0 && direction.y === 0)) {
      if (this.directionalMovement) this.stop();
      return;
    }
    if (!isPoint(direction)) throw new Error('Movement direction must be a finite point');
    const length = Math.hypot(direction.x, direction.y);
    if (!Number.isFinite(length) || length === 0) throw new Error('Movement direction must have finite nonzero magnitude');
    // Validate supplied geometry before interrupting an existing valid activity.
    findPath(this.state.position, this.state.position, walkables, obstacles);
    if (!this.directionalMovement) this.stop();
    this.directionalMovement = { direction: { x: direction.x / length, y: direction.y / length }, walkables, obstacles };
    this.state.activity = 'walking';
    this.face({ x: this.state.position.x + direction.x, y: this.state.position.y + direction.y });
  }

  /** Instantly move between rooms/checkpoints and cancel pending actions. */
  place(position: Point, facing?: Direction): void {
    if (!isPoint(position)) throw new Error('Character position must be finite');
    this.stop();
    this.state.position = { ...position };
    if (facing) this.face(facing);
  }

  stop(): void {
    this.operation++;
    const walkCompletion = this.walkCompletion;
    const speechCompletion = this.speechCompletion;
    this.walkCompletion = undefined;
    this.speechCompletion = undefined;
    this.directionalMovement = undefined;
    this.state.path = [];
    this.state.speech = null;
    this.idle();
    walkCompletion?.(false);
    speechCompletion?.();
  }

  async approach(target: ApproachTarget, mode: ApproachMode, walkables: readonly Polygon[], obstacles: readonly Polygon[] = []): Promise<boolean> {
    if (!isPoint(target.position) || (target.walkPoint !== undefined && !isPoint(target.walkPoint))) throw new Error('Invalid approach target');
    if (mode === 'none') return true;
    if (!['face', 'walk-if-point', 'walk'].includes(mode)) throw new Error('Unknown approach mode');
    if (mode === 'walk' || (mode === 'walk-if-point' && target.walkPoint)) {
      const completion = this.walkTo(target.walkPoint ?? target.position, walkables, obstacles, { snap: false });
      const operation = this.operation;
      if (!await completion || operation !== this.operation) return false;
    }
    this.face(target.facing ?? target.position);
    return true;
  }

  /** Speech interrupts walking. Pass a long duration and finishSpeech() for click-to-advance. */
  say(text: string, durationMs = Math.max(1400, text.length * 45)): Promise<void> {
    if (typeof text !== 'string' || !Number.isFinite(durationMs) || durationMs < 0) throw new Error('Invalid speech');
    this.stop();
    if (durationMs === 0) return Promise.resolve();
    this.state.activity = 'speaking';
    this.state.speech = { text, remainingMs: durationMs };
    return new Promise(resolve => { this.speechCompletion = resolve; });
  }

  finishSpeech(): void {
    if (this.state.activity !== 'speaking') return;
    const completion = this.speechCompletion;
    this.speechCompletion = undefined;
    this.state.speech = null;
    this.idle();
    completion?.();
  }

  tick(dtMs: number): void {
    if (!Number.isFinite(dtMs) || dtMs < 0) throw new Error('tick requires a finite, nonnegative duration');
    if (dtMs === 0 || (this.state.activity === 'idle' && !this.directionalMovement && !this.animationDurations)) return;
    if (this.state.activity === 'speaking' && this.state.speech && this.state.speech.remainingMs < dtMs) {
      const remaining = this.state.speech.remainingMs;
      if (remaining > 0) this.tick(remaining); else this.finishSpeech();
      this.tick(dtMs - remaining);
      return;
    }
    const elapsed = this.state.animationElapsedMs + dtMs;
    let frames: number;
    if (this.animationDurations) {
      const durations = this.animationDurations;
      let remaining = elapsed;
      let frame = this.state.animationFrame % durations.length;
      const cycle = durations.reduce((total, duration) => total + duration, 0);
      const cycles = Math.floor(remaining / cycle);
      frames = cycles * durations.length;
      remaining %= cycle;
      while (remaining >= durations[frame]!) {
        remaining -= durations[frame]!;
        frame = (frame + 1) % durations.length;
        frames++;
      }
      this.state.animationFrame = frame;
      this.state.animationElapsedMs = remaining;
    } else {
      frames = Math.floor(elapsed / this.config.frameDurationMs);
      this.state.animationElapsedMs = elapsed % this.config.frameDurationMs;
      this.state.animationFrame = (this.state.animationFrame + frames) % this.config.frameCount;
    }
    if (this.state.activity === 'speaking') {
      if (this.state.speech) this.state.speech.remainingMs = Math.max(0, this.state.speech.remainingMs - dtMs);
      if (!this.state.speech || this.state.speech.remainingMs === 0) this.finishSpeech();
      return;
    }
    if (this.state.activity === 'idle' && !this.directionalMovement) return;
    const scale = this.config.adjustSpeedToScale ? this.state.scale : 1;
    const amount = this.config.movementLinkedToAnimation && this.config.frameCount > 1
      ? frames * this.config.walkStep * scale
      : dtMs / 1000 * this.config.speed * scale;
    if (this.directionalMovement) this.advanceDirection(amount);
    else this.advance(amount);
  }

  /** Held keys are transient input: save the current pose as idle instead of restoring a stuck key. */
  snapshot(): CharacterSnapshot {
    const snapshot = cloneJSON(this.state);
    if (this.directionalMovement) {
      snapshot.activity = 'idle'; snapshot.path = [];
      snapshot.animationFrame = 0; snapshot.animationElapsedMs = 0;
    }
    return snapshot;
  }

  /** Restores remaining walking/speech data. Old promises resolve as interrupted; new tick resumes state. */
  restore(snapshot: CharacterSnapshot): void {
    assertCharacterSnapshot(snapshot);
    if (snapshot.id !== this.config.id) throw new Error('Cannot restore a different character');
    const candidate = cloneJSON(snapshot);
    // The renderer selects the restored activity's animation before ticking. Its
    // frame count/delays may differ from the animation that was active on load.
    this.stop();
    Object.assign(this.state, candidate);
  }

  private advance(amount: number): void {
    while (this.state.path.length && amount > 0) {
      const destination = this.state.path[0]!;
      const remaining = distance(this.state.position, destination);
      this.face(destination);
      if (remaining <= amount + 1e-7) {
        this.state.position = { ...destination };
        this.state.path.shift();
        amount -= remaining;
      } else {
        this.state.position = {
          x: this.state.position.x + (destination.x - this.state.position.x) / remaining * amount,
          y: this.state.position.y + (destination.y - this.state.position.y) / remaining * amount,
        };
        amount = 0;
      }
    }
    if (!this.state.path.length) {
      const completion = this.walkCompletion;
      this.walkCompletion = undefined;
      this.idle();
      completion?.(true);
    }
  }

  private advanceDirection(amount: number): void {
    if (!this.directionalMovement || amount <= 0) return;
    const { direction, walkables, obstacles } = this.directionalMovement;
    const desired = { x: this.state.position.x + direction.x * amount, y: this.state.position.y + direction.y * amount };
    const position = clipMovementToWalkable(this.state.position, desired, walkables, obstacles);
    const moved = distance(this.state.position, position) > 1e-7;
    this.state.position = position;
    this.state.activity = moved ? 'walking' : 'idle';
    if (!moved) this.state.animationFrame = 0;
  }

  private idle(): void {
    this.state.activity = 'idle';
    this.state.animationFrame = 0;
    this.state.animationElapsedMs = 0;
  }
}

export function assertCharacterSnapshot(value: unknown): asserts value is CharacterSnapshot {
  if (!value || typeof value !== 'object') throw new Error('Character snapshot must be an object');
  const state = value as CharacterSnapshot;
  if (typeof state.id !== 'string' || !state.id || !isPoint(state.position) || !DIRECTIONS.includes(state.facing) ||
    !['idle', 'walking', 'speaking'].includes(state.activity) || !Number.isInteger(state.animationFrame) || state.animationFrame < 0 ||
    !Number.isFinite(state.animationElapsedMs) || state.animationElapsedMs < 0 || !Number.isFinite(state.scale) || state.scale <= 0 ||
    !Array.isArray(state.path) || !state.path.every(isPoint)) throw new Error('Invalid character snapshot');
  if (state.speech !== null && (!state.speech || typeof state.speech.text !== 'string' || !Number.isFinite(state.speech.remainingMs) || state.speech.remainingMs < 0)) {
    throw new Error('Invalid character speech snapshot');
  }
  if ((state.activity === 'walking') !== (state.path.length > 0)) throw new Error('Walking state must match remaining path');
  if ((state.activity === 'speaking') !== (state.speech !== null)) throw new Error('Speaking state must match speech payload');
}
