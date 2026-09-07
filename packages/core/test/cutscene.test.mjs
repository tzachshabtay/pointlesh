import test from 'node:test';
import assert from 'node:assert/strict';
import { CutsceneRunner } from '../dist/index.js';

const definition = { id: 'rescue', version: 1, steps: [
  { id: 'unlock', speaker: 'Borin', text: 'Stand back!', durationMs: 100 },
  { id: 'climb', speaker: 'Aldric', text: 'A very undignified descent.', durationMs: 200 },
  { id: 'home', text: 'Home again.' },
] };

test('cutscene skip and normal playback apply identical ordered final effects exactly once', () => {
  const watched = [], skipped = [];
  const normal = new CutsceneRunner(definition, { onCompleteStep: step => watched.push(step.id) });
  const fast = new CutsceneRunner(definition, { onCompleteStep: (step, event) => { assert.equal(event.skipped, true); skipped.push(step.id); } });
  normal.tick(300);
  assert.equal(normal.current().id, 'home');
  normal.advance();
  fast.skip(); fast.skip(); normal.advance();
  assert.equal(normal.completed, true);
  assert.deepEqual(watched, ['unlock', 'climb', 'home']);
  assert.deepEqual(skipped, watched);
});

test('restoring a mid-cutscene checkpoint emits no prior effects and preserves elapsed time', () => {
  const first = new CutsceneRunner(definition);
  first.tick(175);
  const effects = [];
  const restored = new CutsceneRunner(definition, { onCompleteStep: step => effects.push(step.id) });
  restored.restore(first.snapshot());
  assert.deepEqual(effects, []);
  assert.equal(restored.current().id, 'climb');
  restored.tick(124);
  assert.equal(restored.current().id, 'climb');
  restored.tick(1);
  assert.equal(restored.current().id, 'home');
  assert.deepEqual(effects, ['climb']);
});

test('wrong versions and malformed checkpoints leave the active cutscene untouched', () => {
  const runner = new CutsceneRunner(definition);
  runner.advance();
  const snapshot = runner.snapshot();
  for (const invalid of [
    { ...snapshot, version: 2 }, { ...snapshot, cutsceneId: 'intro' },
    { ...snapshot, stepIndex: 4 }, { ...snapshot, elapsedMs: 200 },
    { ...snapshot, stepIndex: 3, elapsedMs: 1 },
  ]) assert.throws(() => runner.restore(invalid), /checkpoint|elapsed/);
  assert.deepEqual(runner.snapshot(), snapshot);
});

test('a failed completion callback does not advance the checkpoint', () => {
  const runner = new CutsceneRunner(definition, { onCompleteStep: () => { throw new Error('Failed effect'); } });
  assert.throws(() => runner.advance(), /Failed effect/);
  assert.equal(runner.current().id, 'unlock');
  assert.equal(runner.snapshot().stepIndex, 0);
});

test('definition inputs and public copies cannot silently change a running cutscene checkpoint', () => {
  const input = structuredClone(definition), runner = new CutsceneRunner(input);
  input.steps.length = 0;
  const publicDefinition = runner.definition;
  publicDefinition.steps[0].durationMs = 1;
  publicDefinition.steps.splice(1);
  runner.tick(50);
  assert.equal(runner.current().id, 'unlock');
  runner.restore(runner.snapshot());
  runner.tick(50);
  assert.equal(runner.current().id, 'climb');
  assert.equal(runner.definition.steps.length, 3);
});
