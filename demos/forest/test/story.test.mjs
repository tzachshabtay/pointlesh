import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { tsImport } from 'tsx/esm/api';
import { isWalkable, resolvePointleshScene, walkablePolygons, pointleshApproachTarget } from '@pointlesh/core';
const { newStory, interact, applyDialogChoice, combineItems, guardLookingAway, finishGuardDrink, targetVisible, hint, migrateRescueStory } = await tsImport('../src/story.ts', import.meta.url);

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
  state.flags.guardDistracted = true;
  interact(state, 'cauldron', 'sleepyStout');
  assert.equal(state.flags.guardAsleep, undefined, 'Dosing the stew does not put the distant guard to sleep');
  assert.equal(state.flags.stewSpiked, true);
  assert.equal(finishGuardDrink(state), true);
  assert.equal(state.flags.guardAsleep, true);
  assert.match(interact(state, 'cage', 'pickaxe').text, /tie up Grub/);
  assert.equal(state.flags.won, undefined);
  assert.match(hint(state), /rope on the sleeping Grub/);
  interact(state, 'guard', 'rope');
  assert.equal(state.flags.guardBound, true);
  assert.ok(!state.inventory.includes('rope'));
  assert.match(interact(state, 'guard').text, /securely tied/);
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
  assert.match(interact(state, 'guard', 'rope').text, /while he is awake/);
  assert.match(interact(state, 'cage', 'rope').text, /cannot see how/);
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
    const floor = walkablePolygons(room);
    for (const target of room.areas.filter(area => area.kind === 'hotspot')) {
      assert.equal(isWalkable(pointleshApproachTarget(room, target).walkPoint, floor), true, `${room.id}/${target.id} must be approachable`);
    }
    for (const object of room.objects) {
      assert.ok(assets.assets[object.assetId], `Asset ${object.assetId} exists in ai-assets`);
      if (object.properties.role === 'npc') { npcCount++; assert.equal(object.kind, 'character'); }
      if (object.properties.pickupId) { pickups.push(object.properties.pickupId); assert.equal(object.kind, 'object'); assert.equal(object.enabled, true); }
    }
  }
  assert.equal(npcCount, 5);
  assert.deepEqual(pickups.sort(), ['coin', 'rope']);
});

test('seed and promoted pickups own their interactions without duplicate hotspot polygons', async () => {
  const { scenes } = await tsImport('../src/content.ts', import.meta.url);
  const promoted = JSON.parse(await readFile(new URL('../public/authoring/scenes.json', import.meta.url), 'utf8'));
  for (const manifest of [scenes, promoted]) {
    for (const [roomId, pickupId, approach] of [['house', 'coin', { x: 516, y: 421 }], ['house', 'rope', { x: 127, y: 443 }]]) {
      const room = resolvePointleshScene(manifest, roomId);
      const object = room.objects.find(object => object.id === `${roomId}.pickup.${pickupId}`);
      assert.equal(object.kind, 'object');
      assert.equal(object.properties.targetId, pickupId);
      assert.ok(object.behaviors.includes('forest.interact'));
      assert.ok(object.properties.description);
      assert.equal(room.areas.some(area => area.id === pickupId), false);
      const standingPoint = pointleshApproachTarget(room, object).walkPoint;
      assert.ok(object.properties.walkPointId);
      if (manifest === scenes) assert.deepEqual(standingPoint, approach);
      assert.equal(isWalkable(standingPoint, walkablePolygons(room)), true);
    }
    assert.ok(resolvePointleshScene(manifest, 'camp').areas.some(area => area.id === 'cage'));
  }
});

test('collected pickup targets cannot grant duplicate items', () => {
  const state = newStory();
  for (const [roomId, pickupId] of [['house', 'coin'], ['house', 'rope'], ['forest', 'mushroom']]) {
    state.roomId = roomId; state.flags.knowsDreamcap = true;
    interact(state, pickupId); interact(state, pickupId);
    assert.equal(state.inventory.filter(item => item === pickupId).length, 1);
    assert.equal(targetVisible(state, pickupId), false);
  }
});


test('tying a sleeping guard consumes one rope and old cage-rope saves remain solvable', () => {
  const source = newStory(); source.roomId = 'camp'; source.introStep = 4;
  source.inventory = ['pickaxe']; source.flags = { ropeTied: true, guardAsleep: true, tookRope: true };
  source.journal.push('The rope is secured to the cage. Now break the lock.');
  const before = structuredClone(source), restored = migrateRescueStory(source);
  assert.deepEqual(source, before, 'Loading must not mutate the saved slot');
  assert.deepEqual(restored.inventory, ['pickaxe', 'rope']);
  assert.equal(restored.flags.ropeTied, undefined);
  assert.equal(restored.flags.guardBound, undefined);
  assert.deepEqual(migrateRescueStory(restored), restored, 'Migration is idempotent');
  assert.match(interact(restored, 'cage', 'pickaxe').text, /tie up Grub/);
  interact(restored, 'guard', 'rope');
  assert.equal(restored.flags.guardBound, true);
  assert.match(interact(restored, 'guard', 'rope').text, /no longer/);
  assert.deepEqual(migrateRescueStory(restored), restored, 'New bound-guard saves are unchanged');
  assert.equal(interact(restored, 'cage', 'pickaxe').ending, true);
  const won = migrateRescueStory({ ...source, flags: { ...source.flags, won: true }, endingStep: 1 });
  assert.equal(won.flags.guardBound, true); assert.equal(won.endingStep, 1);
  assert.deepEqual(won.inventory, ['pickaxe'], 'Completed older rescues keep their consumed rope');
});
