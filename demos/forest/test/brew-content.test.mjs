import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { tsImport } from 'tsx/esm/api';
import { AdventureDialog } from '@pointlesh/core';
const { assets, dialogs, addChestGuesses } = await tsImport('../src/content.ts', import.meta.url);
const { addBrewAssets, POUR_DURATION_MS } = await tsImport('../src/brew-assets.ts', import.meta.url);
const { interact, newStory, migrateRescueStory } = await tsImport('../src/story.ts', import.meta.url);

test('the king asks for the rope and other NPC replies retain their actual speaker', () => {
  const story = newStory(); story.roomId = 'camp'; story.flags.guardAsleep = true;
  assert.equal(interact(story, 'cage').speaker, 'King Aldric');
  assert.match(interact(story, 'cage').text, /Tie up the guard/);
  story.flags.guardAsleep = false; assert.equal(interact(story, 'guard').speaker, 'Orc guard');
  story.roomId = 'pub'; story.inventory = ['coin']; assert.equal(interact(story, 'innkeeper', 'coin').speaker, 'Mara');
});
test('older completed saves go to the Play again screen instead of reopening the won world', () => {
  const source={...newStory(),introStep:4,endingStep:-1,flags:{won:true}};
  const restored=migrateRescueStory(source);assert.equal(restored.endingStep,4);assert.equal(source.endingStep,-1);
});
test('the chest offers the same four jokes before and after learning the password', () => {
  const before = new AdventureDialog(dialogs, assets), after = new AdventureDialog(dialogs, assets);
  before.start('chest-locked'); after.start('chest-open');
  const unknown = before.advance().options, known = after.advance().options;
  assert.equal(unknown.length, 4); assert.equal(known.length, 5);
  assert.deepEqual(known.filter(option => option.id !== 'open-chest'), unknown);
  assert.equal(known.find(option => option.id === 'open-chest').text, 'Stone remembers.');
  for (const option of unknown) { before.start('chest-locked'); before.advance(); assert.equal(before.choose(option.id).type, 'line'); }
  const copy = structuredClone(dialogs), art = structuredClone(assets); const previous = structuredClone({copy,art});
  addChestGuesses(copy, art); assert.deepEqual({copy,art}, previous);
});
test('purple brew and pouring sheets have distinct alpha frames, stable bases and a saveable action duration', () => {
  for (const id of ['inventory.sleepyStout.idle', 'borin.pour-back']) {
    const asset=assets.assets[id], grid=asset.frameGrid;
    const image=PNG.sync.read(readFileSync(new URL('../public/'+asset.versions[asset.activeVersion].file,import.meta.url)));
    const frames=[];
    for(let i=0;i<8;i++) {
      const frame=new PNG({width:grid.frameWidth,height:grid.frameHeight});
      PNG.bitblt(image,frame,i%4*grid.frameWidth,Math.floor(i/4)*grid.frameHeight,grid.frameWidth,grid.frameHeight,0,0);
      let bottom=-1; for(let y=0;y<grid.frameHeight;y++) for(let x=0;x<grid.frameWidth;x++) if(frame.data[(y*grid.frameWidth+x)*4+3]>16) bottom=y;
      assert.equal(bottom,id.startsWith('borin')?179:29); assert.equal(frame.data[3],0); frames.push(frame.data.toString('base64'));
    }
    assert.equal(new Set(frames).size,8);
  }
  assert.equal(assets.assets['borin.pour-back'].animations[0].frameTimings.reduce((sum,t)=>sum+t.delayMs,0),POUR_DURATION_MS);
  const copy=structuredClone(assets);copy.assets['inventory.sleepyStout'].activeVersion='custom';
  const before=structuredClone(copy);addBrewAssets(copy);assert.deepEqual(copy,before);
});
