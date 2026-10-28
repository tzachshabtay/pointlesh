import type { AiAssetManifest, AiAssetDefinition } from '@ai-game-assets/core';

const musicStyle = 'Instrumental fantasy adventure game score, intimate acoustic ensemble, warm natural recording, no vocals, no choir, no speech, no modern drum kit. A complete gently developing repeating musical phrase, steady dynamics, no long silent intro or final fade. Leave space for dialogue. ';
export const forestAudio: Record<string, AiAssetDefinition> = {};
function asset(id: string, kind: 'music' | 'sound', prompt: string, seconds: number, loop: boolean, folder: string) {
  forestAudio[id] = { id, kind, prompt, tags: ['forest', 'audio', folder.toLowerCase()],
    audioSettings: { provider: 'elevenlabs', format: 'mp3', durationSeconds: seconds, loop },
    audioPlayback: { volume: 1, loop }, activeVersion: 'original',
    versions: { original: { name: 'original', file: `art/audio/${id}.mp3`, prompt,
      model: kind === 'music' ? 'music_v1' : 'eleven_text_to_sound_v2', createdAt: '2026-10-27T00:00:00.000Z' } } };
}
const tracks = {
  tense: 'The king is abducted by orcs. Tense stealth and looming danger, low bowed strings, restrained frame drum heartbeat, dark bassoon, sparse dulcimer. D minor, 80 BPM. Suspense rather than action combat, quiet ominous pulse throughout.',
  ending: 'A dwarf rescues his king and returns home. Triumphant joyful homecoming, noble French horn melody, bright strings, harp and celebratory frame drums. D major, 96 BPM. Earned warmth and relief, a memorable heroic theme, no abrupt orchestral stabs.',
  village: 'Bramblehollow, a peaceful dwarf village among ancient trees. Welcoming wistful melody on wooden flute and fiddle, plucked lute, mellow cello, gentle hand drum. D major, 84 BPM. Cozy, brave, a hint of the adventure ahead.',
  pub: 'The Copper Tankard, a cozy dwarven tavern. Playful lilting fiddle and hammered dulcimer, lute and soft bodhran, a rustic 6/8 folk dance at 100 BPM. Friendly humorous warmth, never frantic, no crowd sounds in the music.',
  house: 'Borin’s quiet cottage, preparing for an adventure by the hearth. Intimate fingerpicked lute, warm cello and delicate harp, a simple tender melody. G major, 68 BPM. Restful and homely, no percussion, no fire sounds in the music.',
  forest: 'The Whispering Wood, a mysterious ancient forest. Airy wooden flute, soft harp arpeggios, sustained viola and low cello, subtle magical celesta. E dorian, 72 BPM. Wonder and gentle curiosity, tranquil exploration, not horror. No birds or wind in the music.',
  mine: 'Goldroot Mine, an old dwarven gold mine with runic secrets. Sparse resonant hammered dulcimer, deep cello, muted frame drum and mysterious bass clarinet. A dorian, 64 BPM. Measured, subterranean, intriguing, not horror. No mining sound effects in the music.',
};
for (const [name, prompt] of Object.entries(tracks)) asset(`music.${name}`, 'music', musicStyle + prompt, name === 'ending' ? 48 : 64, true, 'Music');
const ambience = {
  village: 'Quiet medieval woodland village atmosphere. Soft wind through leaves, occasional distant birds, faint wooden house creaks. Peaceful subtle stereo background, no voices, no music, no prominent footsteps. Seamless continuous ambience.',
  pub: 'Cozy small medieval tavern interior ambience. Gentle hearth crackle, occasional soft wooden creak and distant ceramic mug clink. Subdued indistinct room murmur without intelligible words. No music or footsteps. Seamless quiet background loop.',
  house: 'Small cozy stone cottage fireplace, gentle close crackling embers with soft room air and occasional wooden beam creak. Quiet and soothing, no roaring flames, no speech, no music. Seamless background ambience.',
  forest: 'Ancient leafy forest in daylight, soft canopy breeze, rustling leaves, scattered small songbird calls at varied distances, occasional delicate insects. Natural spacious stereo ambience, restrained and peaceful. No music, no speech, no footsteps. Seamless loop.',
  mine: 'Deep quiet stone mine ambience, sparse water droplets with natural cave echoes, very low hollow air movement, occasional distant stone settling. No machinery, no music, no speech, no footsteps. Quiet spacious seamless loop.',
  camp: 'Forest orc camp at dusk, low fire crackle beneath a gently bubbling iron cauldron, faint woodland wind, occasional wooden palisade creak and distant crow. No voices, no music, no footsteps. Subtle seamless atmospheric loop.',
};
for (const [name, prompt] of Object.entries(ambience)) asset(`ambience.${name}`, 'sound', prompt, 20, true, 'Ambience');
const steps = {
  'dwarf-earth': 'One single firm leather boot footstep on packed earth with a tiny dry leaf crunch, stocky dwarf walker. Close dry foley, quick heel then sole impact, no reverb, no voice, no music, no extra steps. Impact at the beginning, short natural tail.',
  'dwarf-stone': 'One single sturdy leather boot footstep on stone paving, stocky dwarf walker. Close dry foley, solid low heel and slight sole scuff. No reverb, no voice, no music, no extra steps. Impact at the beginning, short natural tail.',
  'dwarf-wood': 'One single sturdy leather boot footstep on a wooden tavern floor with a very slight board creak. Close dry foley, no reverb, no voice, no music, no extra steps. Impact at the beginning, short natural tail.',
  king: 'One single measured leather shoe footstep with a very soft cloth robe rustle. Dignified older dwarf king on an earth path. Close dry foley, no reverb, no voice, no music, no extra steps. Impact at the beginning, short natural tail.',
  orc: 'One single heavy orc boot thud on hard earth, slight leather armor creak and tiny metal buckle rattle. Weighty but not a monster stomp. Close dry foley, no voice, no music, no extra steps. Impact at the beginning, short natural tail.',
};
for (const [name, prompt] of Object.entries(steps)) for (const variation of [1, 2]) asset(`step.${name}.${variation}`, 'sound', prompt, .7, false, 'Footsteps');

export function addForestAudio(manifest: AiAssetManifest): void {
  for (const [id, definition] of Object.entries(forestAudio)) {
    manifest.assets[id] ??= structuredClone(definition);
    (manifest.assetPaths ??= {})[id] ??= ['Audio', id.startsWith('music.') ? 'Music' : id.startsWith('ambience.') ? 'Ambience' : 'Footsteps'];
  }
}
