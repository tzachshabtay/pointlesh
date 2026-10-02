// Import generated pixels only: one scale per sheet, fixed mug/feet registration.
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { PNG } from 'pngjs';
const root = new URL('../', import.meta.url);
function bounds(image, x0, y0, x1, y1) {
  let left=x1, right=-1, top=y1, bottom=-1;
  for (let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) if(image.data[(y*image.width+x)*4+3]>16) {
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  if(right<left) throw Error('Empty frame');
  return {left,top,width:right-left+1,height:bottom-top+1};
}
for(const name of ['purple-stout','pour-back']) {
  const bytes=await readFile(new URL(`art-source/brew/${name}.png`,root)), image=PNG.sync.read(bytes);
  const boxes=Array.from({length:8},(_,i)=>bounds(image,Math.round(i%4*image.width/4),Math.round(Math.floor(i/4)*image.height/2),Math.round((i%4+1)*image.width/4),Math.round((Math.floor(i/4)+1)*image.height/2)));
  const size=name==='pour-back'?200:32, bottom=name==='pour-back'?180:30;
  const scale=name==='pour-back'?100/boxes[0].height:28/Math.max(...boxes.map(b=>b.width),...boxes.map(b=>b.height));
  const sheet=new PNG({width:size*4,height:size*2});
  for(const [i,box] of boxes.entries()) {
    const width=Math.round(box.width*scale),height=Math.round(box.height*scale);
    const frame=PNG.sync.read(await sharp(bytes).extract(box).resize(width,height,{kernel:'nearest'}).png().toBuffer());
    const anchor=name==='pour-back'?bounds(image,box.left,box.top+box.height-12,box.left+box.width,box.top+box.height):box;
    const x=Math.round(size/2-(anchor.left+anchor.width/2-box.left)*scale),y=bottom-height;
    if(x<0||y<0||x+width>size||y+height>size) throw Error(`Clipping ${name} frame ${i}`);
    PNG.bitblt(frame,sheet,0,0,width,height,i%4*size+x,Math.floor(i/4)*size+y);
  }
  const dest=name==='pour-back'?'art/characters/borin/pour-back.png':'art/interface/inventory.sleepyStout.purple-idle.png';
  await writeFile(new URL('public/'+dest,root),PNG.sync.write(sheet));
  if(name==='purple-stout') { const base=new PNG({width:size,height:size});PNG.bitblt(sheet,base,0,0,size,size,0,0);await writeFile(new URL('public/art/interface/inventory.sleepyStout.purple.png',root),PNG.sync.write(base)); }
  console.log(name,JSON.stringify({scale,boxes}));
}
