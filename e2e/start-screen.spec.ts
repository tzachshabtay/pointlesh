import { test, expect } from '@playwright/test';
import { expectCastMotion } from './cinematic-helpers';

const saves = (page: any) => page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('pointlesh:pointlesh-king-under-mountain:'))));

test.beforeEach(async ({ page }) => {
  await page.route(/http:\/\/127\.0\.0\.1:428[789]\//, route => route.abort());
});

test('startup waits for a choice, New game always plays the intro, and saved games load only by choice', async ({ page }, testInfo) => {
  await page.goto('/?designer=1');
  await expect(page.getByRole('button', { name: 'New game', exact: true })).toBeEnabled();
  const idle = () => page.evaluate(() => { const s=(window as any).pointleshDemo.scene; return { started:s.started, elapsed:s.introRunner.snapshot().elapsedMs, cinematic:!!s.cinematic, inventory:s.story.inventory }; });
  expect(await idle()).toEqual({started:false,elapsed:0,cinematic:false,inventory:[]});
  await page.waitForTimeout(300); expect((await idle()).elapsed).toBe(0);
  await page.getByRole('button', {name:'Load',exact:true}).click();
  for(const slot of ['1','2','3']) await expect(page.getByRole('button',{name:`load slot ${slot}`,exact:true})).toBeDisabled();
  await page.keyboard.press('Escape'); await expect(page.locator('#start-screen')).toBeVisible();
  expect(await saves(page)).toEqual({});
  await page.screenshot({path:testInfo.outputPath('start-screen.png')});
  await page.getByRole('button', {name:'New game',exact:true}).click();
  await expectCastMotion(page); await expect(page.locator('#cutscene')).toBeVisible();
  await page.getByRole('button', {name:'Skip introduction',exact:true}).click();
  await page.evaluate(()=>{const s=(window as any).pointleshDemo.scene;s.changeRoom('house');s.story.inventory=['rope'];s.story.flags.metElder=true;s.render();});
  await page.getByRole('button',{name:'Save',exact:true}).click();
  await page.getByRole('button',{name:'save slot 1',exact:true}).click();
  const saved=await saves(page); expect(Object.keys(saved)).toHaveLength(1);
  await page.getByRole('button',{name:'Menu',exact:true}).click();
  await page.getByRole('button',{name:'New game',exact:true}).click();
  await expect(page.locator('#cutscene')).toBeVisible();
  expect(await page.evaluate(()=>{const s=(window as any).pointleshDemo.scene;return {room:s.story.roomId,inventory:s.story.inventory,flags:s.story.flags,step:s.story.introStep,ending:s.story.endingStep};})).toEqual({room:'village',inventory:[],flags:{},step:0,ending:-1});
  expect(await saves(page)).toEqual(saved);
  await page.reload();
  await expect(page.getByRole('button',{name:'New game',exact:true})).toBeEnabled();
  expect(await idle()).toEqual({started:false,elapsed:0,cinematic:false,inventory:[]});
  await page.getByRole('button',{name:'Load',exact:true}).click();
  await page.getByRole('button',{name:'load slot 1',exact:true}).click();
  await expect(page.locator('#start-screen')).toBeHidden();
  await expect(page.locator('#cutscene')).toBeHidden();
  await expect(page.locator('#room-name')).toHaveText('Borin’s Cottage');
  await expect(page.getByRole('button',{name:'Climbing rope',exact:true})).toBeVisible();
  expect(await saves(page)).toEqual(saved);
});

test('the title and load menu fit a phone and cancelling Load keeps gameplay inactive', async ({ page }, testInfo) => {
  await page.setViewportSize({width:390,height:844}); await page.goto('/');
  const start=page.getByRole('button',{name:'New game',exact:true});
  await expect(start).toBeEnabled(); await expect(start).toBeInViewport();
  await expect(page.getByRole('button',{name:'Load',exact:true})).toBeInViewport();
  await page.screenshot({path:testInfo.outputPath('start-screen-phone.png')});
  await page.getByRole('button',{name:'Load',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeInViewport();
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await expect(page.getByRole('button',{name:'Load',exact:true})).toBeFocused();
  expect(await page.evaluate(()=>(window as any).pointleshDemo.scene.started)).toBe(false);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await start.click(); await expect(page.locator('#cutscene-next')).toBeInViewport();
});

test('both start choices stay in the visible pane when the preview is zoomed or short', async ({page})=>{
  await page.goto('/?designer=1');await expect(page.locator('#new-game')).toBeEnabled();
  const session=await page.context().newCDPSession(page);
  const check=()=>expect.poll(()=>page.evaluate(()=>{
    const v=visualViewport!;
    return ['new-game','start-load','start-title'].every(id=>{const r=document.getElementById(id)!.getBoundingClientRect();return r.top>=v.offsetTop&&r.bottom<=v.offsetTop+v.height&&r.left>=v.offsetLeft&&r.right<=v.offsetLeft+v.width;});
  })).toBe(true);
  await session.send('Emulation.setPageScaleFactor',{pageScaleFactor:1.5});await check();
  await page.setViewportSize({width:1100,height:750});await check();
  await page.getByRole('button',{name:'Load',exact:true}).press('Enter');
  await expect.poll(()=>page.evaluate(()=>{
    const v=visualViewport!,r=document.querySelector('.modal')!.getBoundingClientRect();
    return r.top>=v.offsetTop&&r.bottom<=v.offsetTop+v.height&&r.left>=v.offsetLeft&&r.right<=v.offsetLeft+v.width;
  })).toBe(true);
  await page.getByRole('button',{name:'Close',exact:true}).press('Enter');
  await session.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});
  await page.setViewportSize({width:844,height:390});await check();
});
