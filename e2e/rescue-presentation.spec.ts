import { expect, test } from '@playwright/test';
import { openAdventure } from './start-helpers';

test('cutscene portraits follow the speaker and Rowan stays idle while Borin speaks', async ({ page }, testInfo) => {
  await openAdventure(page);
  await page.evaluate(() => {
    const scene=(window as any).pointleshDemo.scene;scene.game.loop.sleep();
    scene.story.introStep=1;scene.introRunner.restore({cutsceneId:'forest.intro',version:1,stepIndex:1,elapsedMs:1500});scene.renderCutscene();
    scene.events.emit('postupdate',0,250);
  });
  await expect(page.locator('#cinematic-portrait canvas')).toHaveAttribute('data-asset-id','portrait.king');
  const face=(await page.locator('#cinematic-portrait').boundingBox())!, stage=(await page.locator('.stage-wrap').boundingBox())!;
  expect(face.x).toBeGreaterThan(stage.x);expect(face.y).toBeGreaterThan(stage.y);
  expect(face.x-stage.x).toBeLessThan(20);expect(face.y-stage.y).toBeLessThan(20);
  const before=await page.locator('#cinematic-portrait canvas').getAttribute('data-frame');
  await page.evaluate(()=> (window as any).pointleshDemo.scene.events.emit('postupdate',0,375));
  expect(await page.locator('#cinematic-portrait canvas').getAttribute('data-frame')).not.toBe(before);
  const animations=await page.evaluate(()=>{
    const scene=(window as any).pointleshDemo.scene;
    scene.story.introStep=3;scene.introRunner.restore({cutsceneId:'forest.intro',version:1,stepIndex:3,elapsedMs:8100});scene.renderCutscene();
    const world=scene.children.getByName('pointlesh-cinematic').list[0];
    return ['elder','borin'].map(id=>world.getByName('cinematic-'+id).anims.currentAnim.key);
  });
  expect(animations[0]).toMatch(/^elder\.idle-/);expect(animations[1]).toMatch(/^borin\.speak-/);
  await expect(page.locator('#cinematic-portrait canvas')).toHaveAttribute('data-asset-id','portrait.borin');
  await page.evaluate(()=>{const s=(window as any).pointleshDemo.scene;s.scene.pause();s.game.loop.wake();});
  await page.screenshot({path:testInfo.outputPath('borin-intro-portrait.png')});
});

test('the king speaks his rescue hint, the ending inherits the live pose and camera, and Play again resets everything', async ({ page },testInfo)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await openAdventure(page);await page.locator('#skip-intro').click();
  await page.evaluate(()=>{
    const s=(window as any).pointleshDemo.scene;s.changeRoom('camp');s.story.flags.guardAsleep=true;s.render();s.applyInteraction('cage');
  });
  await expect(page.locator('#speaker')).toHaveText('King Aldric');
  await expect(page.locator('#speech')).toContainText('Tie up the guard');
  await expect(page.locator('#dialog-portrait canvas')).toHaveAttribute('data-asset-id','portrait.king');
  await expect.poll(()=>page.evaluate(()=> (window as any).pointleshDemo.scene.npcActors.get('camp.npc.king').sprite.anims.currentAnim.key)).toMatch(/^king\.speak-/);
  await page.locator('#dialog-next').click();
  const handoff=await page.evaluate(()=>{
    const s=(window as any).pointleshDemo.scene;s.game.loop.sleep();s.story.flags.guardBound=true;s.story.inventory=['pickaxe'];
    s.character.place({x:650,y:450},'up');s.binding.sync();s.roomCamera.snap();
    const c=s.cameras.main;
    const before={position:{...s.character.state.position},zoom:c.zoom,x:c.width/2*(1-c.zoom)-c.scrollX*c.zoom,y:c.height/2*(1-c.zoom)-c.scrollY*c.zoom};
    s.applyInteraction('cage','pickaxe');
    const world=s.children.getByName('pointlesh-cinematic').list[0],hero=world.getByName('cinematic-borin');
    const after={position:{x:hero.x,y:hero.y},zoom:world.scaleX,x:world.x,y:world.y};
    const save=s.snapshot();s.restore(save);const restored=s.cinematic.snapshot();
    s.scene.pause();s.game.loop.wake();return{before,after,restored};
  });
  expect(handoff.after.position).toEqual(handoff.before.position);
  for(const key of ['zoom','x','y'] as const)expect(handoff.after[key]).toBeCloseTo(handoff.before[key],5);
  expect(handoff.restored.cast.find((a:any)=>a.id==='borin')).toMatchObject(handoff.after.position);
  await page.locator('#skip-intro').click();
  await expect(page.getByRole('button',{name:'Play again',exact:true})).toBeVisible();
  await expect(page.locator('#modal-close')).toBeHidden();await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Play again',exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('play-again.png')});
  await page.getByRole('button',{name:'Play again',exact:true}).click();
  await expect(page.locator('#modal-backdrop')).toBeHidden();await expect(page.locator('#cutscene-kicker')).toHaveText('THE STORY BEGINS');
  expect(await page.evaluate(()=>{const s=(window as any).pointleshDemo.scene;return{inventory:s.story.inventory,flags:s.story.flags,intro:s.story.introStep,ending:s.story.endingStep,selected:s.selected??null};})).toEqual({inventory:[],flags:{},intro:0,ending:-1,selected:null});
  expect(errors).toEqual([]);
});

