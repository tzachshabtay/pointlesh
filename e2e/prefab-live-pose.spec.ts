import {test,expect} from '@playwright/test';
import {openAdventure} from './start-helpers';
import {selectInstance,expandProperties} from './designer-helpers';

for(const entity of ['village.borin','village.npc.elder']) test(`lighting and unrelated prefab edits preserve the live pose of ${entity}`,async({page})=>{
  await page.route(/http:\/\/127\.0\.0\.1:428[789]\//,route=>route.abort());
  await openAdventure(page,true);
  await selectInstance(page,entity);
  await page.getByRole('region',{name:'Pointlesh properties',exact:true}).getByRole('button',{name:'Edit prefab',exact:true}).click();
  await expandProperties(page,'Properties');
  await page.evaluate(id=>{
    const s=(window as any).pointleshDemo.scene, c=id==='village.borin'?s.character:s.npcActors.get(id).controller;
    // A point action or gameplay walk has moved the character away from its authored spawn.
    c.place({x:680,y:445},'left');s.scene.pause();s.binding.sync();for(const npc of s.npcActors.values())npc.binding.sync();
  },entity);
  const pose=()=>page.evaluate(id=>{const s=(window as any).pointleshDemo.scene,c=id==='village.borin'?s.character:s.npcActors.get(id).controller,sprite=id==='village.borin'?s.actor:s.npcActors.get(id).sprite;return{position:c.state.position,facing:c.state.facing,lighting:sprite.lighting};},entity);
  const checkbox=page.getByRole('checkbox',{name:'Receive room lighting',exact:true});
  await expect(checkbox).toBeChecked(); await checkbox.uncheck();
  expect(await pose()).toEqual({position:{x:680,y:445},facing:'left',lighting:false});
  await checkbox.check();
  expect(await pose()).toEqual({position:{x:680,y:445},facing:'left',lighting:true});
  await page.evaluate(()=>(window as any).pointleshDemo.scene.sceneDesigner.designer.undo());
  expect(await pose()).toEqual({position:{x:680,y:445},facing:'left',lighting:false});
  await page.evaluate(()=>(window as any).pointleshDemo.scene.sceneDesigner.designer.redo());
  expect(await pose()).toEqual({position:{x:680,y:445},facing:'left',lighting:true});
  // Native placement edits still move the actor; undo restores the authored position.
  await selectInstance(page,entity);
  const x=page.getByRole('spinbutton',{name:'X',exact:true});const before=Number(await x.inputValue());
  await x.fill('610');await x.press('Tab');expect((await pose()).position.x).toBe(610);
  await page.evaluate(()=>(window as any).pointleshDemo.scene.sceneDesigner.designer.undo());
  expect((await pose()).position.x).toBeCloseTo(before);
});
