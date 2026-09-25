import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { tsImport } from 'tsx/esm/api';
import { PNG } from 'pngjs';
import { CharacterController, resolvePointleshScene, resolvePointleshPoint, walkablePolygons, isWalkable } from '@pointlesh/core';
const { GuardPatrol, GUARD_HOME_POINT, GUARD_DRINK_POINT } = await tsImport('../src/guard-patrol.ts', import.meta.url);
const { guardAnimationDefinitions } = await tsImport('../src/guard-assets.ts', import.meta.url);

function fixture(onDrink = () => false) {
  const controller = new CharacterController({ id: 'camp.npc.guard', position: { x: 80, y: 50 }, speed: 100, movementLinkedToAnimation: false });
  controller.setNavigationSource(() => ({ walkables: [[{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]] }));
  const playback = { animationDurationMs: 100, sync() { controller.setAnimationTiming([25, 25, 25, 25]); }, update(delta) { this.sync(); controller.tick(delta); } };
  const patrol = new GuardPatrol(controller, playback, () => ({ home: { x: 80, y: 50 }, drink: { x: 20, y: 50 } }), onDrink);
  patrol.start(); return { patrol, controller };
}

test('patrol changes direction immediately, plays one back-idle cycle, walks both legs, and loops', () => {
  const { patrol, controller } = fixture();
  const phases = [patrol.phase];
  for (let i = 0; i < 60; i++) { patrol.update(25); if (phases.at(-1) !== patrol.phase) phases.push(patrol.phase); }
  assert.deepEqual(phases, ['idle-front', 'idle-back', 'walk-left', 'drink', 'walk-right', 'idle-front']);
  assert.deepEqual(controller.state.position, { x: 80, y: 50 });
  assert.equal(controller.state.facing, 'down');
  const again = fixture(); again.patrol.update(100);
  assert.equal(again.patrol.phase, 'idle-back'); assert.equal(again.patrol.distracted, true);
  assert.equal(again.controller.state.facing, 'up');
  again.patrol.update(99); assert.equal(again.patrol.phase, 'idle-back');
  again.patrol.update(1); assert.equal(again.patrol.phase, 'walk-left'); assert.equal(again.patrol.distracted, false);
  assert.equal(again.controller.state.facing, 'left');
  again.patrol.update(700); assert.equal(again.patrol.phase, 'walk-right');
  assert.equal(again.controller.state.facing, 'right');
});

test('save/load resumes each patrol phase, including both walks and drinking', () => {
  for (const elapsed of [35, 140, 265, 525, 850, 950, 1400, 1535]) {
    const a = fixture(); a.patrol.update(elapsed);
    const b = fixture(); b.patrol.restore(JSON.parse(JSON.stringify(a.patrol.snapshot())));
    assert.deepEqual(b.patrol.snapshot(), a.patrol.snapshot());
    a.patrol.update(75); b.patrol.update(75);
    assert.deepEqual(b.patrol.snapshot(), a.patrol.snapshot());
  }
});

test('older saves from removed turns resume the next action without playing a turn', () => {
  for (const [oldPhase, nextPhase, facing, position, walking] of [
    ['face-back', 'idle-back', 'up', { x: 80, y: 50 }, false],
    ['face-left', 'walk-left', 'left', { x: 80, y: 50 }, true],
    ['face-right', 'walk-right', 'right', { x: 20, y: 50 }, true],
    ['face-front', 'idle-front', 'down', { x: 80, y: 50 }, false],
  ]) {
    const { patrol, controller } = fixture();
    const saved = patrol.snapshot();
    saved.phase = oldPhase; saved.elapsedMs = 50; saved.character.position = position;
    patrol.restore(JSON.parse(JSON.stringify(saved)));
    assert.equal(patrol.phase, nextPhase);
    assert.equal(patrol.elapsedMs, 0);
    assert.equal(controller.state.facing, facing);
    assert.deepEqual(controller.state.position, position);
    assert.equal(controller.isWalking, walking);
    assert.equal(patrol.assignment, undefined);
    patrol.update(25);
    assert.equal(patrol.phase, nextPhase);
  }
});

test('only completing a drink triggers sleep, and sleeping freezes the patrol', () => {
  let poisoned = false, drinks = 0;
  const { patrol, controller } = fixture(() => { drinks++; return poisoned; });
  patrol.update(800); assert.equal(patrol.phase, 'drink'); assert.equal(drinks, 0);
  poisoned = true; patrol.update(99); assert.equal(drinks, 0);
  patrol.update(1); assert.equal(drinks, 1); assert.equal(patrol.phase, 'asleep');
  assert.deepEqual(controller.state.position, { x: 20, y: 50 });
  const snapshot = patrol.snapshot(); patrol.update(10000); assert.deepEqual(patrol.snapshot(), snapshot);
});

test('guard clips have nonempty, foot-aligned frames and named walkable patrol points', async () => {
  const { scenes } = await tsImport('../src/content.ts', import.meta.url);
  const room = resolvePointleshScene(scenes, 'camp');
  for (const id of [GUARD_HOME_POINT, GUARD_DRINK_POINT]) assert.ok(isWalkable(resolvePointleshPoint(room, id).position, walkablePolygons(room)));
  for (const asset of Object.values(guardAnimationDefinitions)) {
    const png = PNG.sync.read(await readFile(new URL('../public/' + asset.versions[asset.activeVersion].file, import.meta.url)));
    assert.deepEqual([png.width, png.height], [asset.dimensions.width, asset.dimensions.height]);
    const bottoms = [];
    for (let frame = 0; frame < 8; frame++) {
      let bottom = -1;
      for (let y = 0; y < 80; y++) for (let x = 0; x < 40; x++) if (png.data[((Math.floor(frame / 4) * 80 + y) * png.width + frame % 4 * 40 + x) * 4 + 3] >= 8) bottom = y;
      bottoms.push(bottom);
    }
    assert.ok(bottoms.every(bottom => Math.abs(bottom - 76) <= 1), `${asset.id}: boots remain on a stable baseline`);
  }
});
