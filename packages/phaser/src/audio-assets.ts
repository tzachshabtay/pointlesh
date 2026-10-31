import type Phaser from 'phaser';
import type { AiAssetDefinition, AiAssetManifest } from '@ai-game-assets/core';
import type { AiAssetRuntime } from '@ai-game-assets/phaser';
import type { AiLipSyncClock } from '@ai-game-assets/phaser';

/** Phaser seek is relative to its trim marker and already includes playback rate.
 * Lip-sync cues refer to the untrimmed recording, so add the marker exactly once. */
export function adventureLipSyncClock(sound: { isPlaying: boolean; isPaused: boolean; seek?: number; currentMarker?: { start?: number } | null }): AiLipSyncClock {
  return () => ({ seconds: (sound.seek ?? 0) + (sound.currentMarker?.start ?? 0), playing: sound.isPlaying, paused: sound.isPaused });
}

/** ai-assets audio callbacks supply URLs, not texture/cache keys. Decode before switching. */
export class PhaserAdventureAudioAssets {
  private selected = new Map<string, { source: string; key: string; asset: AiAssetDefinition }>();
  private sources = new Map<string, string>();
  private pending = new Map<string, { source: string; promise: Promise<void>; cancel: () => void }>();
  private owned = new Set<string>();
  private serial = 0;
  private disposed = false;
  constructor(private scene: Phaser.Scene, private runtime: AiAssetRuntime, private baseUrl = '') {
    for (const asset of Object.values(runtime.manifest.assets)) {
      const source = this.source(asset);
      if (source) this.sources.set(asset.id, source);
    }
    scene.events.once('shutdown', this.destroy, this);
  }
  isAudio(asset: AiAssetDefinition): boolean {
    return asset.kind === 'sound' || asset.kind === 'music' || asset.kind === 'voice-line';
  }
  key(id: string): string { return this.selected.get(id)?.key ?? this.runtime.key(id); }
  asset(id: string): AiAssetDefinition | undefined { return this.selected.get(id)?.asset ?? this.runtime.manifest.assets[id]; }
  private source(asset: AiAssetDefinition): string | undefined {
    const file = this.isAudio(asset) ? asset.versions[asset.activeVersion]?.file : undefined;
    if (!file) return;
    return /^(data:|blob:|https?:\/\/)/i.test(file) || !this.baseUrl ? file : `${this.baseUrl.replace(/\/$/, '')}/${file.replace(/^\//, '')}`;
  }
  /** Used for both auditioning an option and installing a promoted recording. */
  select(id: string, source: string, asset: AiAssetDefinition): Promise<void> {
    if (this.disposed || !this.isAudio(asset)) return Promise.resolve();
    if (this.pending.get(id)?.source === source) return this.pending.get(id)!.promise;
    this.pending.get(id)?.cancel();
    if (this.selected.get(id)?.source === source) {
      this.selected.get(id)!.asset = asset;
      return Promise.resolve();
    }
    const key = `pointlesh-audio::${id}::${++this.serial}`;
    let cancel!: () => void;
    const promise = new Promise<void>((resolve, reject) => {
      const event = `filecomplete-audio-${key}`;
      let timer: ReturnType<typeof setTimeout>;
      const clean = () => {
        clearTimeout(timer); this.scene.load.off(event, ready); this.scene.load.off('loaderror', failed);
        this.pending.delete(id);
      };
      const ready = () => {
        clean();
        const previous = this.selected.get(id);
        this.selected.set(id, { source, key, asset }); this.owned.add(key);
        // Existing sounds retain their decoded buffer, allowing music to crossfade.
        if (previous) { this.scene.cache.audio.remove(previous.key); this.owned.delete(previous.key); }
        resolve();
      };
      const failed = (file: { key: string }) => {
        if (file.key !== key) return;
        clean(); this.scene.load.once(event, () => this.scene.cache.audio.remove(key)); reject(new Error(`Could not load audio for ${id}. The previous recording is still available.`));
      };
      cancel = () => { clean(); this.scene.load.once(event, () => this.scene.cache.audio.remove(key)); resolve(); };
      this.scene.load.once(event, ready);
      this.scene.load.on('loaderror', failed);
      timer = setTimeout(() => failed({ key }), 20000);
      this.scene.load.audio(key, source);
    });
    this.pending.set(id, { source, promise, cancel });
    if (!this.scene.load.isLoading()) this.scene.load.start();
    return promise;
  }
  /** Metadata-only edits must not undo a currently auditioned recording. */
  async syncManifest(manifest: AiAssetManifest): Promise<void> {
    await Promise.all(Object.values(manifest.assets).map(async asset => {
      const source = this.source(asset);
      if (!source) {
        if (this.sources.has(asset.id)) {
          this.pending.get(asset.id)?.cancel();
          const selected = this.selected.get(asset.id);
          if (selected) { this.scene.cache.audio.remove(selected.key); this.owned.delete(selected.key); }
          this.selected.delete(asset.id); this.sources.delete(asset.id);
          this.scene.cache.audio.remove(this.runtime.key(asset.id));
        }
        return;
      }
      if (this.sources.get(asset.id) === source) {
        // Refresh trim/voice metadata without reloading audio or replacing a different audition.
        const selected = this.selected.get(asset.id);
        if (selected?.source === source) selected.asset = asset;
        return;
      }
      const previousSource = this.sources.get(asset.id);
      this.sources.set(asset.id, source);
      try { await this.select(asset.id, source, asset); }
      catch (error) {
        if (this.sources.get(asset.id) === source) {
          if (previousSource) this.sources.set(asset.id, previousSource); else this.sources.delete(asset.id);
        }
        throw error;
      }
    }));
  }
  destroy(): void {
    this.disposed = true;
    for (const job of [...this.pending.values()]) job.cancel();
    for (const key of this.owned) this.scene.cache.audio.remove(key);
    this.owned.clear(); this.selected.clear();
    this.scene.events.off('shutdown', this.destroy, this);
  }
}

/** Play the selected version's non-destructive trim using Phaser's audio markers. */
export function playAdventureAudio(sound: Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound, asset?: AiAssetDefinition): boolean {
  const playback = { ...asset?.audioPlayback, ...asset?.versions[asset.activeVersion]?.audioPlayback };
  const start = Math.max(0, playback.trimStartSeconds ?? 0);
  const end = Math.min(sound.totalDuration, playback.trimEndSeconds ?? sound.totalDuration);
  const rate = playback.playbackRate ?? 1;
  if (start > 0 || end < sound.totalDuration) {
    if (end <= start) return false;
    const name = 'pointlesh-playable-region';
    sound.addMarker({ name, start, duration: end - start, config: { volume: sound.volume, mute: sound.mute, detune: sound.detune, loop: sound.loop, rate } });
    return sound.play(name);
  }
  return sound.play({ rate });
}
