import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureLipSyncClock } from '../dist/audio-assets.js';

test('portrait lip sync adds the trim start once and uses Phaser’s rate-adjusted seek',()=>{
  const sound={isPlaying:true,isPaused:false,seek:1.25,currentMarker:{start:2}};
  const clock=adventureLipSyncClock(sound);
  assert.deepEqual(clock(),{seconds:3.25,playing:true,paused:false});
  sound.isPlaying=false;sound.isPaused=true;
  assert.deepEqual(clock(),{seconds:3.25,playing:false,paused:true});
  sound.currentMarker=null;sound.seek=0;
  assert.equal(clock().seconds,0);
});
