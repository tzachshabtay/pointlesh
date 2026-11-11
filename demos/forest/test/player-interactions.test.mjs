import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tsImport } from 'tsx/esm/api';
import { resolvePointleshScene, sceneInteractionTarget, resolveInteraction, syncInteractionVoiceLines, interactionVoiceLineId, interactionTargets, runInteraction } from '@pointlesh/core';
const { scenes, assets } = await tsImport('../src/content.ts', import.meta.url);
const { createForestInteractions, entityInteractionId } = await tsImport('../src/interactions.ts', import.meta.url);
const { addForestInventoryPrefabs } = await tsImport('../src/inventory-prefabs.ts', import.meta.url);
const authored = JSON.parse(readFileSync(new URL('../public/authoring/scenes.json', import.meta.url), 'utf8'));

for (const [name, source] of [['seed', scenes], ['authored', authored]]) {
  test(`${name}: Borin is non-interactive by default and the prefab toggle applies in every room`, () => {
    const edited = structuredClone(source);
    for (const sceneId of Object.keys(edited.scenes)) {
      const borin = resolvePointleshScene(edited, sceneId).objects.find(entity => entity.properties.role === 'player');
      assert.equal(borin.properties.interactive, false);
    }
    edited.prefabs['forest.character.borin'].pointlesh.properties.interactive = true;
    for (const sceneId of Object.keys(edited.scenes)) {
      const borin = resolvePointleshScene(edited, sceneId).objects.find(entity => entity.properties.role === 'player');
      assert.equal(borin.properties.interactive, true);
      assert.equal(entityInteractionId(borin), borin.id);
      assert.equal(sceneInteractionTarget(sceneId, borin), 'prefab:forest.character.borin');
    }
  });
}

test('Borin speech uses editable interaction cells and linked hero voice lines', () => {
  const manifest = createForestInteractions(addForestInventoryPrefabs(structuredClone(authored)));
  const row = 'prefab:forest.character.borin';
  const voices = syncInteractionVoiceLines(manifest, structuredClone(assets));
  for (const column of ['verb:interact', 'verb:look']) {
    const { cell } = resolveInteraction(manifest, row, column);
    assert.equal(cell.kind, 'simple');
    assert.ok(cell.text.length);
    assert.ok(voices.assets[interactionVoiceLineId(row, column)]);
  }
  assert.equal(manifest.cells[row]['item:forest.inventory.rope'], undefined);
  assert.equal(entityInteractionId({ id: 'camp.npc.king', properties: { targetId: 'cage' } }), 'cage');
});

test('generic inventory responses inherit defaults while story-specific interactions remain', () => {
  const saved = JSON.parse(readFileSync(new URL('../public/authoring/interactions.json', import.meta.url), 'utf8'));
  const seed = createForestInteractions(addForestInventoryPrefabs(structuredClone(authored)));
  for (const manifest of [saved, seed]) {
    assert.equal(manifest.cells['prefab:forest.character.elder']['item:forest.inventory.rope'], undefined);
    assert.equal(manifest.cells['prefab:forest.inventory.rope']['item:forest.inventory.coin'], undefined);
    assert.equal(manifest.cells['prefab:forest.character.guard']['item:forest.inventory.rope'].kind, 'code');
  }
  assert.equal(resolveInteraction(saved, 'prefab:forest.character.elder', 'item:forest.inventory.rope').cell.text,
    "There's no point in tying that.");
});


test('doors and exits inherit inventory defaults without triggering room travel', async () => {
  const { targets } = await tsImport('../src/story.ts', import.meta.url);
  const rows = interactionTargets(authored).filter(row => Object.values(targets).flat().some(target =>
    target.exit && target.id === String(row.properties.targetId ?? row.locations[0]?.entityId ?? '')));
  assert.ok(rows.length > 0);
  const saved = JSON.parse(readFileSync(new URL('../public/authoring/interactions.json', import.meta.url), 'utf8'));
  for (const manifest of [createForestInteractions(addForestInventoryPrefabs(structuredClone(authored))), saved]) {
    const column = 'item:forest.inventory.coin';
    manifest.cells.defaults = { [column]: { kind: 'simple', text: 'No. This is not what the coin is for.' } };
    for (const row of rows) {
      assert.equal(manifest.cells[row.id]?.[column], undefined, 'possible inventory uses remain empty');
      assert.ok(Object.keys(manifest.cells[row.id]).every(key => !key.startsWith('item:')), 'all exit inventory cells inherit Defaults');
      assert.equal(resolveInteraction(manifest, row.id, 'verb:interact').cell.kind, 'code', 'ordinary door clicks still travel');
      const spoken = [];
      await runInteraction(manifest, row.id, column, { say: text => spoken.push(text), code: () => assert.fail('Coin must not trigger a room transition') });
      assert.deepEqual(spoken, ['No. This is not what the coin is for.'], row.name);
    }
  }
});
