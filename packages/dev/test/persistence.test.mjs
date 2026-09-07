import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readProjectJson, writeProjectJson } from '../dist/index.js';

const validate = value => {
  if (!value || value.version !== 1 || typeof value.title !== 'string') throw new Error('Invalid project');
};
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'pointlesh-persistence-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('project persistence round-trips JSON extension fields and leaves no temporary files', async t => {
  const directory = await fixture(t), path = join(directory, 'nested', 'project.json');
  const value = { version: 1, title: 'Forest', extensions: { 'client:quest': { clues: ['mine'], enabled: true } } };
  await writeProjectJson(path, value, validate);
  assert.deepEqual(await readProjectJson(path, validate), value);
  assert.match(await readFile(path, 'utf8'), /\n  "title": "Forest"/);
  assert.deepEqual(await readdir(join(directory, 'nested')), ['project.json']);
});

test('validation and non-JSON metadata failures preserve the old authored project exactly', async t => {
  const directory = await fixture(t), path = join(directory, 'project.json');
  await writeProjectJson(path, { version: 1, title: 'Previous' }, validate);
  const previous = await readFile(path, 'utf8');
  await assert.rejects(writeProjectJson(path, { version: 2, title: 'Invalid' }, validate), /Invalid project/);
  await assert.rejects(writeProjectJson(path, { version: 1, title: 'Discarded handler', callback: () => {} }, validate), /JSON/);
  await assert.rejects(writeProjectJson(path, { version: 1, title: 'Discarded metadata', extra: undefined }, validate), /JSON/);
  assert.equal(await readFile(path, 'utf8'), previous);
  assert.deepEqual(await readdir(directory), ['project.json']);
});

test('a failed temporary-file write cannot truncate an existing complete project', async t => {
  const directory = await fixture(t);
  // The original fits a POSIX filename, but the sibling temp name plus UUID does not.
  // This injects a real write failure without depending on root/permission behavior in CI.
  const path = join(directory, `${'p'.repeat(230)}.json`);
  const previous = '{"version":1,"title":"Previous complete project"}\n';
  await writeFile(path, previous);
  await assert.rejects(writeProjectJson(path, { version: 1, title: 'New' }, validate));
  assert.equal(await readFile(path, 'utf8'), previous);
  assert.equal((await readdir(directory)).length, 1);
});

test('a failed rename cleans its staged file and preserves the existing destination', async t => {
  const directory = await fixture(t), destination = join(directory, 'destination');
  await mkdir(destination);
  await writeFile(join(destination, 'existing.txt'), 'Keep me');
  await assert.rejects(writeProjectJson(destination, { version: 1, title: 'New' }, validate));
  assert.equal(await readFile(join(destination, 'existing.txt'), 'utf8'), 'Keep me');
  assert.deepEqual(await readdir(directory), ['destination']);
});

test('read validates contents and propagates malformed JSON or missing-file failures', async t => {
  const directory = await fixture(t), path = join(directory, 'project.json');
  await writeFile(path, '{"version":2,"title":"Invalid"}');
  await assert.rejects(readProjectJson(path, validate), /Invalid project/);
  await writeFile(path, '{broken');
  await assert.rejects(readProjectJson(path, validate), SyntaxError);
  await assert.rejects(readProjectJson(join(directory, 'missing.json'), validate), error => error.code === 'ENOENT');
});
