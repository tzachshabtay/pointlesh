type Voice = {
  once(event: string, callback: () => void): unknown;
  off(event: string, callback: () => void): unknown;
};

/** Only natural voice completion advances speech; skips and replacement lines cancel it. */
export class VoiceAdvance {
  private voice?: Voice;
  private remaining?: number;
  constructor(private advance: () => void, private finished: () => void) {}
  private complete = () => { this.remaining = 500; this.finished(); };
  follow(voice?: Voice): void {
    this.cancel();
    this.voice = voice;
    voice?.once('complete', this.complete);
  }
  cancel(): void {
    this.voice?.off('complete', this.complete);
    this.voice = undefined; this.remaining = undefined;
  }
  update(deltaMs: number, paused: boolean): void {
    if (paused || this.remaining === undefined) return;
    this.remaining -= deltaMs;
    if (this.remaining <= 0) { this.cancel(); this.advance(); }
  }
}
