import assert from 'node:assert/strict';
import test from 'node:test';
import { tsImport } from 'tsx/esm/api';
import { isWalkable, resolvePointleshScene } from '@pointlesh/core';
const { newStory, interact, applyDialogChoice, combineItems, guardLookingAway, targetVisible, hint } = await tsImport('../src/story.ts', import.meta.url);

test('the rescue puzzle has an achievable dependency chain and a recoverable timing failure', () => {
  const state = newStory();
  state.introStep = 4;
  state.roomId = 'house';
  interact(state, 'coin'); interact(state, 'rope');
  assert.equal(targetVisible(state, 'coin'), false);
  state.roomId = 'pub';
  applyDialogChoice(state, 'dreamcap'); applyDialogChoice(state, 'password');
  interact(state, 'innkeeper', 'coin');
  state.roomId = 'forest'; interact(state, 'mushroom');
  combineItems(state, 'mushroom', 'stout');
  assert.deepEqual(new Set(state.inventory), new Set(['rope', 'sleepyStout']));
  state.roomId = 'mine';
  assert.equal(interact(state, 'tool-chest').dialog, 'chest-open');
  applyDialogChoice(state, 'open-chest'); applyDialogChoice(state, 'open-chest');
  assert.equal(state.inventory.filter(item => item === 'pickaxe').length, 1);
  state.roomId = 'camp';
  state.guardClock = 1000;
  assert.equal(guardLookingAway(state), false);
  assert.match(interact(state, 'cauldron', 'sleepyStout').text, /watching/);
  assert.ok(state.inventory.includes('sleepyStout'));
  assert.equal(state.flags.guardAsleep, undefined);
  state.guardClock = 5000;
  interact(state, 'cauldron', 'sleepyStout');
  assert.equal(state.flags.guardAsleep, true);
  assert.match(interact(state, 'cage', 'pickaxe').text, /secure a rope/);
  assert.equal(state.flags.won, undefined);
  interact(state, 'cage', 'rope');
  assert.equal(interact(state, 'cage', 'pickaxe').ending, true);
  assert.equal(state.flags.won, true);
  assert.equal(state.endingStep, 0);
  assert.match(hint(state), /king is home/);
});

test('inventory and conversation prerequisites prevent premature puzzle solutions', () => {
  const state = newStory();
  state.roomId = 'forest';
  assert.match(interact(state, 'mushroom').text, /ask someone/);
  assert.deepEqual(state.inventory, []);
  state.roomId = 'mine';
  assert.equal(interact(state, 'tool-chest').dialog, 'chest-locked');
  state.roomId = 'camp';
  assert.match(interact(state, 'cage', 'pickaxe').text, /no longer/);
  state.inventory = ['rope', 'pickaxe'];
  assert.match(interact(state, 'cage', 'rope').text, /guard would hear/);
  assert.match(interact(state, 'cage', 'pickaxe').text, /guard will catch/);
  assert.deepEqual(state.inventory, ['rope', 'pickaxe']);
  assert.match(combineItems(state, 'rope', 'pickaxe'), /inspiration is not enough/);
  assert.deepEqual(state.inventory, ['rope', 'pickaxe']);
});

test('authored scene prefabs provide reachable interactions, editable NPCs, and real pickup objects', async () => {
  const { scenes, assets } = await tsImport('../src/content.ts', import.meta.url);
  const rooms = Object.keys(scenes.scenes).map(id => resolvePointleshScene(scenes, id));
  assert.equal(rooms.length, 6);
  let npcCount = 0;
  const pickups = [];
  for (const room of rooms) {
    const floor = room.areas.filter(area => area.kind === 'walkable' && area.enabled).map(area => area.polygon);
    for (const target of room.areas.filter(area => area.kind === 'hotspot')) {
      assert.equal(isWalkable({ x: target.properties.approachX, y: target.properties.approachY }, floor), true, `${room.id}/${target.id} must be approachable`);
    }
    for (const object of room.objects) {
      assert.ok(assets.assets[object.assetId], `Asset ${object.assetId} exists in ai-assets`);
      if (object.properties.role === 'npc') { npcCount++; assert.equal(object.kind, 'character'); }
      if (object.properties.pickupId) { pickups.push(object.properties.pickupId); assert.equal(object.kind, 'object'); assert.equal(object.enabled, true); }
    }
  }
  assert.equal(npcCount, 5);
  assert.deepEqual(pickups.sort(), ['coin', 'mushroom', 'rope']);
});
