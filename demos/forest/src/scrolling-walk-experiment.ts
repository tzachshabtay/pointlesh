/** Local experiment: use smooth linked-speed walking while the follow camera moves. */
export class ScrollingWalkExperiment {
  private room?: string;
  private settlingMs = 0;
  get active(): boolean { return this.settlingMs > 0; }

  begin(room: string, enabled: boolean): void {
    if (!enabled || this.room !== room) this.settlingMs = 0;
    this.room = room;
  }

  observe(before: { x: number; y: number }, after: { x: number; y: number }, deltaMs: number, zoom: number): void {
    if (deltaMs <= 0) return;
    const screenSpeed = Math.hypot(after.x - before.x, after.y - before.y) * zoom * 1000 / deltaMs;
    // Ignore imperceptible exponential-follow tails. Hold across gaps between
    // animation steps so entering smooth mode cannot alternate every frame.
    this.settlingMs = screenSpeed > 0.5 ? 180 : Math.max(0, this.settlingMs - deltaMs);
  }
}
