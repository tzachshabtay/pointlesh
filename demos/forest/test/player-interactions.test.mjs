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

test('Borin actions use editable interaction cells and synced hero voice lines', () => {
  const manifest = createForestInteractions(addForestInventoryPrefabs(structuredClone(authored)));
  const row = 'prefab:forest.character.borin';
  const voices = syncInteractionVoiceLines(manifest, structuredClone(assets));
  for (const column of ['verb:interact', 'verb:look', 'item:forest.inventory.rope']) {
    const { cell } = resolveInteraction(manifest, row, column);
    assert.equal(cell.kind, 'simple');
    assert.ok(cell.text.length);
    assert.ok(voices.assets[interactionVoiceLineId(row, column)]);
  }
  assert.equal(entityInteractionId({ id: 'camp.npc.king', properties: { targetId: 'cage' } }), 'cage');
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
      assert.deepEqual(manifest.cells[row.id]?.[column], { kind: 'impossible' }, 'door metadata is retained');
      assert.equal(resolveInteraction(manifest, row.id, 'verb:interact').cell.kind, 'code', 'ordinary door clicks still travel');
      const spoken = [];
      await runInteraction(manifest, row.id, column, { say: text => spoken.push(text), code: () => assert.fail('Coin must not trigger a room transition') });
      assert.deepEqual(spoken, ['No. This is not what the coin is for.'], row.name);
    }
  }
});
