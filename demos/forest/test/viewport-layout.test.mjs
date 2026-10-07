import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../public/viewport-layout.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function boot(viewport) {
  const properties = new Map(), events = new Map();
  const window = { innerWidth: 1200, innerHeight: 900, scrollX: 0,
    visualViewport: viewport && { ...viewport, addEventListener: (name, fn) => events.set(`visual:${name}`, fn) },
    addEventListener: (name, fn) => events.set(name, fn) };
  runInNewContext(source, { window, document: { documentElement: { style: { setProperty: (name, value) => properties.set(name, value) } } } });
  return { properties, events, window };
}

test('zoomed preview dimensions are established synchronously before the title can paint', () => {
  const { properties } = boot({ width: 800, height: 600, offsetTop: 15, pageLeft: 20 });
  assert.equal(properties.get('--preview-height'), '600px');
  assert.equal(properties.get('--preview-width'), '800px');
  assert.equal(properties.get('--preview-top'), '15px');
  assert.equal(properties.get('--preview-left'), '20px');
  const tag = html.match(/<script\b[^>]*src="\.\/viewport-layout\.js"[^>]*>/)?.[0];
  assert.ok(tag);
  assert.doesNotMatch(tag, /\b(?:async|defer|type)\b/);
  assert.ok(html.indexOf(tag) < html.indexOf('<body'));
});

test('pane resizing and panning continue to update after startup', () => {
  const { properties, events, window } = boot({ width: 800, height: 600, offsetTop: 0, pageLeft: 0 });
  Object.assign(window.visualViewport, { height: 500, width: 700 });
  events.get('visual:resize')();
  assert.equal(properties.get('--preview-height'), '500px');
  assert.equal(properties.get('--preview-width'), '700px');
  Object.assign(window.visualViewport, { offsetTop: 25, pageLeft: 30 });
  events.get('visual:scroll')();
  assert.equal(properties.get('--preview-top'), '25px');
  assert.equal(properties.get('--preview-left'), '30px');
});

test('browsers without VisualViewport use window dimensions', () => {
  const { properties, events, window } = boot();
  assert.equal(properties.get('--preview-height'), '900px');
  window.innerHeight = 700;
  events.get('resize')();
  assert.equal(properties.get('--preview-height'), '700px');
});
