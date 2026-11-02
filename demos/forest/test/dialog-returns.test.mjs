import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tsImport } from 'tsx/esm/api';
import { AdventureDialog } from '@pointlesh/core';
const { prepareForestDialogs, dialogReturnNode } = await tsImport('../src/dialog-returns.ts', import.meta.url);
const { dialogs, assets } = await tsImport('../src/content.ts', import.meta.url);
const authored = name => JSON.parse(readFileSync(new URL(`../public/authoring/${name}.json`, import.meta.url), 'utf8'));

for (const [name, source, voices] of [['seed', dialogs, assets], ['authored', authored('dialogs'), authored('assets')]]) {
 test(`${name}: all topics except the last return after the complete reply`, () => {
  const manifest = structuredClone(source); prepareForestDialogs(manifest);
  const before = JSON.stringify(manifest); prepareForestDialogs(manifest); assert.equal(JSON.stringify(manifest), before);
  for (const dialog of Object.values(manifest.dialogs)) {
   const topics = dialog.nodes.topics;
   for (const [index, option] of topics.options.entries()) {
    const runtime = new AdventureDialog(manifest, voices);
    let turn = runtime.start(dialog.id);
    for (let i=0; turn.type === 'line' && i<50; i++) turn = runtime.advance();
    turn = runtime.choose(option.id);
    for (let i=0; turn.type === 'line' && i<50; i++) turn = runtime.advance();
    const returnNode = dialogReturnNode(manifest, runtime.snapshot());
    if (returnNode) turn = runtime.start(dialog.id, returnNode);
    const restored = new AdventureDialog(manifest, voices);
    assert.deepEqual(restored.restore(runtime.snapshot()),turn);
    assert.equal(turn.type, index === topics.options.length-1 ? 'end' : 'decision', `${dialog.id}: ${option.id}`);
    if (turn.type === 'decision') assert.equal(turn.decision.id, topics.id);
   }
  }
 });
}

test('a multi-block reply finishes before returning and does not repeat the greeting', () => {
 const manifest = structuredClone(dialogs);
 const elder = manifest.dialogs.elder;
 const answer = elder.nodes['answer-king'];
 elder.nodes.followup = { ...structuredClone(answer), id:'followup' };
 answer.nextNodeId='followup';
 const runtime = new AdventureDialog(manifest, assets);
 runtime.start('elder'); runtime.advance(); runtime.choose('king');
 assert.equal(runtime.advance().nodeId,'followup');
 assert.equal(runtime.advance().type,'end');
 assert.equal(dialogReturnNode(manifest,runtime.snapshot()),'topics');
 assert.equal(runtime.start('elder','topics').type,'decision');
 runtime.choose('goodbye'); runtime.advance();
 assert.equal(dialogReturnNode(manifest,runtime.snapshot()),undefined);
});
