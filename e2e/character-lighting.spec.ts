import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
test.use({ deviceScaleFactor: 2 });

test.beforeEach(async ({ page }) => {
  await page.route(/http:\/\/127\.0\.0\.1:428[789]\//, route => route.abort());
  await page.goto('/?designer=1'); await expect(page.locator('#loading')).toBeHidden();
  await page.getByRole('button', { name: 'Toggle scene designer', exact: true }).click();
});

test('native per-pixel lighting changes pixels and keeps mirrored normals facing the world light', async ({ page }) => {
  await page.evaluate(() => {
    const s = (window as any).pointleshDemo.scene; s.changeRoom('pub'); s.scene.pause();
    s.cameras.main.setZoom(1).setScroll(0,0);
    s.actor.setVisible(false); for (const sprite of s.entitySprites.values()) sprite.setVisible(false);
    const canvas = document.createElement('canvas'); canvas.width = 40; canvas.height = 60;
    const c = canvas.getContext('2d')!; c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(20,30,16,26,0,0,Math.PI*2); c.fill();
    s.textures.addCanvas('lighting-probe',canvas);
    const sprite = s.add.sprite(480,380,'lighting-probe');
    const controller = new s.character.constructor({id:'probe',position:{x:480,y:380}});
    const binding = new s.binding.constructor(s,controller,sprite,{autoUpdate:false,baseScale:4,lighting:true});
    (window as any).lightingProbe = {sprite,binding};
    s.characterLighting.sync({ambientColor:0x202020,lights:[{id:'probe',x:365,y:260,radius:300,z:80,color:0xffffff,intensity:.75}]});
  });
  const canvas = page.locator('#game canvas');
  await page.waitForTimeout(100);
  const first = PNG.sync.read(await canvas.screenshot());
  await page.evaluate(() => { const p=(window as any).lightingProbe; p.sprite.setFlipX(true); p.binding.sync(); });
  await page.waitForTimeout(100);
  const flipped = PNG.sync.read(await canvas.screenshot());
  const sample = (png: PNG, x: number, y: number) => png.data[(Math.round(y/540*png.height)*png.width+Math.round(x/960*png.width))*4];
  for (const x of [426,440,480,520,534]) expect(Math.abs(sample(first,x,260)-sample(flipped,x,260))).toBeLessThan(6);
  expect(sample(first,426,260)).toBeGreaterThan(sample(first,534,260)+15);
  await page.evaluate(() => { const s=(window as any).pointleshDemo.scene;s.characterLighting.enabled=false;s.characterLighting.sync({ambientColor:0,lights:[]}); });
  await page.waitForTimeout(100);
  const off=PNG.sync.read(await canvas.screenshot()); expect(sample(off,480,260)).toBeGreaterThan(sample(first,480,260)+50);
  const removed=await page.evaluate(()=>{const s=(window as any).pointleshDemo.scene,p=(window as any).lightingProbe;p.binding.destroy();p.sprite.destroy();s.textures.remove('lighting-probe');return Object.keys(s.textures.list).filter(key=>key.startsWith('pointlesh-normal-mirror-'));});
  expect(removed).toHaveLength(0);
});

test('promoted animations and room/cutscene lighting stay in sync without lighting the background', async ({ page }, testInfo) => {
  const errors: string[]=[];page.on('pageerror',error=>errors.push(error.message));
  for (const room of ['pub','house','mine','forest','camp']) {
    await page.evaluate(room=>{const s=(window as any).pointleshDemo.scene;s.changeRoom(room);s.character.place({x:room==='forest'?1450:580,y:380});},room);
    await page.waitForTimeout(250);
    const state=await page.evaluate(()=>{const s=(window as any).pointleshDemo.scene;return {actor:s.actor.lighting,background:s.background.lighting,
      normal:!!s.actor.texture.dataSource[s.actor.frame.sourceIndex],lights:[...s.characterLighting.lights.keys()],
      npcs:[...s.npcActors.values()].map((npc:any)=>npc.sprite.lighting)};});
    expect(state.actor).toBe(true);expect(state.background).toBe(false);expect(state.normal).toBe(true);expect(state.npcs.every(Boolean)).toBe(true);
    expect(state.lights.length).toBeGreaterThan(0);if(room!=='pub')expect(state.lights).not.toContain('pub.fireplace');
    await page.screenshot({path:testInfo.outputPath(`lighting-${room}.png`)});
  }
  const cinematic=await page.evaluate(()=>{const s=(window as any).pointleshDemo.scene;s.story.endingStep=3;s.endingRunner.restore({cutsceneId:'forest.ending',version:1,stepIndex:3,elapsedMs:1500});s.renderCutscene();
    const world=s.children.getByName('pointlesh-cinematic').list[0],sprite=world.getByName('cinematic-borin'),lamp=world.getByName('ambient-village.lamp.tavern');
    const light=s.characterLighting.lights.get('village.lamp.tavern'),point=world.getWorldTransformMatrix().transformPoint(lamp.x,lamp.y);
    return {lit:sprite.lighting,normal:!!sprite.texture.dataSource[sprite.frame.sourceIndex],lightX:light.x,expectedX:point.x,keys:[...s.characterLighting.lights.keys()]};});
  expect(cinematic.lit).toBe(true);expect(cinematic.normal).toBe(true);expect(cinematic.lightX).toBeCloseTo(cinematic.expectedX);expect(cinematic.keys).not.toContain('camp.fireplace');
  await page.screenshot({path:testInfo.outputPath('lighting-cutscene.png')});expect(errors).toEqual([]);
});
