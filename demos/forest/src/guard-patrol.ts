import { assertCharacterSnapshot, type CharacterController, type CharacterSnapshot, type CharacterAnimations, type CharacterAnimationAssignment, type Direction, type Point } from '@pointlesh/core';

const PATROL_PHASES = ['idle-front', 'idle-back', 'walk-left', 'drink', 'walk-right'] as const;
export const GUARD_PHASES = [...PATROL_PHASES, 'collapse', 'asleep'] as const;
export type GuardPhase = typeof GUARD_PHASES[number];
const LEGACY_TURN_SUCCESSORS = { 'face-back': 'idle-back', 'face-left': 'walk-left', 'face-right': 'walk-right', 'face-front': 'idle-front' } as const;
export type GuardPatrolSnapshot = { phase: GuardPhase | keyof typeof LEGACY_TURN_SUCCESSORS; elapsedMs: number; character: CharacterSnapshot };
type GuardPlayback = { sync(): void; update(deltaMs: number): void; readonly animationDurationMs: number };
export const GUARD_HOME_POINT = 'camp.guard.cage';
export const GUARD_DRINK_POINT = 'camp.guard.cauldron';

export function assertGuardPatrolSnapshot(value: unknown): asserts value is GuardPatrolSnapshot {
  const snapshot = value as GuardPatrolSnapshot;
  if (!snapshot || !(GUARD_PHASES.includes(snapshot.phase as GuardPhase) || Object.hasOwn(LEGACY_TURN_SUCCESSORS, snapshot.phase)) || !Number.isFinite(snapshot.elapsedMs) || snapshot.elapsedMs < 0) throw new Error('Invalid guard patrol checkpoint');
  assertCharacterSnapshot(snapshot.character);
  if (snapshot.character.id !== 'camp.npc.guard') throw new Error('Invalid guard patrol character');
}

/** The puzzle and the visible actor share this clock; no separate "looking away" timer. */
export class GuardPatrol {
  phase: GuardPhase = 'idle-front';
  elapsedMs = 0;
  constructor(readonly controller: CharacterController, readonly playback: GuardPlayback,
    readonly points: () => { home: Point; drink: Point }, readonly afterDrink: () => boolean,
    readonly afterCollapse: () => void = () => {}) {}

  get distracted(): boolean { return this.phase === 'idle-back' || this.phase === 'walk-right'; }
  get assignment(): CharacterAnimationAssignment | undefined {
    return this.phase === 'drink' ? { assetId: 'guard', key: 'drink' }
      : this.phase === 'collapse' || this.phase === 'asleep' ? { assetId: 'guard', key: 'collapse' } : undefined;
  }
  animations(base: CharacterAnimations | undefined): CharacterAnimations | undefined {
    const assignment = this.assignment;
    if (!assignment) return base;
    return { ...base, idle: Object.fromEntries(['front', 'back', 'left', 'right'].map(direction => [direction, assignment])) };
  }
  start(asleep = false): void {
    this.controller.place(asleep ? this.points().drink : this.points().home, 'down');
    this.enter(asleep ? 'asleep' : 'idle-front');
  }
  private destination(): Point { return this.phase === 'walk-left' ? this.points().drink : this.points().home; }
  private enter(phase: GuardPhase): void {
    this.phase = phase; this.elapsedMs = 0; this.controller.stop();
    const facing: Direction = phase === 'idle-back' ? 'up'
      : phase === 'walk-left' || phase === 'drink' || phase === 'collapse' || phase === 'asleep' ? 'left'
        : phase === 'walk-right' ? 'right' : 'down';
    this.controller.face(facing);
    if (phase === 'walk-left' || phase === 'walk-right') void this.controller.walkTo(this.destination());
    this.playback.sync();
    if (phase === 'asleep') this.freezeLastFrame();
  }
  private freezeLastFrame(): void {
    this.playback.sync();
    this.controller.state.animationFrame = this.controller.config.frameCount - 1;
    this.controller.state.animationElapsedMs = 0;
    this.playback.sync();
  }
  update(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs < 0) throw new Error('Invalid patrol elapsed time');
    let remaining = deltaMs;
    while (remaining > 0 && this.phase !== 'asleep') {
      if (this.phase === 'walk-left' || this.phase === 'walk-right') {
        // Small steps preserve arrival order and let the normal navigation system
        // replan around the player and other solid actors.
        const step = Math.min(remaining, 25);
        this.playback.update(step); this.elapsedMs += step; remaining -= step;
        if (!this.controller.isWalking) {
          const point = this.destination();
          if (Math.hypot(point.x - this.controller.state.position.x, point.y - this.controller.state.position.y) < 8) {
            this.enter(this.phase === 'walk-left' ? 'drink' : 'idle-front');
          } else if (this.elapsedMs >= 250) {
            this.elapsedMs = 0; void this.controller.walkTo(point);
          }
        }
      } else {
        const duration = Math.max(1, this.playback.animationDurationMs);
        const step = Math.min(remaining, Math.max(0, duration - this.elapsedMs));
        this.playback.update(step); this.elapsedMs += step; remaining -= step;
        if (this.elapsedMs + 1e-6 >= duration) {
          if (this.phase === 'drink' && this.afterDrink()) this.enter('collapse');
          else if (this.phase === 'collapse') { this.enter('asleep'); this.afterCollapse(); }
          else this.enter(PATROL_PHASES[(PATROL_PHASES.indexOf(this.phase) + 1) % PATROL_PHASES.length]!);
        }
      }
    }
    if (this.phase === 'asleep') this.freezeLastFrame();
  }
  snapshot(): GuardPatrolSnapshot { return { phase: this.phase, elapsedMs: this.elapsedMs, character: this.controller.snapshot() }; }
  restore(snapshot: GuardPatrolSnapshot): void {
    assertGuardPatrolSnapshot(snapshot);
    this.controller.restore(snapshot.character);
    if (Object.hasOwn(LEGACY_TURN_SUCCESSORS, snapshot.phase)) {
      // Existing saves made during a removed turn resume at the next action.
      this.enter(LEGACY_TURN_SUCCESSORS[snapshot.phase as keyof typeof LEGACY_TURN_SUCCESSORS]);
    } else {
      this.phase = snapshot.phase as GuardPhase; this.elapsedMs = snapshot.elapsedMs;
      this.playback.sync();
      if (this.phase === 'asleep') this.freezeLastFrame();
    }
  }
}
