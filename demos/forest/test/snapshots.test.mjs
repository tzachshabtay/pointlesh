import test from 'node:test';
import assert from 'node:assert/strict';
import { tsImport } from 'tsx/esm/api';
import { AdventureDialog, CharacterController, SaveStore, MemorySaveStorage, resolvePointleshScene, walkablePolygons, findPath } from '@pointlesh/core';

const story = await tsImport('../src/story.ts', import.meta.url);
const { assets, dialogs, scenes } = await tsImport('../src/content.ts', import.meta.url);

function choose(state, dialogId, optionId) {
  const dialog = new AdventureDialog(dialogs, assets);
  assert.equal(dialog.start(dialogId).type, 'line');
  assert.equal(dialog.advance().type, 'decision');
  const reply = dialog.choose(optionId);
  story.applyDialogChoice(state, optionId);
  assert.equal(reply.type, 'line');
  assert.equal(dialog.advance().type, 'end');
}

test('full authored-dialog rescue walkthrough travels through all six room exits', () => {
  const state = story.newStory(), visited = new Set([state.roomId]);
  const interact = (target, item) => { const result = story.interact(state, target, item); visited.add(state.roomId); return result; };
  interact('home-door'); interact('coin'); interact('rope'); interact('house-exit'); interact('pub-door');
  choose(state, 'innkeeper', 'dreamcap'); choose(state, 'miner', 'password');
  interact('innkeeper', 'coin'); interact('pub-exit'); interact('forest-path'); interact('mushroom');
  story.combineItems(state, 'mushroom', 'stout');
  interact('mine-path');
  assert.equal(interact('tool-chest').dialog, 'chest-open');
  choose(state, 'chest-open', 'open-chest');
  interact('mine-exit'); interact('camp-path');
  state.guardClock = 0;
  interact('cauldron', 'sleepyStout');
  assert.equal(state.inventory.includes('sleepyStout'), true, 'Mistimed use preserves the only potion');
  state.guardClock = 4100;
  interact('cauldron', 'sleepyStout'); interact('cage', 'rope');
  assert.equal(interact('cage', 'pickaxe').ending, true);
  assert.equal(state.flags.won, true);
  assert.deepEqual([...visited].sort(), [...story.roomIds].sort());
});

test('combined item, conversation reply, guard timer and pending walk restore into fresh runtimes', () => {
  const state = story.newStory();
  state.roomId = 'pub'; state.inventory = ['stout', 'mushroom', 'rope']; state.guardClock = 4300;
  story.combineItems(state, 'stout', 'mushroom');
  const dialog = new AdventureDialog(dialogs, assets);
  dialog.start('miner'); dialog.advance(); dialog.choose('password');
  story.applyDialogChoice(state, 'password');
  const hero = new CharacterController({ id: 'borin', position: { x: 100, y: 450 }, walkStep: 10, frameDurationMs: 100 });
  const floor = walkablePolygons(resolvePointleshScene(scenes, 'pub'));
  hero.walkTo({ x: 500, y: 450 }, floor); hero.tick(250);
  const storage = new MemorySaveStorage();
  new SaveStore({ gameId: 'forest-demo', version: 1, storage }).save('mid-puzzle', {
    roomId: state.roomId, inventory: state.inventory, selectedItem: 'sleepyStout', flags: state.flags,
    characters: { borin: hero.snapshot() }, extensions: { story: state }, dialog: dialog.snapshot(),
  });
  const loaded = new SaveStore({ gameId: 'forest-demo', version: 1, storage }).load('mid-puzzle');
  const freshHero = new CharacterController({ id: 'borin', position: { x: 0, y: 0 }, walkStep: 10, frameDurationMs: 100 });
  freshHero.restore(loaded.characters.borin);
  const freshDialog = new AdventureDialog(dialogs, assets);
  let effects = 0;
  freshDialog.onTurn(() => effects++);
  freshDialog.restore(loaded.dialog);
  assert.equal(effects, 0, 'Loading a selected reply must not grant its choice effect again');
  assert.deepEqual(freshDialog.current(), dialog.current());
  assert.deepEqual(loaded.inventory, ['rope', 'sleepyStout']);
  assert.equal(loaded.extensions.story.guardClock, 4300);
  assert.equal(loaded.flags.knowsPassword, true);
  assert.deepEqual(freshHero.snapshot(), hero.snapshot());
  freshHero.tick(5000);
  assert.deepEqual(freshHero.state.position, { x: 500, y: 450 });
  assert.equal(freshHero.state.activity, 'idle');
});

test('every authored hotspot and character approach point is reachable from its room spawn', () => {
  for (const roomId of story.roomIds) {
    const scene = resolvePointleshScene(scenes, roomId), floors = walkablePolygons(scene);
    for (const area of scene.areas.filter(area => area.kind === 'hotspot')) {
      assert.ok(findPath({ x: 471, y: 462 }, { x: area.properties.approachX, y: area.properties.approachY }, floors), `${roomId}/${area.id} must be reachable`);
    }
    for (const npc of scene.objects.filter(object => object.properties.role === 'npc')) {
      assert.ok(story.targets[roomId].some(target => target.id === npc.properties.targetId), `${npc.id} maps to an existing story interaction`);
      assert.ok(npc.behaviors.includes('forest.interact'));
      assert.ok(findPath({ x: 471, y: 462 }, { x: npc.position.x + npc.properties.approachOffsetX, y: npc.position.y + npc.properties.approachOffsetY }, floors), `${npc.id} must be approachable`);
      if (npc.properties.actorName !== 'king') assert.equal(scene.areas.some(area => area.id === npc.properties.targetId), false, `${npc.id} must not have a duplicate hotspot`);
    }
  }
  assert.ok(resolvePointleshScene(scenes, 'camp').areas.some(area => area.id === 'cage'), 'The cage remains an environmental puzzle target');
});
