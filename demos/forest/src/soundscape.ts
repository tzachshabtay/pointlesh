import type Phaser from 'phaser';
import { playAdventureAudio, type PhaserAdventureAudioAssets } from '@pointlesh/phaser';
import type { AiAssetRuntime } from '@ai-game-assets/phaser';
import { FootstepCadence, footstepFor, soundtrackFor, type AudioWalker, type ForestAudioState } from './audio-state';

type MixChannel = 'music' | 'sfx' | 'voices';
type Settings = { enabled: boolean; music: number; sfx: number; voices: number };
type Sound = Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound;
type Stem = { id: string; key: string; channel: 'music' | 'ambience'; sound: Sound; gain: number; retiring: boolean };
const preferenceKey = 'pointlesh.audio';
const clamp = (n: number) => Math.min(1, Math.max(0, n));

export function spriteWalker(id: string, character: string, sprite: Phaser.GameObjects.Sprite, walking: boolean, camera: Phaser.Cameras.Scene2D.Camera, fallbackPhase = 0): AudioWalker {
  const frames = sprite.anims.currentAnim?.frames.length;
  const phase = frames ? ((sprite.anims.currentFrame?.index ?? 1) - 1) / frames : fallbackPhase;
  return { id, character, x: sprite.x, y: sprite.y, walking: walking && sprite.visible && sprite.alpha > 0,
    phase, pan: Math.max(-.8, Math.min(.8, ((sprite.x - camera.worldView.x) / camera.worldView.width - .5) * 1.6)) };
}

