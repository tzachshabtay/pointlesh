import { CharacterController } from './character.js';
import { distance } from './navigation.js';
import { cloneJSON, isPoint, type Point } from './types.js';
import type { ResolvedPointleshArea } from './prefabs.js';

export type RoomPortal = {
  roomId: string;
  areaId: string;
  /** From ordinary floor to offscreen or beyond a doorway's sill. */
  path: Point[];
  doorId?: string;
  doorDurationMs?: number;
};
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
      (portal.doorId !== undefined && (typeof portal.doorId !== 'string' || !portal.doorId)) ||
      (portal.doorDurationMs !== undefined && (!Number.isFinite(portal.doorDurationMs) || portal.doorDurationMs <= 0))) throw new Error('Invalid room portal');
  }
  const portal = state.phase.includes('entry') ? state.to : state.from;
  if (state.waypoint >= portal.path.length) throw new Error('Invalid transition waypoint');
}

/** Activate corridors for one actor without mutating authored enabled/eye/lock state. */
export function activatePointleshAreas(areas: readonly ResolvedPointleshArea[], ids: readonly string[]): ResolvedPointleshArea[] {
  return areas.map(area => ids.includes(area.id) ? { ...area, enabled: true } : area);
}

/**
 * A saveable walk-out / door / walk-in sequence. The host ticks its character
 * normally and changes rooms after the outgoing path and door animation finish.
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
      else this.next(state.phase === 'exit' ? 'close-exit' : 'close-entry');
      return;
    }
    state.elapsedMs += deltaMs;
    const duration = this.portal?.doorId ? this.portal.doorDurationMs ?? 900 : 0;
    if (state.elapsedMs < duration) return;
    if (state.phase === 'open-exit' || state.phase === 'open-entry') {
      this.next(state.phase === 'open-exit' ? 'exit' : 'entry'); this.walk();
    } else if (state.phase === 'close-exit') {
      this.next('open-entry');
      this.options.enterRoom(state.to);
      const path = this.route();
      this.character.place(path[0]!); this.character.face(path[1]!);
    } else {
      this.state = undefined; this.options.onComplete?.();
    }
  }
  private next(phase: RoomTransitionPhase): void { Object.assign(this.state!, { phase, elapsedMs: 0, waypoint: 0 }); }
  private route(): Point[] { return this.state!.phase.includes('entry') ? [...this.state!.to.path].reverse() : this.state!.from.path; }
  private walk(): void { void this.character.walkTo(this.route()[this.state!.waypoint]!, undefined, [], { snap: false }); }
}
