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

const effects: Record<string, [number, string]> = {
  'cage-close': [1.2, 'A heavy iron cage door swings shut with a short rusty hinge squeak then a solid metallic slam and brief bars rattle. One closure, compact dry fantasy game foley.'],
  'guard-slurp': [1.4, 'One deep coarse slurp of thick soup by a large gruff creature, followed by a short wet gulp. Comic but restrained. No words, no growling.'],
  pickup: [.7, 'A single pleasing delicate metallic treasure chime, two quick ascending warm bell notes with a tiny leather pouch rustle. Short subtle fantasy adventure item pickup feedback, not a fanfare.'],
  'door-open': [1.2, 'One old solid wooden cottage door opening: latch click then a gentle low wooden hinge creak. No slam, no footsteps.'],
  'door-close': [1.0, 'One solid wooden cottage door closing: a short soft hinge creak then a warm wooden thunk and latch click. Not a violent slam.'],
  'miner-slurp': [1.1, 'One small friendly dwarf taking a sip of beer from a ceramic tankard: light liquid sip, satisfied quiet swallow, tiny mug clink. No words, no burp. Different from a big creature slurping soup.'],
  coin: [.7, 'A single copper coin handed over and placed on a wooden tavern counter: delicate bright metal clink and a tiny settling tap. No shower of coins.'],
  'chest-open': [2.5, 'Runes on an ancient dwarven wooden chest awaken with a soft ascending crystalline magical shimmer, then its heavy hinged lid creaks open with a gentle wooden stop. One short coherent action.'],
  'journal-write': [2.2, 'A quill pen writing a short note on dry parchment: delicate scratchy nib strokes with brief natural pauses, very faint paper rustle. Close soft detailed foley, no voice.'],
  'brew-mix': [1.3, 'A small mushroom drops into a tankard of stout with a soft plop, followed by a few gentle magical purple potion bubbles. Short wet gurgle, not an explosion.'],
  'brew-pour': [1.7, 'A small tankard of liquid pours into a thick soup cauldron: brief continuous liquid trickle and soft splashes, ending in two drips. One pour, close foley.'],
  'guard-fall': [1.0, 'A large armored orc slumps onto packed earth with a heavy low body thud, small leather armor creak and metal buckle rattle settling. One fall. No vocal, no footsteps.'],
  'rope-tie': [2.0, 'Coarse hemp rope slides and wraps around leather clothing, two quick pulls tighten a knot. Detailed dry fibrous rubbing and creak, short tying action. No voices.'],
  'lock-break': [.9, 'One precise pickaxe strike breaks an iron padlock: sharp metal impact, brief brittle metal snap, small lock pieces clattering to stone. One hit, not repeated hammering.'],
};
for (const [name, [seconds, prompt]] of Object.entries(effects)) asset(`sfx.${name}`, 'sound', `${prompt} Isolated sound effect, no music, no background ambience. Action begins immediately, short natural tail.`, seconds, false, 'SFX');

export function addForestAudio(manifest: AiAssetManifest): void {
  for (const [id, definition] of Object.entries(forestAudio)) {
    manifest.assets[id] ??= structuredClone(definition);
    (manifest.assetPaths ??= {})[id] ??= ['Audio', id.startsWith('music.') ? 'Music' : id.startsWith('ambience.') ? 'Ambience' : id.startsWith('step.') ? 'Footsteps' : 'SFX'];
  }
}
