type VoiceSound = {
  isPlaying: boolean; isPaused: boolean; totalDuration: number;
  setSeek(seconds: number): unknown;
  pause(): unknown; resume(): unknown; stop(): unknown; destroy(): unknown;
  once(event: string, callback: () => void): unknown;
};

/** One recording per shot; redraws never restart it and skipping always stops it. */
export class CutsceneVoice {
  private shot?: string;
  private sound?: VoiceSound;
  constructor(private play: (id: string) => VoiceSound | undefined) {}
  sync(shot: string, lineId: string | undefined, elapsedMs: number): void {
    if (shot === this.shot) return;
    this.reset(); this.shot = shot;
    if (!lineId) return;
    const sound = this.play(lineId);
    if (!sound) return;
    this.sound = sound;
    sound.once('destroy', () => { if (this.sound === sound) this.sound = undefined; });
    if (elapsedMs >= sound.totalDuration * 1000) { this.stop(); return; }
    if (elapsedMs > 0) sound.setSeek(elapsedMs / 1000);
  }
  pause(paused: boolean): void {
    if (paused && this.sound?.isPlaying) this.sound.pause();
    else if (!paused && this.sound?.isPaused) this.sound.resume();
  }
  /** Hold before the closing fade until narration finishes, unless the player skips. */
  tickDelta(deltaMs: number, elapsedMs: number, durationMs: number): number {
    return this.sound && (this.sound.isPlaying || this.sound.isPaused)
      ? Math.min(deltaMs, Math.max(0, durationMs - elapsedMs - 300)) : deltaMs;
  }
  private stop(): void { const sound = this.sound; this.sound = undefined; sound?.stop(); sound?.destroy(); }
  reset(): void { this.stop(); this.shot = undefined; }
}
