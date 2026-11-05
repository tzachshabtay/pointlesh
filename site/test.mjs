import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';

const output = resolve(import.meta.dirname, 'dist');

test('Pages publishes the showcase at the root and the game at /demo/', async () => {
  const [site, game] = await Promise.all([
    readFile(resolve(output, 'index.html'), 'utf8'),
    readFile(resolve(output, 'demo/index.html'), 'utf8'),
  ]);
  assert.match(site, /href="demo\/"/);
  assert.match(site, /id="feature-grid"/);
  assert.match(site, /id="workflows"/);
  assert.match(site, /A smaller engine/);
  assert.match(site, /Pointlesh is a toolkit for developing point-and-click games/);
  assert.doesNotMatch(site, /Watch the real edit-to-play recording/);
  const workflows = [...site.matchAll(/<article class="workflow-card"[\s\S]*?<\/article>/g)];
  assert.equal(workflows.length, 4);
  for (const [workflow] of workflows) {
    const steps = [...workflow.matchAll(/<button type="button"(?: class="is-active")? data-step="(\d)">([^<]+)<\/button>/g)];
    assert.deepEqual(steps.map(([, index]) => index), ['0', '1', '2', '3']);
    assert.match(steps[2][2], /Play/);
    assert.match(steps[3][2], /Promote/);
  }
  assert.match(site, /Every change is a live draft/);
  assert.doesNotMatch(site, /demo\/\?designer=1/);
  assert.match(game, /\.\/assets\//);
  assert.ok((await stat(resolve(output, 'demo/assets'))).isDirectory());
  for (const image of ['workflow-walkable-edit', 'workflow-walkable-changed', 'workflow-walkable-test', 'workflow-animation-generate', 'workflow-animation-choose', 'workflow-animation-play', 'workflow-interaction-coin-editor', 'workflow-dialogue-voice', 'dialog-designer']) {
    assert.ok((await stat(resolve(output, `media/${image}.jpg`))).isFile());
  }
  for (const workflow of ['ground', 'animation', 'interaction', 'dialogue']) {
    for (let step = 0; step < 4; step++) {
      assert.ok((await stat(resolve(output, `media/workflow-${workflow}-${step}.webm`))).isFile());
    }
  }
});
