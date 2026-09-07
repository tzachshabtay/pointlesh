import test from 'node:test';
import assert from 'node:assert/strict';
import { defineAiAssets } from '@ai-game-assets/core';
import { defineDialogManifest } from '@dialog-designer/core';
import { AdventureDialog } from '../dist/index.js';

const assets = defineAiAssets({
  speaker: { id: 'speaker', kind: 'voice', prompt: 'A dwarf', versions: {} },
  greeting: { id: 'greeting', kind: 'voice-line', prompt: 'Welcome', voiceSettings: { voiceAssetId: 'speaker', text: 'Welcome' }, versions: {} },
  answer: { id: 'answer', kind: 'voice-line', prompt: 'Stone remembers', voiceSettings: { voiceAssetId: 'speaker', text: 'Stone remembers' }, versions: {} },
});
const manifest = defineDialogManifest({ schemaVersion: 1, dialogs: { miner: {
  id: 'miner', name: 'Miner', enabled: true, entryNodeId: 'opening', nodes: {
    opening: { id: 'opening', type: 'block', name: 'Greeting', enabled: true, lines: [{ id: 'hello', enabled: true, voiceAssetId: 'speaker', lineAssetId: 'greeting' }], nextNodeId: 'topics' },
    topics: { id: 'topics', type: 'decision', name: 'Topics', prompt: 'What will you ask?', enabled: true, options: [{ id: 'password', text: 'The password?', enabled: true, nextNodeId: 'answer' }] },
    answer: { id: 'answer', type: 'block', name: 'Secret', enabled: true, lines: [{ id: 'secret', enabled: true, voiceAssetId: 'speaker', lineAssetId: 'answer' }] },
  },
} } });

test('dialog checkpoint resumes a selected reply without replaying gameplay listeners', () => {
  const original = new AdventureDialog(manifest, assets);
  const effects = [];
  original.onTurn(turn => effects.push(turn.type));
  original.start('miner'); original.advance(); original.choose('password');
  const saved = original.snapshot();
  assert.deepEqual(effects, ['line', 'decision', 'line']);
  const restored = new AdventureDialog(manifest, assets);
  restored.onTurn(turn => effects.push(turn.type));
  assert.deepEqual(restored.restore(saved), original.current());
  assert.equal(effects.length, 3);
  assert.equal(restored.advance().type, 'end');
  assert.equal(effects.length, 4);
  saved.commands.push({ type: 'advance' });
  assert.equal(restored.snapshot().commands.length, 3);
});

test('malformed or incompatible dialog checkpoint fails before replacing active conversation', () => {
  const dialog = new AdventureDialog(manifest, assets);
  dialog.start('miner'); dialog.advance();
  const before = dialog.snapshot(), turn = dialog.current();
  for (const invalid of [
    { dialogId: 'missing', commands: [] },
    { dialogId: 'miner', commands: null },
    { dialogId: 'miner', commands: [null] },
    { dialogId: 'miner', commands: [{ type: 'choose', optionId: 'password' }] },
    { dialogId: 'miner', commands: [{ type: 'advance' }, { type: 'choose', optionId: 'wrong' }] },
    { dialogId: 'miner', commands: [{ type: 'advance' }, { type: 'advance' }] },
  ]) assert.throws(() => dialog.restore(invalid));
  assert.deepEqual(dialog.snapshot(), before);
  assert.deepEqual(dialog.current(), turn);
  dialog.restore(null);
  assert.equal(dialog.current(), undefined);
});

test('post-completion no-op commands never create an unrestorable checkpoint', () => {
  const dialog = new AdventureDialog(manifest, assets);
  dialog.start('miner'); dialog.advance(); dialog.choose('password'); dialog.advance();
  const checkpoint = dialog.snapshot();
  try { dialog.advance(); } catch { /* Explicitly rejecting input after completion is also safe. */ }
  try { dialog.choose('password'); } catch { /* Same for choices after completion. */ }
  assert.deepEqual(dialog.snapshot(), checkpoint);
  assert.equal(new AdventureDialog(manifest, assets).restore(checkpoint).type, 'end');
});

