import test from 'node:test';
import assert from 'node:assert/strict';
import { pointleshPrefabs, extendPointleshPrefab, createCharacterPrefab } from '@pointlesh/core';
import { isPrefabTemplate, prefabFolderPath } from '../dist/prefab-browser.js';

test('only base templates are hidden; derived prefabs support independent custom folder paths', () => {
  const templates = pointleshPrefabs();
  for (const prefab of Object.values(templates)) assert.equal(isPrefabTemplate(prefab), true);
  const base = templates['pointlesh.character'];
  const named = extendPointleshPrefab(base, { id: 'mara', name: 'Mara' });
  assert.equal(isPrefabTemplate(named), false);
  assert.deepEqual(prefabFolderPath(named), ['Characters']);
  const nested = extendPointleshPrefab(base, { id: 'guard', editor: { folderPath: ['Characters', 'Orcs'] } });
  const path = prefabFolderPath(nested); path.push('Changed');
  assert.deepEqual(prefabFolderPath(nested), ['Characters', 'Orcs']);
  assert.equal(isPrefabTemplate(createCharacterPrefab({ id: 'custom', name: 'Character' })), false);
  const legacy = structuredClone(base); delete legacy.pointlesh.editor;
  assert.equal(isPrefabTemplate(legacy), true);
  legacy.pointlesh.editor = { template: false };
  assert.equal(isPrefabTemplate(legacy), false);
  assert.deepEqual(prefabFolderPath({ id: 'other', name: 'Other', attributes: [] }), ['Other']);
});
