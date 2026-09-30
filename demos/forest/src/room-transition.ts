import { CharacterController, distance, cloneJSON, isPoint, type Point, type ResolvedPointleshArea } from '@pointlesh/core';

export type RoomPortal = {
  roomId: string;
  areaId: string;
  /** From ordinary floor to offscreen or beyond a doorway's sill. */
  path: Point[];
  /** Switch rooms here and resume here on arrival. Defaults to the last path point. */
  handoffIndex?: number;
  doorId?: string;
  doorDurationMs?: number;
};
// close-exit and open-entry remain readable for saves made by the old sequence.
export type RoomTransitionPhase = 'open-exit' | 'exit' | 'close-exit' | 'open-entry' | 'entry' | 'close-entry';
export type RoomTransitionCheckpoint = {
  from: RoomPortal; to: RoomPortal; phase: RoomTransitionPhase; elapsedMs: number; waypoint: number;
};
const phases: RoomTransitionPhase[] = ['open-exit', 'exit', 'close-exit', 'open-entry', 'entry', 'close-entry'];

export function assertRoomTransitionCheckpoint(value: unknown): asserts value is RoomTransitionCheckpoint {
  const state = value as RoomTransitionCheckpoint;
  if (!state || !phases.includes(state.phase) || !Number.isFinite(state.elapsedMs) || state.elapsedMs < 0 ||
    !Number.isInteger(state.waypoint) || state.waypoint < 0) throw new Error('Invalid room transition checkpoint');
  for (const portal of [state.from, state.to]) {
    if (!portal || typeof portal.roomId !== 'string' || !portal.roomId || typeof portal.areaId !== 'string' || !portal.areaId ||
      !Array.isArray(portal.path) || portal.path.length < 2 || !portal.path.every(isPoint) ||
      (portal.handoffIndex !== undefined && (!Number.isInteger(portal.handoffIndex) || portal.handoffIndex < 1 || portal.handoffIndex >= portal.path.length)) ||
      (portal.doorId !== undefined && (typeof portal.doorId !== 'string' || !portal.doorId)) ||
      (portal.doorDurationMs !== undefined && (!Number.isFinite(portal.doorDurationMs) || portal.doorDurationMs <= 0))) throw new Error('Invalid room portal');
  }
  const portal = state.phase.includes('entry') ? state.to : state.from;
  if (state.waypoint > (portal.handoffIndex ?? portal.path.length - 1)) throw new Error('Invalid transition waypoint');
}

/** Activate corridors for one actor without mutating authored enabled/eye/lock state. */
export function activatePointleshAreas(areas: readonly ResolvedPointleshArea[], ids: readonly string[]): ResolvedPointleshArea[] {
  return areas.map(area => ids.includes(area.id) ? { ...area, enabled: true } : area);
}

/**
 * The forest game's saveable doorway sequence. The scene ticks its character
 * normally. Open once, cross into the next room with its door already open,
 * and close that door after the character clears the incoming path.
 * Rendering and doorway occlusion do not modify the character's opacity.
 */
export class RoomTransitionController {
  private state?: RoomTransitionCheckpoint;
  constructor(readonly character: CharacterController, readonly options: {
    enterRoom: (portal: RoomPortal) => void;
    onComplete?: () => void;
    onBlocked?: () => void;
  }) {}
  get active(): boolean { return !!this.state; }
  get portal(): RoomPortal | undefined { return this.state && (this.state.phase.includes('entry') ? this.state.to : this.state.from); }
  get phase(): RoomTransitionPhase | undefined { return this.state?.phase; }
  get doorProgress(): number {
    const state = this.state, portal = this.portal;
    if (!state || !portal?.doorId) return 0;
    const t = Math.min(1, state.elapsedMs / (portal.doorDurationMs ?? 900));
    return state.phase.startsWith('open') ? t : state.phase.startsWith('close') ? 1 - t : 1;
  }
  begin(from: RoomPortal, to: RoomPortal): void {
    const state: RoomTransitionCheckpoint = { from, to, phase: 'open-exit', elapsedMs: 0, waypoint: 0 };
    assertRoomTransitionCheckpoint(state);
    if (this.active) throw new Error('A room transition is already active');
    this.character.stop();
    this.state = cloneJSON(state);
  }
  snapshot(): RoomTransitionCheckpoint | null { return this.state ? cloneJSON(this.state) : null; }
  /** Restore the character snapshot as well; its remaining path resumes normally. */
  restore(state: RoomTransitionCheckpoint | null): void {
    if (state) assertRoomTransitionCheckpoint(state);
    this.state = state ? cloneJSON(state) : undefined;
  }
  cancel(): void { if (this.state) this.character.stop(); this.state = undefined; }
  update(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new Error('Invalid room transition time');
    const state = this.state;
    if (!state) return;
    if (state.phase === 'exit' || state.phase === 'entry') {
      if (this.character.isWalking) return;
      const path = this.route();
      if (distance(this.character.state.position, path[state.waypoint]!) > 1) {
        // A blocked route never changes rooms or silently snaps the character.
        this.cancel(); this.options.onBlocked?.(); return;
      }
      if (state.waypoint + 1 < path.length) { state.waypoint++; this.walk(); }
      else if (state.phase === 'exit') this.enterDestination();
      else this.next('close-entry');
      return;
    }
    // Old checkpoints resume without repeating a close/open at the same door.
    if (state.phase === 'close-exit') { this.enterDestination(); return; }
    if (state.phase === 'open-entry') { this.next('entry'); this.walk(); return; }
    state.elapsedMs += deltaMs;
    const duration = this.portal?.doorId ? this.portal.doorDurationMs ?? 900 : 0;
    if (state.elapsedMs < duration) return;
    if (state.phase === 'open-exit') {
      this.next('exit'); this.walk();
    } else {
      this.state = undefined; this.options.onComplete?.();
    }
  }
  private enterDestination(): void {
    this.next('entry');
    this.options.enterRoom(this.state!.to);
    const path = this.route();
    this.character.place(path[0]!);
    // Start the incoming walk in the same update as the room switch. There is
    // no closed-door frame, stationary entrance pose, or second opening wait.
    this.state!.waypoint = 1;
    this.walk();
  }
  private next(phase: RoomTransitionPhase): void { Object.assign(this.state!, { phase, elapsedMs: 0, waypoint: 0 }); }
  private route(): Point[] {
    const portal = this.portal!;
    const path = portal.path.slice(0, (portal.handoffIndex ?? portal.path.length - 1) + 1);
    return this.state!.phase.includes('entry') ? path.reverse() : path;
  }
  private walk(): void { void this.character.walkTo(this.route()[this.state!.waypoint]!, undefined, [], { snap: false }); }
}