test('caller-owned manifest/options mutations do not change an active dialog or its replay source', () => {
  const mutableManifest = structuredClone(manifest), mutableAssets = structuredClone(assets);
  const options = { isEnabled: () => undefined };
  const dialog = new AdventureDialog(mutableManifest, mutableAssets, options);
  dialog.start('miner'); dialog.advance(); dialog.choose('password');
  const checkpoint = dialog.snapshot(), turn = dialog.current();
  mutableManifest.dialogs.miner.nodes.topics.options.length = 0;
  delete mutableAssets.assets.answer;
  options.isEnabled = () => false;
  assert.deepEqual(dialog.restore(checkpoint), turn);
  assert.equal(dialog.advance().type, 'end');
});

test('gated choice restores after its effect hides it, without calling historical external predicates', () => {
  let knownPassword = false;
  const isEnabled = target => target.type === 'option' && target.optionId === 'password' ? !knownPassword : undefined;
  const original = new AdventureDialog(manifest, assets, { isEnabled });
  original.start('miner'); original.advance(); original.choose('password');
  knownPassword = true; // The selected reply applies its gameplay effect and hides this topic.
  const checkpoint = original.snapshot(), expected = original.current();
  assert.equal(checkpoint.enablement.length, checkpoint.commands.length + 1);
  let calls = 0;
  const restored = new AdventureDialog(manifest, assets, { isEnabled: target => { calls++; return isEnabled(target); } });
  assert.deepEqual(restored.restore(checkpoint), expected);
  assert.equal(calls, 0, 'Restore must use recorded answers without executing the current predicate');
  assert.equal(restored.advance().type, 'end');
  assert.ok(calls > 0, 'Commands after restoration evaluate live conditions again');
  restored.start('miner');
  assert.equal(restored.advance().type, 'end', 'The now-hidden topic stays hidden in future conversations');
});

test('legacy command-only checkpoints replay and acquire enablement history for subsequent saves', () => {
  const legacy = { dialogId: 'miner', commands: [{ type: 'advance' }, { type: 'choose', optionId: 'password' }] };
  const dialog = new AdventureDialog(manifest, assets);
  assert.equal(dialog.restore(legacy).type, 'line');
  assert.equal(dialog.snapshot().enablement.length, 3);
  const noPredicates = new AdventureDialog(manifest, assets, { isEnabled: () => { throw new Error('Must not run during replay'); } });
  assert.equal(noPredicates.restore(dialog.snapshot()).type, 'line');
});

test('malformed, reordered or unconsumed enablement history never replaces the active dialog', () => {
  const dialog = new AdventureDialog(manifest, assets);
  dialog.start('miner'); dialog.advance(); dialog.choose('password');
  const valid = dialog.snapshot(), before = dialog.current();
  const invalid = change => { const value = structuredClone(valid); change(value); return value; };
  const candidates = [
    invalid(value => value.enablement.pop()),
    invalid(value => { value.enablement[0] = null; }),
    invalid(value => { value.enablement[0][0].value = 'yes'; }),
    invalid(value => { value.enablement[0][0].target = 'option:wrong'; }),
    invalid(value => { value.enablement[0].shift(); }),
    invalid(value => { value.enablement[0].push({ target: 'dialog:miner', value: true }); }),
    invalid(value => { value.enablement[0] = []; }),
    false, 0,
  ];
  for (const candidate of candidates) assert.throws(() => dialog.restore(candidate), /checkpoint|enablement/);
  assert.deepEqual(dialog.current(), before);
  assert.deepEqual(dialog.snapshot(), valid);
  assert.equal(dialog.advance().type, 'end', 'A failed replay must not leave the live gate in replay mode');
});
