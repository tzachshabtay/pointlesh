// Registers generated eyelids/gaze to the existing portrait. Pixels outside the
// two eyes are copied byte-for-byte from the original face, including alpha.
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const base=await sharp(await readFile(new URL('public/art/portraits/elder.png',root))).ensureAlpha().raw().toBuffer();
const blinkSource=await readFile(new URL('public/art/portraits/elder.speak.png',root));
const generated=await readFile(new URL('art-source/portraits/elder-eyes.png',root));
const meta=await sharp(generated).metadata();
const width=256,height=256,cols=3,rows=2;
const output=Buffer.alloc(width*cols*height*rows*4);
for(let frame=0;frame<6;frame++){
  let pixels=await sharp(generated).extract({left:frame%3*(meta.width/3),top:Math.floor(frame/3)*(meta.height/2),width:meta.width/3,height:meta.height/2}).resize(width,height,{kernel:'lanczos3'}).ensureAlpha().raw().toBuffer();
  if(frame===2) pixels=await sharp(blinkSource).extract({left:512,top:256,width:256,height:256}).ensureAlpha().raw().toBuffer();
  const current=Buffer.from(base);
  if(frame!==0&&frame!==5){
    for(const eye of [{x:88,y:101,width:30,height:17,dx:-2},{x:138,y:101,width:29,height:17,dx:2}]){
      for(let y=0;y<eye.height;y++)for(let x=0;x<eye.width;x++){
        const dst=((eye.y+y)*width+eye.x+x)*4;
        const src=((eye.y+y+(frame===2?0:frame>=3?-2:3))*width+eye.x+x+(frame===2?0:eye.dx))*4;
        const blend=Math.min(1,Math.min(x,y,eye.width-1-x,eye.height-1-y)/3);
        for(let c=0;c<3;c++)current[dst+c]=Math.round(base[dst+c]*(1-blend)+pixels[src+c]*blend);
      }
    }
  }
  for(let y=0;y<height;y++)current.copy(output,((Math.floor(frame/cols)*height+y)*width*cols+frame%cols*width)*4,y*width*4,(y+1)*width*4);
}
await sharp(output,{raw:{width:width*cols,height:height*rows,channels:4}}).png().toFile(new URL('public/art/portraits/elder.eyes.png',root).pathname);
