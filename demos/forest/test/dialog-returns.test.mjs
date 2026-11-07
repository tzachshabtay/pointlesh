import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tsImport } from 'tsx/esm/api';
import { AdventureDialog } from '@pointlesh/core';
import { syncDialogOptionVoiceLines } from '@dialog-designer/core';
const { prepareForestDialogs, optionRecordingMatches } = await tsImport('../src/dialog-returns.ts', import.meta.url);
const { dialogs, assets } = await tsImport('../src/content.ts', import.meta.url);
const authored = name => JSON.parse(readFileSync(new URL(`../public/authoring/${name}.json`, import.meta.url), 'utf8'));

test('choice speech accepts an auditioned take but rejects outdated text or a different speaker', () => {
 const option = dialogs.dialogs.elder.nodes.topics.options[0];
 const asset = structuredClone(assets.assets[option.lineAssetId]);
 assert.equal(optionRecordingMatches(asset, option.text, 'voice.borin'), false);
 asset.activeVersion = 'audition';
 asset.versions.audition = { file:'take.wav', voiceSettings:{text:option.text,voiceAssetId:'voice.borin'} };
 assert.equal(optionRecordingMatches(asset, option.text, 'voice.borin'), true);
 assert.equal(optionRecordingMatches(asset, 'Changed choice', 'voice.borin'), false);
 assert.equal(optionRecordingMatches(asset, option.text, 'voice.elder'), false);
});

for (const [name, source, voices] of [['seed', dialogs, assets], ['authored', authored('dialogs'), authored('assets')]]) {
 test(`${name}: spoken topic settings control return/exit, including all chest choices`, () => {
  const manifest = structuredClone(source); prepareForestDialogs(manifest);
  const speech = syncDialogOptionVoiceLines(manifest, voices);
  const before = JSON.stringify(manifest); prepareForestDialogs(manifest); assert.equal(JSON.stringify(manifest), before);
  for (const dialog of Object.values(manifest.dialogs)) {
   const topics = dialog.nodes.topics;
   for (const [index, option] of topics.options.entries()) {
    assert.equal(option.exitDialog,dialog.id.startsWith('chest-') || index===topics.options.length-1);
    assert.equal(option.spokenByCharacter,true);
    assert.equal(option.voiceAssetId,'voice.borin');
    assert.equal(speech.assets[option.lineAssetId].voiceSettings.text,option.text);
    // Story-gated topics are covered with their live flags in dialog-story.test.mjs.
    if (!option.enabled) continue;
    const runtime = new AdventureDialog(manifest, speech);
    let turn = runtime.start(dialog.id);
    for (let i=0; turn.type === 'line' && i<50; i++) turn = runtime.advance();
    turn = runtime.choose(option.id);
    assert.equal(turn.optionId,option.id);assert.equal(turn.resolved.text,option.text);
    const restored = new AdventureDialog(manifest,speech);
    assert.deepEqual(restored.restore(runtime.snapshot()),turn);
    for (let i=0; turn.type === 'line' && i<50; i++) turn = runtime.advance();
    assert.equal(turn.type,option.exitDialog ? 'end' : 'decision',`${dialog.id}: ${option.id}`);
    assert.deepEqual(restored.restore(runtime.snapshot()),turn);
   }
  }
 });
}

test('explicit designer settings win over defaults and complete reply trees return only at their end',()=>{
 const manifest=structuredClone(dialogs),elder=manifest.dialogs.elder;
 const answer=elder.nodes['answer-king'];elder.nodes.followup={...structuredClone(answer),id:'followup'};answer.nextNodeId='followup';
 const last=elder.nodes.topics.options.at(-1);last.exitDialog=false;last.spokenByCharacter=false;
 prepareForestDialogs(manifest);assert.equal(last.exitDialog,false);assert.equal(last.spokenByCharacter,false);
 const runtime=new AdventureDialog(manifest,assets);runtime.start('elder');runtime.advance();
 assert.equal(runtime.choose('king').optionId,'king');assert.equal(runtime.advance().nodeId,'answer-king');assert.equal(runtime.advance().nodeId,'followup');assert.equal(runtime.advance().type,'decision');
 assert.equal(runtime.choose(last.id).nodeId,'answer-goodbye');assert.equal(runtime.advance().type,'decision');
});
