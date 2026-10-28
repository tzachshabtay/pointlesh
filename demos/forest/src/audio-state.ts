import type { RoomId } from './story';

export type AudioWalker = { id: string; character: string; x: number; y: number; phase: number; walking: boolean; pan: number };
export type ForestAudioState = {
  started: boolean; room: RoomId; cinematic?: 'intro' | 'ending';
  shot: string; footstepsPaused: boolean; speaking: boolean; menu: boolean; walkers: AudioWalker[];
};
export function soundtrackFor(room: RoomId, cinematic?: 'intro' | 'ending'): string {
  return `music.${cinematic === 'ending' ? 'ending' : cinematic === 'intro' || room === 'camp' ? 'tense' : room}`;
}
export function footstepFor(character: string, room: RoomId): string {
  if (character.startsWith('guard')) return 'step.orc';
  if (character === 'king' || character === 'borin' && (room === 'forest' || room === 'camp')) return 'step.dwarf-stone';
  return `step.dwarf-${room === 'pub' ? 'wood' : room === 'village' || room === 'mine' || room === 'house' ? 'stone' : 'earth'}`;
}

/** Feet contact twice per animation cycle. Camera motion never counts as walking. */
export class FootstepCadence {
  private actors = new Map<string, { x: number; y: number; half: number; distance: number; cooldown: number }>();
  reset() { this.actors.clear(); }
  tick(walkers: readonly AudioWalker[], delta: number): AudioWalker[] {
    const steps: AudioWalker[] = [], seen = new Set<string>();
    for (const walker of walkers) {
      seen.add(walker.id);
      if (!walker.walking) { this.actors.delete(walker.id); continue; }
      const half = Math.floor(walker.phase * 2) % 2;
      const last = this.actors.get(walker.id);
      const distance = last ? Math.hypot(walker.x - last.x, walker.y - last.y) : 0;
      if (!last || distance > 100) { this.actors.set(walker.id, { x: walker.x, y: walker.y, half, distance: 0, cooldown: 0 }); continue; }
      last.cooldown = Math.max(0, last.cooldown - delta); last.distance += distance;
      if (half !== last.half && last.distance > .5 && !last.cooldown) {
        steps.push(walker); last.distance = 0; last.cooldown = 120;
      }
      last.x = walker.x; last.y = walker.y; last.half = half;
    }
    for (const id of this.actors.keys()) if (!seen.has(id)) this.actors.delete(id);
    return steps;
  }
}
