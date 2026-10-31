import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';

const root=new URL('../public/',import.meta.url);
test('Rowan eye artwork preserves all pixels outside its independent region',async()=>{
  const base=await sharp(await readFile(new URL('art/portraits/elder.png',root))).ensureAlpha().raw().toBuffer();
  const sheet=await sharp(await readFile(new URL('art/portraits/elder.eyes.png',root))).ensureAlpha().raw().toBuffer();
  const manifest=JSON.parse(await readFile(new URL('authoring/assets.json',root),'utf8'));
  const settings=manifest.assets['portrait.elder'].lipSync;
  assert.equal(settings.layered,true);assert.equal(settings.eyes.assetId,'portrait.elder.eyes');
  const r=settings.eyes.region;
  let changed=0;
  for(let frame=0;frame<6;frame++)for(let y=0;y<256;y++)for(let x=0;x<256;x++){
    const a=(y*256+x)*4,b=((Math.floor(frame/3)*256+y)*768+frame%3*256+x)*4;
    const same=base.subarray(a,a+4).equals(sheet.subarray(b,b+4));
    if(frame===0||frame===5||x<r.x||x>=r.x+r.width||y<r.y||y>=r.y+r.height)assert.ok(same,`Unexpected change in frame ${frame} at ${x},${y}`);
    else if(!same)changed++;
    assert.equal(base[a+3],sheet[b+3]);
  }
  assert.ok(changed>100);
  assert.equal(settings.eyes.blink,true);
  assert.equal(settings.eyes.gaze,false);
});
