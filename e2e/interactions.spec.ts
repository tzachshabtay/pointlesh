import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { interactionVoiceLineId, interactionTargets } from '@pointlesh/core';
import { openAdventure } from './start-helpers';

const seed = JSON.parse(readFileSync('demos/forest/public/authoring/interactions.json', 'utf8'));
const rope = 'prefab:forest.inventory.rope';
const lineId = interactionVoiceLineId(rope, 'verb:look');
const panel = (page: Page) => page.getByRole('region', { name: 'Interaction designer', exact: true });
const cell = (page: Page, row: string, column: string) => panel(page).locator(`button[data-target=${JSON.stringify(row)}][data-column=${JSON.stringify(column)}]`);

test.beforeEach(async ({ page }) => {
  await page.route(/http:\/\/127\.0\.0\.1:428[789]\//, route => route.abort());
  await page.route('http://127.0.0.1:4290/**', route => route.abort());
});

async function ready(page: Page) {
  await openAdventure(page);
  await page.evaluate(() => (window as any).pointleshDemo.scene.advanceCutscene(true));
  await expect(page.locator('body')).not.toHaveClass(/cinematic-playing/);
  await expect.poll(() => page.evaluate(() => !!(window as any).pointleshDemo.scene.cutsceneCrossfade)).toBe(false);
  await page.evaluate(() => {
    const s = (window as any).pointleshDemo.scene;
    s.introArrival = undefined; s.dismissSpeech(); s.changeRoom('house'); s.character.stop();
    s.story.inventory = ['rope', 'stout', 'mushroom']; s.render();
  });
  await page.locator('#designer').click();
  await page.getByRole('button', { name: 'Toggle interaction designer', exact: true }).click();
}
async function editSpeech(page: Page, text: string) {
  await cell(page, rope, 'verb:look').click();
  const dialog = page.getByRole('dialog', { name: 'Edit interaction', exact: true });
  await dialog.getByRole('combobox', { name: 'Interaction state', exact: true }).selectOption('simple');
  await dialog.getByRole('textbox', { name: 'Hero speech', exact: true }).fill(text);
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

test('matrix discovers all target kinds, supports arbitrary verbs, and edits all four states with undo', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/authoring/interactions.json', route => route.fulfill({ json: { ...seed, verbs: [...seed.verbs, { id: 'push', label: 'Push' }] } }));
  await ready(page);
  await expect(panel(page).getByRole('columnheader')).toHaveCount(10); // Target, three verbs, six items.
  for (const kind of ['character', 'object', 'hotspot', 'inventory-item']) {
    await panel(page).getByRole('combobox', { name: 'Interaction target type' }).selectOption(kind);
    expect(await panel(page).locator('tbody tr').count()).toBeGreaterThan(0);
  }
  await panel(page).getByRole('combobox', { name: 'Interaction target type' }).selectOption('inventory-item');
  await expect(cell(page, rope, 'verb:interact')).toHaveAttribute('data-state', 'code');
  await expect(cell(page, rope, 'verb:look')).toHaveAttribute('data-state', 'simple');
  await expect(cell(page, rope, 'item:forest.inventory.rope')).toHaveAttribute('data-state', 'impossible');
  await expect(cell(page, rope, 'verb:push')).toHaveAttribute('data-state', 'empty');
  await cell(page, rope, 'verb:push').click();
  const dialog = page.getByRole('dialog', { name: 'Edit interaction' });
  await dialog.getByRole('combobox', { name: 'Interaction state', exact: true }).selectOption('code'); await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(cell(page, rope, 'verb:push')).toHaveAttribute('data-state', 'code');
  await cell(page, rope, 'verb:push').click();
  await dialog.getByRole('combobox', { name: 'Interaction state', exact: true }).selectOption('impossible'); await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(cell(page, rope, 'verb:push')).toHaveAttribute('data-state', 'impossible');
  await cell(page, rope, 'verb:push').click(); await dialog.getByRole('button', { name: '× Clear interaction', exact: true }).click();
  await expect(cell(page, rope, 'verb:push')).toHaveAttribute('data-state', 'empty');
  await panel(page).getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(cell(page, rope, 'verb:push')).toHaveAttribute('data-state', 'impossible');
  await panel(page).getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(cell(page, rope, 'verb:push')).toHaveAttribute('data-state', 'empty');
  await panel(page).getByRole('combobox', { name: 'Interaction target type' }).selectOption('');
  await page.screenshot({ path: testInfo.outputPath('interaction-matrix.png') });
  expect(errors).toEqual([]);
});

test('speech edits sync native voice lines, survive reload and promotion, and run in the game', async ({ page }) => {
  let promoted = structuredClone(seed);
  await page.route('**/authoring/interactions.json', route => route.fulfill({ json: promoted }));
  await ready(page);
  await panel(page).getByRole('searchbox', { name: 'Find interaction target' }).fill('Climbing rope');
  await editSpeech(page, 'A rope with ambitions far beyond this satchel.');
  const voice = await page.evaluate(id => {
    const assets = (window as any).pointleshDemo.scene.aiRuntime.manifest.assets;
    return { line: assets[id], link: assets['voice.borin'].linkedAnimationAssets[id] };
  }, lineId);
  expect(voice.line.kind).toBe('voice-line'); expect(voice.line.voiceSettings.text).toBe('A rope with ambitions far beyond this satchel.');
  expect(voice.link.assetId).toBe(lineId); expect(voice.link.label).toBe('Climbing rope · Look');
  await panel(page).getByRole('button', { name: 'Promote', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('Draft kept.');
  await ready(page); // Fresh game page, same local draft.
  await expect(cell(page, rope, 'verb:look')).toHaveAttribute('title', 'A rope with ambitions far beyond this satchel.');
  await page.route('http://127.0.0.1:4290/manifest', route => {
    promoted = route.request().postDataJSON(); return route.fulfill({ json: promoted });
  });
  await panel(page).getByRole('button', { name: 'Promote', exact: true }).click();
  await expect(panel(page).getByRole('status')).toHaveText('Promoted with linked voice lines.');
  expect(promoted.cells[rope]['verb:look'].text).toBe('A rope with ambitions far beyond this satchel.');
  expect(await page.evaluate(() => localStorage.getItem('pointlesh.forest.interactions.draft.v1'))).toBeNull();
  await page.getByRole('button', { name: 'Toggle interaction designer', exact: true }).click();
  await page.locator('#designer').click();
  await page.locator('#inventory').getByRole('button', { name: 'Climbing rope', exact: true }).click({ button: 'right' });
  await expect(page.locator('#speech')).toContainText('A rope with ambitions far beyond this satchel.');
  await page.evaluate(() => (window as any).pointleshDemo.scene.dismissSpeech());
  // Scripted inventory combinations still use the game handler.
  await page.locator('#inventory').getByRole('button', { name: 'Honey stout', exact: true }).click();
  await page.locator('#inventory').getByRole('button', { name: 'Dreamcap', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.story.inventory.includes('sleepyStout'))).toBe(true);
});

test('world speech overrides, cleared cells and scripted pickup and exit actions use the matrix', async ({ page }) => {
  await ready(page);
  await panel(page).getByRole('searchbox', { name: 'Find interaction target' }).fill('Copper coin');
  // Derive the placed object row from its visible label, not the inventory row.
  const objectRow = panel(page).locator('tbody tr').filter({ has: page.getByRole('rowheader', { name: /Copper coin object/ }) });
  const look = objectRow.locator('button[data-column="verb:look"]');
  await look.click();
  const dialog = page.getByRole('dialog', { name: 'Edit interaction' });
  await dialog.getByRole('textbox', { name: 'Hero speech' }).fill('Breakfast money, now officially rescue money.');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.getByRole('button', { name: 'Toggle interaction designer', exact: true }).click();
  await page.locator('#designer').click();
  await page.evaluate(() => (window as any).pointleshDemo.scene.look('coin'));
  await expect(page.locator('#speech')).toHaveText('Breakfast money, now officially rescue money.');
  await page.evaluate(() => (window as any).pointleshDemo.scene.dismissSpeech());
  await page.getByRole('button', { name: 'Interact with Copper coin', exact: true }).click();
  await expect(page.locator('#speech')).toContainText('One copper coin');
  await page.evaluate(() => (window as any).pointleshDemo.scene.dismissSpeech());
  await page.getByRole('button', { name: 'Interact with Back to the village', exact: true }).click();
  await expect(page.locator('#room-name')).toHaveText('Bramblehollow');
  await expect.poll(() => page.evaluate(() => (window as any).pointleshDemo.scene.roomTransition.active)).toBe(false);
  await page.locator('#designer').click();
  await page.getByRole('button', { name: 'Toggle interaction designer', exact: true }).click();
  await panel(page).getByRole('searchbox', { name: 'Find interaction target' }).fill('Elder Rowan');
  await panel(page).getByRole('button', { name: 'Elder Rowan / Interact: Game code', exact: true }).click();
  await dialog.getByRole('button', { name: '× Clear interaction', exact: true }).click();
  await page.getByRole('button', { name: 'Toggle interaction designer', exact: true }).click();
  await page.locator('#designer').click();
  await page.getByRole('button', { name: 'Interact with Elder Rowan', exact: true }).click();
  await expect(page.locator('#dialog')).toBeHidden();
  expect(await page.evaluate(() => (window as any).pointleshDemo.scene.conversationActive)).toBe(false);
});

test('Defaults stay first when filtering; sentence modes edit, sync and play through save/load', async ({ page }) => {
  await ready(page);
  await expect(panel(page).locator('tbody tr').first().getByRole('rowheader')).toContainText('Defaults');
  await panel(page).getByRole('searchbox', { name: 'Find interaction target' }).fill('Climbing rope');
  await expect(panel(page).locator('tbody tr').first().getByRole('rowheader')).toContainText('Defaults');
  await cell(page, rope, 'verb:look').click();
  const dialog = page.getByRole('dialog', { name: 'Edit interaction' });
  await dialog.getByRole('button', { name: '× Clear interaction', exact: true }).click();
  await cell(page, 'defaults', 'verb:look').click();
  await dialog.getByRole('combobox', { name: 'Interaction state' }).selectOption('simple');
  await dialog.getByRole('textbox', { name: 'Hero speech', exact: true }).fill('First default sentence.');
  await dialog.getByRole('button', { name: '+ Add sentence', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await dialog.getByRole('textbox', { name: 'Hero speech 2', exact: true }).fill('Second default sentence.');
  await dialog.getByRole('combobox', { name: 'Sentence playback' }).selectOption('rotation');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  const secondId = interactionVoiceLineId('defaults', 'verb:look', 1);
  expect(await page.evaluate(id => (window as any).pointleshDemo.scene.aiRuntime.manifest.assets[id].voiceSettings.text, secondId)).toBe('Second default sentence.');
  await expect(cell(page, rope, 'verb:look')).toHaveAttribute('data-state', 'empty');
  await page.getByRole('button', { name: 'Toggle interaction designer', exact: true }).click(); await page.locator('#designer').click();
  const lookRope = () => page.locator('#inventory').getByRole('button', { name: 'Climbing rope', exact: true }).click({ button: 'right' });
  await lookRope(); await expect(page.locator('#speech')).toHaveText('First default sentence.');
  await page.locator('#dialog-next').click();
  const checkpoint = await page.evaluate(() => (window as any).pointleshDemo.scene.snapshot());
  await lookRope(); await expect(page.locator('#speech')).toHaveText('Second default sentence.'); await page.locator('#dialog-next').click();
  await lookRope(); await expect(page.locator('#speech')).toHaveText('First default sentence.'); await page.locator('#dialog-next').click();
  await page.evaluate(save => (window as any).pointleshDemo.scene.restore(save), checkpoint);
  await lookRope(); await expect(page.locator('#speech')).toHaveText('Second default sentence.'); await page.locator('#dialog-next').click();
  await page.locator('#designer').click(); await page.getByRole('button', { name: 'Toggle interaction designer', exact: true }).click();
  await cell(page, 'defaults', 'verb:look').click();
  await dialog.getByRole('combobox', { name: 'Sentence playback' }).selectOption('sequence');
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.getByRole('button', { name: 'Toggle interaction designer', exact: true }).click(); await page.locator('#designer').click();
  await lookRope(); await expect(page.locator('#speech')).toHaveText('First default sentence.');
  const sequenceSave = await page.evaluate(() => (window as any).pointleshDemo.scene.snapshot());
  await page.locator('#dialog-next').click(); await expect(page.locator('#speech')).toHaveText('Second default sentence.');
  await page.locator('#dialog-next').click(); await expect(page.locator('#dialog')).toBeHidden();
  await page.evaluate(save => (window as any).pointleshDemo.scene.restore(save), sequenceSave);
  await expect(page.locator('#speech')).toHaveText('First default sentence.');
  await page.locator('#dialog-next').click(); await expect(page.locator('#speech')).toHaveText('Second default sentence.');
  await page.locator('#dialog-next').click();
  await page.locator('#designer').click(); await page.getByRole('button', { name: 'Toggle interaction designer', exact: true }).click();
  await cell(page, 'defaults', 'verb:look').click();
  await dialog.getByRole('combobox', { name: 'Sentence playback' }).selectOption('random');
  await dialog.getByRole('button', { name: 'Remove sentence 2', exact: true }).click();
  await expect(dialog.getByRole('textbox')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
  await cell(page, 'defaults', 'verb:look').click();
  await expect(dialog.getByRole('combobox', { name: 'Sentence playback' })).toHaveValue('random');
  await expect(dialog.getByRole('textbox', { name: 'Hero speech', exact: true })).toHaveValue('First default sentence.');
});


test('Marathon saves a fixed queue, revisits speech, skips untouched cells, and supports every category', async ({ page }) => {
  const scenes = JSON.parse(readFileSync('demos/forest/public/authoring/scenes.json', 'utf8'));
  const rows = interactionTargets(scenes, { interactiveOnly: true });
  const columns = [...seed.verbs.map((verb: { id: string }) => `verb:${verb.id}`),
    ...interactionTargets(scenes).filter(row => row.kind === 'inventory-item').map(row => `item:${row.id.slice('prefab:'.length)}`)];
  const sample = structuredClone(seed);
  // Two empty cells give a small, deterministic marathon without changing authoring files.
  sample.cells = Object.fromEntries(['defaults', ...rows.map(row => row.id)].map(row =>
    [row, Object.fromEntries(columns.map(column => [column, { kind: 'code' }]))]));
  const guard = 'prefab:forest.character.guard', coin = 'item:forest.inventory.coin';
  expect(rows.some(row => row.id === guard)).toBe(true);
  delete sample.cells.defaults['verb:look']; delete sample.cells[guard][coin];
  sample.cells[rope]['verb:look'] = { kind: 'simple', text: 'A trusty rope.' };
  sample.cells[rope]['item:forest.inventory.rope'] = { kind: 'impossible' };
  await page.route('**/authoring/interactions.json', route => route.fulfill({ json: sample }));
  await ready(page);
  // Search does not accidentally leave most of the game out of Marathon.
  await panel(page).getByRole('searchbox', { name: 'Find interaction target' }).fill('Climbing rope');
  await panel(page).getByRole('button', { name: 'Marathon', exact: true }).click();
  const setup = page.getByRole('dialog', { name: 'Marathon', exact: true });
  await expect(setup.getByRole('checkbox', { name: 'Empty', exact: true })).toBeChecked();
  for (const name of ['✕ Should not happen', '✓ Hero speech', '★ Game code']) await expect(setup.getByRole('checkbox', { name, exact: true })).not.toBeChecked();
  await expect(setup.getByRole('status')).toHaveText('2 interactions selected');
  await setup.getByRole('checkbox', { name: 'Empty', exact: true }).uncheck();
  await expect(setup.getByRole('button', { name: 'Start marathon', exact: true })).toBeDisabled();
  await setup.getByRole('checkbox', { name: 'Empty', exact: true }).check();
  await setup.getByRole('button', { name: 'Start marathon', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit interaction', exact: true });
  await expect(dialog.getByRole('status')).toHaveText('Marathon · 1 of 2');
  await expect(dialog.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toHaveCount(0);
  // Even after changing playback or typing whitespace, blank speech stays empty.
  await dialog.getByRole('textbox', { name: 'Hero speech', exact: true }).fill('   ');
  await dialog.getByRole('combobox', { name: 'Sentence playback', exact: true }).selectOption('random');
  await expect(dialog.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('Marathon · 2 of 2');
  await dialog.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Hero speech', exact: true })).toHaveValue('');
  await dialog.getByRole('textbox', { name: 'Hero speech', exact: true }).fill('First marathon line.');
  await dialog.getByRole('button', { name: '+ Add sentence', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await dialog.getByRole('textbox', { name: 'Hero speech 2', exact: true }).fill('Second marathon line.');
  await dialog.getByRole('combobox', { name: 'Sentence playback', exact: true }).selectOption('rotation');
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(dialog.getByRole('heading')).toHaveText('Use Copper coin on Grub the guard');
  await expect(dialog.getByRole('status')).toHaveText('Marathon · 2 of 2');
  await dialog.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Hero speech 2', exact: true })).toHaveValue('Second marathon line.');
  await expect(dialog.getByRole('combobox', { name: 'Sentence playback', exact: true })).toHaveValue('rotation');
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Hero speech', exact: true }).fill('   ');
  await dialog.getByRole('button', { name: '+ Add sentence', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Done', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(dialog).toBeHidden();
  const saved = JSON.parse((await page.evaluate(() => localStorage.getItem('pointlesh.forest.interactions.draft.v1')))!).manifest;
  expect(saved.cells[guard][coin]).toBeUndefined();
  expect(saved.cells.defaults['verb:look'].sentences).toEqual(['First marathon line.', 'Second marathon line.']);
  expect(await page.evaluate(id => (window as any).pointleshDemo.scene.aiRuntime.manifest.assets[id].voiceSettings.text,
    interactionVoiceLineId('defaults', 'verb:look', 1))).toBe('Second marathon line.');
  await panel(page).getByRole('button', { name: 'Marathon', exact: true }).click();
  await setup.getByRole('checkbox', { name: 'Empty', exact: true }).uncheck();
  for (const name of ['✕ Should not happen', '✓ Hero speech', '★ Game code']) await setup.getByRole('checkbox', { name, exact: true }).check();
  await expect(setup.getByRole('status')).toHaveText(`${(rows.length + 1) * columns.length - 1} interactions selected`);
  // Isolate the one red X, then clear it through Done.
  for (const name of ['✓ Hero speech', '★ Game code']) await setup.getByRole('checkbox', { name, exact: true }).uncheck();
  await setup.getByRole('button', { name: 'Start marathon', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('Marathon · 1 of 1');
  await expect(dialog.getByRole('combobox', { name: 'Interaction state', exact: true })).toHaveValue('impossible');
  await dialog.getByRole('button', { name: '× Clear interaction', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(cell(page, rope, 'item:forest.inventory.rope')).toHaveAttribute('data-state', 'empty');
  await panel(page).getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(cell(page, rope, 'item:forest.inventory.rope')).toHaveAttribute('data-state', 'impossible');
  // Normal inventory editing uses the same readable title and still has Apply/Cancel.
  await panel(page).getByRole('searchbox', { name: 'Find interaction target' }).fill('Grub');
  await cell(page, guard, coin).click();
  await expect(dialog.getByRole('heading')).toHaveText('Use Copper coin on Grub the guard');
  await dialog.getByRole('textbox', { name: 'Hero speech', exact: true }).fill('Discard this.');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(cell(page, guard, coin)).toHaveAttribute('data-state', 'empty');
});