/** Room orchestration belongs to the game; every recording is an editable ai-assets asset. */
export class ForestSoundscape {
  readonly settings: Settings = { enabled: true, music: .38, sfx: .55, voices: 1 };
  private stems: Stem[] = [];
  private hits = new Map<Sound, number>();
  private voices = new Map<Sound, number>();
  private cadence = new FootstepCadence();
  private shot = '';
  private variation = 0;
  private hidden = document.hidden;
  constructor(private scene: Phaser.Scene, private runtime: AiAssetRuntime, private state: () => ForestAudioState, private audioAssets?: PhaserAdventureAudioAssets) {
    try {
      const saved = JSON.parse(localStorage.getItem(preferenceKey) ?? '{}');
      if (typeof saved.enabled === 'boolean') this.settings.enabled = saved.enabled;
      // Keep existing preferences when upgrading the former separate effects controls.
      saved.sfx ??= saved.footsteps ?? saved.ambience;
      for (const channel of ['music', 'sfx', 'voices'] as const) if (typeof saved[channel] === 'number' && Number.isFinite(saved[channel])) this.settings[channel] = clamp(saved[channel]);
    } catch { /* Audio still works when browser storage is unavailable. */ }
    scene.sound.mute = !this.settings.enabled;
    scene.events.on('postupdate', this.update, this);
    scene.events.once('shutdown', this.destroy, this);
    document.addEventListener('visibilitychange', this.visibility);
  }
  unlock() {
    if ('context' in this.scene.sound) {
      const context = (this.scene.sound as Phaser.Sound.WebAudioSoundManager).context;
      if (context.state === 'suspended') void context.resume().catch(() => {});
    }
  }
  setEnabled(enabled: boolean) {
    this.settings.enabled = enabled; this.scene.sound.mute = !enabled;
    if (!enabled) this.stop(); else this.unlock();
    this.save();
  }
  setVolume(channel: MixChannel, volume: number) {
    this.settings[channel] = clamp(volume);
    const sounds = channel === 'voices' ? this.voices : channel === 'sfx' ? this.hits : undefined;
    for (const [sound, gain] of sounds ?? []) sound.setVolume(clamp(gain * this.settings[channel]));
    this.save();
  }
  /** Both dialog lines and simple interaction speech use the Voices channel. */
  playVoice(id: string): Sound | undefined {
    const key = this.audioKey(id);
    if (!this.scene.cache.audio.exists(key)) return;
    const gain = this.assetVolume(id);
    const sound = this.scene.sound.add(key, { volume: gain * this.settings.voices }) as Sound;
    this.voices.set(sound, gain);
    sound.once('destroy', () => this.voices.delete(sound));
    sound.once('complete', () => sound.destroy());
    if (!playAdventureAudio(sound, this.audioAssets?.asset(id) ?? this.runtime.manifest.assets[id])) { sound.destroy(); return; }
    return sound;
  }
  playSfx(name: string, volume = .75): Sound | undefined {
    if (this.hidden || !this.settings.enabled || this.scene.sound.locked) return;
    const id = `sfx.${name}`, key = this.audioKey(id);
    if (!this.scene.cache.audio.exists(key)) return;
    const gain = clamp(volume) * this.assetVolume(id);
    const sound = this.scene.sound.add(key, { volume: gain * this.settings.sfx, loop: false }) as Sound;
    this.hits.set(sound, gain);
    sound.once('destroy', () => this.hits.delete(sound));
    sound.once('complete', () => sound.destroy());
    if (!sound.play()) { sound.destroy(); return; }
    return sound;
  }
  private save() { try { localStorage.setItem(preferenceKey, JSON.stringify(this.settings)); } catch { /* Optional preference. */ } }
  private visibility = () => { this.hidden = document.hidden; this.stop(); };
  private stop() {
    for (const stem of this.stems) stem.sound.destroy(); this.stems = [];
    for (const hit of this.hits.keys()) hit.destroy(); this.hits.clear(); this.cadence.reset();
  }
  private start(id: string, channel: Stem['channel']): Stem | undefined {
    const key = this.audioKey(id);
    if (!this.scene.cache.audio.exists(key)) return;
    const sound = this.scene.sound.add(key, { volume: 0, loop: false }) as Sound;
    if (!sound.play()) { sound.destroy(); return; }
    const stem = { id, key, channel, sound, gain: 0, retiring: false }; this.stems.push(stem); return stem;
  }
  private select(id: string | undefined, channel: Stem['channel']) {
    const current = this.stems.find(stem => stem.channel === channel && !stem.retiring);
    const key = id ? this.audioKey(id) : undefined;
    if (current?.id === id && current?.key === key && current) {
      // Overlap the end with the next pass, also smoothing generated loop seams.
      if (!current.sound.isPlaying || current.sound.totalDuration > 2 && current.sound.seek >= current.sound.totalDuration - 1.5) {
        current.retiring = true; this.start(id!, channel);
      }
      return;
    }
    for (const stem of this.stems) if (stem.channel === channel) stem.retiring = true;
    if (id) this.start(id, channel);
  }
  private hit(walker: AudioWalker, room: ForestAudioState['room']) {
    const id = `${footstepFor(walker.character, room)}.${++this.variation % 2 + 1}`;
    const key = this.audioKey(id);
    if (!this.scene.cache.audio.exists(key) || this.hits.size >= 12) return;
    const gain = (walker.character === 'borin' ? .65 : .45) * this.assetVolume(id);
    const sound = this.scene.sound.add(key, { volume: this.settings.sfx * gain,
      rate: .96 + Math.random() * .08, pan: walker.pan }) as Sound;
    this.hits.set(sound, gain);
    sound.once('complete', () => { this.hits.delete(sound); sound.destroy(); });
    if (!sound.play()) { this.hits.delete(sound); sound.destroy(); }
  }
  private audioKey(id: string) { return this.audioAssets?.key(id) ?? this.runtime.key(id); }
  private assetVolume(id: string) { return clamp((this.audioAssets?.asset(id) ?? this.runtime.manifest.assets[id])?.audioPlayback?.volume ?? 1); }
  private update(_time: number, delta: number) {
    if (this.hidden || !this.settings.enabled || this.scene.sound.locked) { this.cadence.reset(); return; }
    const state = this.state(), dt = Math.min(delta, 100);
    this.select(state.started && this.settings.music > 0 ? soundtrackFor(state.room, state.cinematic) : undefined, 'music');
    this.select(state.started && this.settings.sfx > 0 ? `ambience.${state.room}` : undefined, 'ambience');
    const duck = state.speaking ? .5 : state.menu ? .7 : 1;
    for (const stem of [...this.stems]) {
      // Preserve the relative effects mix underneath the single SFX control.
      const volume = stem.channel === 'music' ? this.settings.music : this.settings.sfx * (.38 / .55);
      const target = stem.retiring ? 0 : volume * duck * this.assetVolume(stem.id);
      const amount = dt / 1500;
      stem.gain += Math.max(-amount, Math.min(amount, target - stem.gain));
      stem.sound.setVolume(clamp(stem.gain));
      if (stem.retiring && stem.gain <= 0) { stem.sound.destroy(); this.stems.splice(this.stems.indexOf(stem), 1); }
    }
    if (this.shot !== state.shot || state.footstepsPaused || !state.started) this.cadence.reset();
    this.shot = state.shot;
    if (!state.footstepsPaused && state.started && this.settings.sfx > 0) {
      for (const walker of this.cadence.tick(state.walkers, dt)) this.hit(walker, state.room);
    }
  }
  destroy() { this.stop(); for (const voice of this.voices.keys()) voice.destroy(); this.voices.clear(); document.removeEventListener('visibilitychange', this.visibility); this.scene.events.off('postupdate', this.update, this); this.scene.events.off('shutdown', this.destroy, this); }
}
