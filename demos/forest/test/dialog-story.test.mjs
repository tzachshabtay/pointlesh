import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tsImport } from 'tsx/esm/api';
import { AdventureDialog } from '@pointlesh/core';

const manifest = JSON.parse(readFileSync(new URL('../public/authoring/dialogs.json', import.meta.url), 'utf8'));
const assets = JSON.parse(readFileSync(new URL('../public/authoring/assets.json', import.meta.url), 'utf8'));
const { addForestStoryDialogs, forestDialogEnabled } = await tsImport('../src/dialog-story.ts', import.meta.url);
const { prepareForestDialogs } = await tsImport('../src/dialog-returns.ts', import.meta.url);
const { applyDialogChoice, newStory } = await tsImport('../src/story.ts', import.meta.url);

function begin(dialogId, flags = {}) {
  const state = { flags };
  const conversation = new AdventureDialog(manifest, assets,
    { isEnabled: target => forestDialogEnabled(manifest, state, target) });
  let turn = conversation.start(dialogId);
  const greeting = turn.type === 'line' ? turn.resolved.text : '';
  while (turn.type === 'line') turn = conversation.advance();
  assert.equal(turn.type, 'decision');
  return { greeting, options: turn.options.map(option => option.id), conversation };
}

test('new optional branches are authored as disabled and unlock with story progress', () => {
  for (const [dialogId, optionId, assetId] of [
    ['elder', 'father', 'line.elder.father'],
    ['innkeeper', 'king-tab', 'line.innkeeper.king-tab'],
    ['miner', 'pickaxe', 'line.miner.pickaxe'],
  ]) {
    const dialog = manifest.dialogs[dialogId];
    assert.equal(dialog.nodes.topics.options.find(option => option.id === optionId).enabled, false);
    assert.equal(dialog.nodes[`answer-${optionId}`].enabled, false);
    assert.ok(assets.assets[assetId]);
  }
  assert.deepEqual(begin('elder').options, ['king', 'advice', 'goodbye']);
  const story = newStory();
  applyDialogChoice(story, 'advice');
  assert.ok(begin('elder', story.flags).options.includes('father'));
  assert.deepEqual(begin('innkeeper').options, ['dreamcap', 'buy', 'goodbye']);
  assert.deepEqual(begin('innkeeper', { knowsDreamcap: true, boughtStout: true }).options,
    ['dreamcap', 'king-tab', 'goodbye']);
  assert.equal(manifest.dialogs.innkeeper.nodes.topics.options.find(option => option.id === 'king-tab').text,
    'What was Aldric like on his last visit?');
  assert.match(assets.assets['line.innkeeper.king-tab'].voiceSettings.text, /Same as every visit/);
});

test('Orrin keeps the chest question until Borin actually has the pickaxe', () => {
  assert.match(begin('miner').greeting, /locked in the runed chest/);
  assert.deepEqual(begin('miner', { knowsPassword: true }).options,
    ['password', 'mining', 'goodbye']);
  assert.match(begin('miner', { chestOpen: true }).greeting, /runes finally had something to say/);
  assert.ok(begin('miner', { chestOpen: true, knowsPassword: true }).options.includes('password'));
  const after = begin('miner', { chestOpen: true, tookPickaxe: true, knowsPassword: true });
  assert.match(after.greeting, /borrow my best steel/);
  assert.deepEqual(after.options, ['mining', 'pickaxe', 'goodbye']);
  assert.equal(manifest.dialogs.miner.nodes.topics.options.find(option => option.id === 'goodbye').text,
    'I should get back to the road.');
});

test('story additions are idempotent and the known-password chest does not refer Borin back to Orrin', () => {
  const copy = structuredClone(manifest), copyAssets = structuredClone(assets);
  addForestStoryDialogs(copy, copyAssets); prepareForestDialogs(copy);
  addForestStoryDialogs(copy, copyAssets); prepareForestDialogs(copy);
  for (const dialogId of ['elder', 'innkeeper', 'miner']) {
    const ids = copy.dialogs[dialogId].nodes.topics.options.map(option => option.id);
    assert.equal(ids.length, new Set(ids).size);
  }
  assert.equal(copy.dialogs.miner.nodes.opening.lines.length, 3);
  assert.doesNotMatch(copyAssets.assets['line.chest-open.guess'].voiceSettings.text, /Orrin/);
});

test('older authored dialogs gain the corrected availability and Mara exchange', () => {
  const copy = structuredClone(manifest), copyAssets = structuredClone(assets);
  const mara = copy.dialogs.innkeeper.nodes;
  mara.topics.options.find(option => option.id === 'dreamcap').metadata = { hideAfterFlag: 'knowsDreamcap' };
  mara.topics.options.find(option => option.id === 'buy').metadata = { hideAfterFlag: 'boughtStout' };
  mara.topics.options.find(option => option.id === 'king-tab').text = 'Did Aldric ever come in here?';
  mara['answer-king-tab'].name = 'Did Aldric ever come in here?';
  copy.dialogs.miner.nodes.topics.options.find(option => option.id === 'password').metadata =
    { hideAfterFlag: 'knowsPassword' };
  copyAssets.assets['line.innkeeper.king-tab'].voiceSettings.text =
    'He used to sit where Orrin sits now and lose at cards with great dignity. He paid every tab, including the ones he did not owe.';
  addForestStoryDialogs(copy, copyAssets);
  assert.equal(mara.topics.options.find(option => option.id === 'dreamcap').metadata, undefined);
  assert.equal(mara.topics.options.find(option => option.id === 'buy').metadata.hideAfterFlag, 'boughtStout');
  assert.equal(copy.dialogs.miner.nodes.topics.options.find(option => option.id === 'password').metadata.hideAfterFlag,
    'tookPickaxe');
  assert.equal(mara.topics.options.find(option => option.id === 'king-tab').text,
    'What was Aldric like on his last visit?');
  assert.match(copyAssets.assets['line.innkeeper.king-tab'].voiceSettings.text, /Same as every visit/);
});
