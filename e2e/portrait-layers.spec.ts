import {expect,test} from '@playwright/test';
import {openAdventure} from './start-helpers';

test('every portrait blinks independently and uses text or recorded speech timing',async({page},testInfo)=>{
  test.setTimeout(300_000);
  await openAdventure(page);
  await page.locator('#skip-intro').evaluate((button:HTMLButtonElement)=>button.click());
  await expect.poll(()=>page.evaluate(()=>(window as any).pointleshDemo.scene.uncancellableAction())).toBe(false);
  const speakers={borin:'Borin',elder:'Elder Rowan',innkeeper:'Mara',miner:'Orrin',king:'King Aldric',guard:'Orc guard'};
  for(const [id,speaker] of Object.entries(speakers)){
    const result=await page.evaluate(async({id,speaker})=>{
      const scene=(window as any).pointleshDemo.scene;
      const sample=async(ms:number,waitForBlink=false)=>{
        const shapes=new Set<string>(),eyes=new Set<string>(),layers=new Set<string>(),sources=new Set<string>();
        const until=performance.now()+ms;
        while(performance.now()<until){
          await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
          const c=document.querySelector<HTMLCanvasElement>('#dialog-portrait canvas');
          shapes.add(c?.dataset.lipSyncShape??'');eyes.add(c?.dataset.eyePose??'');
          layers.add(c?.dataset.portraitLayers??'');sources.add(c?.dataset.lipSyncSource??'');
          if(waitForBlink&&eyes.has('open')&&eyes.has('closed')&&shapes.size>2)break;
        }
        return {shapes:[...shapes],eyes:[...eyes],layers:[...layers],sources:[...sources]};
      };
      scene.say('My blinking is independent while I speak this previously unrecorded test sentence about the mountain.',speaker);
      // Borin may already be partway through his ambient blink interval after
      // the intro. Speech intentionally does not reset that independent clock.
      const text=await sample(15000,true);
      const line=Object.values(scene.aiRuntime.manifest.assets).find((a:any)=>a.kind==='voice-line'&&a.voiceSettings?.voiceAssetId===`voice.${id}`&&a.versions[a.activeVersion]?.file) as any;
      // User-generated takes may exist locally before they are published. Test
      // audio whenever available; unvoiced characters still exercise text above.
      if(line){scene.say(line.voiceSettings.text,speaker,line.id);const audio=await sample(1000);
        return {text,audio,playing:scene.interactionSound?.isPlaying};}
      return {text,audio:null,playing:false};
    },{id,speaker});
    expect(result.text.layers, id).toContain('base mouth eyes');
    expect(result.text.sources,id).toContain('text');
    expect(result.text.eyes,id).toEqual(expect.arrayContaining(['open','closed']));
    expect(result.text.eyes,id).not.toEqual(expect.arrayContaining(['left']));
    expect(result.text.eyes,id).not.toEqual(expect.arrayContaining(['right']));
    expect(result.text.shapes.filter(Boolean).length,id).toBeGreaterThan(2);
    if(result.audio){expect(result.audio.sources,id).toContain('rhubarb');expect(result.playing,id).toBe(true);}
    await page.locator('#dialog-portrait').screenshot({path:testInfo.outputPath(`${id}-layered-portrait.png`)});
    await page.locator('#dialog-next').click();
  }
});