test('chest jokes remain after learning the password and purple brew loops in inventory and cursor',async({page})=>{
  await openAdventure(page);await page.locator('#skip-intro').click();
  for(const learned of [false,true]){
    await page.evaluate(learned=>{const s=(window as any).pointleshDemo.scene;s.changeRoom('mine');s.story.flags.knowsPassword=learned;s.applyInteraction('tool-chest');},learned);
    await page.locator('#dialog-next').click();
    await expect(page.locator('#choices button')).toHaveCount(learned?5:4);
    if(learned)await expect(page.getByRole('button',{name:'Stone remembers.',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'My bar tab? I was hoping it would forget.',exact:true}).click();
    await expect(page.locator('#speech')).toContainText('MARA REMEMBERS MORE');await page.locator('#dialog-next').click();
  }
  await page.evaluate(()=>{const s=(window as any).pointleshDemo.scene;s.story.inventory=['sleepyStout'];s.render();});
  const mug=page.locator('#inventory canvas');await expect(mug).toHaveAttribute('data-texture','inventory.sleepyStout.idle');
  const pixels=await mug.evaluate((c:HTMLCanvasElement)=>c.toDataURL());await expect.poll(()=>mug.evaluate((c:HTMLCanvasElement)=>c.toDataURL())).not.toBe(pixels);
  await page.getByRole('button',{name:'Dreamcap stout',exact:true}).click();await page.locator('#game canvas').hover();
  const cursor=page.locator('.pointlesh-adventure-cursor');await expect(cursor).toHaveAttribute('data-asset-id','inventory.sleepyStout');
  await expect(cursor).toHaveAttribute('data-texture','inventory.sleepyStout.idle');
  await page.evaluate(()=> (window as any).pointleshDemo.scene.cursor.click('inventory.sleepyStout'));
  await expect(cursor).toHaveAttribute('data-state','click');await expect(cursor).toHaveAttribute('data-state','idle');
  await expect(cursor).toHaveAttribute('data-texture','inventory.sleepyStout.idle');
});

test('the brew is poured with planted feet and the action resumes without consuming it twice',async({page},testInfo)=>{
  await openAdventure(page);await page.locator('#skip-intro').click();
  const result=await page.evaluate(()=>{
    const s=(window as any).pointleshDemo.scene;s.game.loop.sleep();s.changeRoom('camp');s.story.inventory=['sleepyStout'];s.selected='sleepyStout';
    const point=s.resolved().points.find((p:any)=>p.id==='camp.walk.cauldron').position;
    s.character.place(point,'up');s.campStealth.restore({phase:'pour',elapsedMs:0,cover:s.campCover(),clearance:s.campClearance(),path:[point],waypoint:0});
    s.update(0,0);
    for(let i=0;i<8;i++){s.guardPatrol.phase='idle-back';s.guardPatrol.elapsedMs=0;s.story.flags.guardDistracted=true;s.update(0,100);}
    const pose=()=>({position:{...s.character.state.position},frame:s.actor.frame.name,texture:s.actor.texture.key});
    const before=pose(),save=s.snapshot();s.restore(save);const restored=pose();
    const retained=s.story.inventory.includes('sleepyStout');
    for(let i=0;i<12;i++){s.guardPatrol.phase='idle-back';s.guardPatrol.elapsedMs=0;s.story.flags.guardDistracted=true;s.update(0,100);}
    const finished={phase:s.campStealth.snapshot()?.phase,items:s.story.inventory,clues:s.story.journal.filter((j:string)=>j.includes('dreamcap stout is in'))};
    s.restore(save);s.scene.pause();s.game.loop.wake();return{before,restored,retained,finished};
  });
  expect(result.before.texture).toBe('borin.pour-back');expect(result.restored).toEqual(result.before);expect(result.retained).toBe(true);
  expect(result.finished.phase).toBe('return');expect(result.finished.items).not.toContain('sleepyStout');expect(result.finished.clues).toHaveLength(1);
  await page.screenshot({path:testInfo.outputPath('borin-pours-brew.png')});
});
