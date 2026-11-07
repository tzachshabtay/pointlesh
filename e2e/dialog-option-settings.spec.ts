import { expect, test } from '@playwright/test';
import { openAdventure } from './start-helpers';

test('option flags are editable, choice speech is linked and live edits change the game', async ({page},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await openAdventure(page,true);
 await page.getByRole('button',{name:'Toggle dialog designer',exact:true}).click();
 const panel=page.locator('.dialog-designer__panel');
 await panel.getByRole('combobox',{name:'Selected dialog'}).selectOption('elder');
 await panel.locator('.dialog-designer__node-select').filter({hasText:'Topics'}).click();
 const cards=panel.locator('.dialog-designer__option-card');
 await expect(cards).toHaveCount(4);
 await expect(cards.nth(0).getByLabel('Should exit dialog',{exact:true})).not.toBeChecked();
 await expect(cards.nth(1).getByLabel('Should exit dialog',{exact:true})).not.toBeChecked();
 await expect(cards.nth(2).getByLabel('Enabled',{exact:true})).not.toBeChecked();
 await expect(cards.nth(2).getByLabel('Should exit dialog',{exact:true})).not.toBeChecked();
 await expect(cards.nth(3).getByLabel('Should exit dialog',{exact:true})).toBeChecked();
 for(let i=0;i<4;i++)await expect(cards.nth(i).getByLabel('Spoken by the character',{exact:true})).toBeChecked();
 await cards.first().getByLabel('Choice text',{exact:true}).fill('Does the well know where the king went?');
 await cards.first().getByLabel('Choice text',{exact:true}).press('Tab');
 await cards.first().getByLabel('Should exit dialog',{exact:true}).check();
 await panel.screenshot({path:testInfo.outputPath('dialog-option-settings.png')});
 await page.getByRole('button',{name:'Toggle dialog designer',exact:true}).click();
 await page.evaluate(()=>{const s=(window as any).pointleshDemo.scene;s.applyInteraction('elder');s.continueSpeech();});
 await page.locator('#choices button').first().click();
 await expect(page.locator('#speaker')).toHaveText('Borin');
 await expect(page.locator('#speech')).toHaveText('Does the well know where the king went?');
 const spoken=await page.evaluate(()=>{const s=(window as any).pointleshDemo.scene,t=s.conversation.current();return{option:t.optionId,line:t.line.lineAssetId,text:t.resolved.lineAsset.voiceSettings.text};});
 expect(spoken.option).toBe('king');expect(spoken.line).toMatch(/^voice.line.dialog-option./);expect(spoken.text).toBe('Does the well know where the king went?');
 await page.evaluate(()=>{const s=(window as any).pointleshDemo.scene;for(let n=0;n<50&&s.conversation.current()?.type==='line';n++)s.continueSpeech();});
 await expect(page.locator('#dialog')).toBeHidden();
 await page.getByRole('button',{name:'Toggle dialog designer',exact:true}).click();
 for(const id of ['chest-locked','chest-open']){
  await panel.getByRole('combobox',{name:'Selected dialog'}).selectOption(id);
  await panel.locator('.dialog-designer__node-select').filter({hasText:'Topics'}).click();
  for(const card of await cards.all()){
   await expect(card.getByLabel('Should exit dialog',{exact:true})).toBeChecked();
   await expect(card.getByLabel('Spoken by the character',{exact:true})).toBeChecked();
  }
 }
 expect(errors).toEqual([]);
});
