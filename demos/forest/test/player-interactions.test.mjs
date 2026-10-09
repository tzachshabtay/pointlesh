import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tsImport } from 'tsx/esm/api';
import { resolvePointleshScene, sceneInteractionTarget, resolveInteraction, syncInteractionVoiceLines, interactionVoiceLineId } from '@pointlesh/core';
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
