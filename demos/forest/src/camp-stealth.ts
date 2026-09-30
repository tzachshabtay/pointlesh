import { CharacterController, distance, isPoint, type Point } from '@pointlesh/core';
import { PEEK_DURATION_MS } from './stealth-assets';

export type CampStealthCheckpoint = { phase: 'peek' | 'outbound' | 'return' | 'release'; elapsedMs: number; cover: Point; clearance: Point; path: Point[]; waypoint: number; message?: string };
export function assertCampStealthCheckpoint(value: unknown): asserts value is CampStealthCheckpoint {
  const s = value as CampStealthCheckpoint;
  if (!s || !['peek', 'outbound', 'return', 'release'].includes(s.phase) || !Number.isFinite(s.elapsedMs) || s.elapsedMs < 0 || !isPoint(s.cover) || !isPoint(s.clearance) ||
    !Array.isArray(s.path) || !s.path.every(isPoint) || !Number.isInteger(s.waypoint) || s.waypoint < 0 || (s.phase !== 'peek' && s.waypoint >= s.path.length) ||
    (s.message !== undefined && typeof s.message !== 'string')) throw new Error('Invalid camp stealth checkpoint');
}

/** The game's one permitted trip out of cover while Grub is awake. */
export class CampStealth {
  private state?: CampStealthCheckpoint;
  constructor(private readonly character: CharacterController, private readonly options: { poison: () => string; returned: (message?: string) => void }) {}
  get busy() { return !!this.state && this.state.phase !== 'peek'; }
  get peeking() { return this.state?.phase === 'peek'; }
  get elapsedMs() { return this.state?.elapsedMs ?? 0; }
  start(cover: Point): void { this.state = { phase: 'peek', elapsedMs: PEEK_DURATION_MS, cover: { ...cover }, clearance: { ...cover }, path: [], waypoint: 0 }; }
  cancel(): void { this.state = undefined; }
  poison(target: Point, clearance: Point): void {
    if (!this.state || this.busy) return;
    this.state.phase = 'outbound'; this.state.elapsedMs = 0;
    this.state.clearance = { ...clearance };
    this.state.path = [{ ...clearance }, { ...target }]; this.state.waypoint = 0;
    this.walk();
  }
  takeCover(cover: Point, clearance: Point): void {
    this.start(cover);
    this.state!.clearance = { ...clearance };
    this.returnToCover();
  }
  release(clearance: Point): void {
    if (!this.state || this.busy) return;
    this.state.phase = 'release'; this.state.path = [{ ...clearance }]; this.state.waypoint = 0; this.walk();
  }
  private walk(): void {
    const s = this.state!;
    void this.character.walkTo(s.path[s.waypoint]!, undefined, [], { snap: s.phase === 'outbound' });
    if (this.character.destination) s.path[s.waypoint] = { ...this.character.destination };
  }
  private returnToCover(): void {
    const s = this.state!;
    s.phase = 'return'; s.path = [{ ...s.clearance }, { ...s.cover }]; s.waypoint = 0; this.walk();
  }
  update(deltaMs: number): void {
    const s = this.state;
    if (!s) return;
    s.elapsedMs += deltaMs;
    if (s.phase === 'peek' || this.character.isWalking) return;
    const arrived = distance(this.character.state.position, s.path[s.waypoint]!) <= 1;
    if (s.phase === 'release') {
      if (!arrived) { this.walk(); return; }
      this.state = undefined; this.options.returned(); return;
    }
    if (arrived && s.waypoint < s.path.length - 1) { s.waypoint++; this.walk(); return; }
    if (s.phase === 'outbound') {
      s.message = arrived ? this.options.poison() : 'That route is blocked. Back to cover.';
      this.returnToCover();
    } else {
      if (!arrived) {
        // A moved obstacle can interrupt the trip; retry from the current feet.
        this.walk();
        return;
      }
      s.phase = 'peek'; s.elapsedMs = 0; this.character.face('right');
      const message = s.message; delete s.message; this.options.returned(message);
    }
  }
  snapshot(): CampStealthCheckpoint | null { return this.state ? structuredClone(this.state) : null; }
  restore(value: CampStealthCheckpoint | null): void {
    if (value) assertCampStealthCheckpoint(value);
    this.state = value ? structuredClone(value) : undefined;
  }
}
