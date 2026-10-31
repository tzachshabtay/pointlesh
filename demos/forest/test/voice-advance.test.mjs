import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { tsImport } from 'tsx/esm/api';
const { VoiceAdvance } = await tsImport('../src/voice-advance.ts', import.meta.url);

test('voiced speech advances once, half a second after completion, respecting pause', () => {
  let advanced = 0, finished = 0;
  const voice = new EventEmitter();
  const next = new VoiceAdvance(() => advanced++, () => finished++);
  next.follow(voice); next.update(10000, false); assert.equal(advanced, 0);
  voice.emit('complete'); assert.equal(finished, 1);
  next.update(499, false); assert.equal(advanced, 0);
  next.update(10000, true); assert.equal(advanced, 0);
  next.update(1, false); assert.equal(advanced, 1);
  next.update(10000, false); assert.equal(advanced, 1);
});

test('manual skips, new lines and unvoiced speech cannot inherit a pending advance', () => {
  let advanced = 0;
  const next = new VoiceAdvance(() => advanced++, () => {}), first = new EventEmitter(), second = new EventEmitter();
  next.follow(first); next.follow(second); first.emit('complete'); next.update(1000, false);
  second.emit('complete'); next.cancel(); next.update(1000, false);
  next.follow(first); first.emit('complete'); next.follow(); next.update(1000, false);
  assert.equal(advanced, 0);
});
