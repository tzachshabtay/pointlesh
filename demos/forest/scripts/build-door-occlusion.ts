import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { PNG } from 'pngjs';
import { pointInPolygon } from '@pointlesh/core';
import { forestDoors } from '../src/door-layout.js';

// Render masks, not replacement artwork. The three standalone leaf sources use
// the same native registration as pack-door-corrections.ts. Older gate sheets
// have authored leaf silhouettes; their cool passage pixels never occlude actors.
const input = process.argv[2];
if (!input) throw new Error('Usage: tsx build-door-occlusion.ts DIRECTORY_WITH_CORRECTED_LEAVES');
type Rect = [number, number, number, number];
function cell(sheet: PNG, i: number) {
  const left = Math.round(i % 4 * sheet.width / 4), top = Math.round(Math.floor(i / 4) * sheet.height / 2);
  const width = Math.round((i % 4 + 1) * sheet.width / 4) - left, height = Math.round((Math.floor(i / 4) + 1) * sheet.height / 2) - top;
  const result = new PNG({width,height}); PNG.bitblt(sheet,result,left,top,width,height,0,0); return result;
}
function bounds(image: PNG) {
  let left=image.width,top=image.height,right=0,bottom=0;
  for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(image.data[(y*image.width+x)*4+3]!>=128){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
  return {left,top,width:right-left+1,height:bottom-top+1};
}
function rectangles(mask: Uint8Array, width: number, height: number): Rect[] {
  const result: Rect[]=[], active=new Map<string,Rect>();
  for(let y=0;y<height;y++) {
    const next=new Map<string,Rect>();
    for(let x=0;x<width;) {
      if(!mask[y*width+x]){x++;continue;}
      const left=x;while(x<width&&mask[y*width+x])x++;
      const key=`${left}:${x}`, previous=active.get(key);
      const rect: Rect=previous??[left,y,x-left,0];rect[3]++;next.set(key,rect);
      if(!previous)result.push(rect);
    }
    active.clear();for(const [key,rect] of next)active.set(key,rect);
  }
  return result;
}
const result: Record<string,Rect[][]>={};
for(const door of forestDoors) {
  const {width,height}=door.crop, frames: Rect[][]=[];
  const standalone=['house','pub','village-house'].includes(door.id);
  const leaves=standalone?PNG.sync.read(await readFile(`${input}/${door.id}-leaf.png`)):undefined;
  const closed=leaves&&bounds(cell(leaves,0));
  const sheet=PNG.sync.read(await readFile(new URL(`../public/art/objects/doors/${door.id}-open.png`,import.meta.url)));
  const left=Math.floor(Math.min(...door.aperture.map(p=>p.x))),right=Math.ceil(Math.max(...door.aperture.map(p=>p.x)));
  const top=Math.floor(Math.min(...door.aperture.map(p=>p.y))),bottom=Math.ceil(Math.max(...door.aperture.map(p=>p.y)));
  for(let i=0;i<8;i++) {
    const mask=new Uint8Array(width*height), painted=cell(sheet,i);
    if(standalone&&i>0) {
      const leaf=cell(leaves!,i),box=bounds(leaf);
      const w=Math.max(1,Math.round(box.width*(right-left)/closed!.width)),h=Math.max(1,Math.round(box.height*(bottom-top)/closed!.height));
      const registered=PNG.sync.read(await sharp(PNG.sync.write(leaf)).extract(box).resize(w,h,{kernel:'nearest'}).png().toBuffer());
      for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(registered.data[(y*w+x)*4+3]!>=128&&left+x<width&&bottom-h+y>=0)mask[(bottom-h+y)*width+left+x]=1;
    } else for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
      let foreground=standalone;
      if(door.id==='village-pub') {
        const start=[14,36,53,68,58,67,78,65][i]!;
        foreground=x>=start&&y>=24&&y<175;
      } else if(door.id==='camp') {
        const end=[106,87,70,55,43,33,28,25][i]!;
        const slant=i===0?0:Math.min(13,i*3);
        foreground=x>=20&&x<=end&&y>=15+slant*(x-20)/Math.max(1,end-20)&&y<=183-slant*(x-20)/Math.max(1,end-20);
      } else if(door.id==='forest-camp') {
        const a=[72,60,48,39,36,28,26,26][i]!,b=[72,82,95,99,102,109,116,118][i]!;
        foreground=y>=19&&y<136&&(x<=a||x>=b);
      } else if(door.id==='forest-mine') {
        const end=[73,60,52,46,32,26,23,21][i]!;
        const o=(y*width+x)*4,r=painted.data[o]!,g=painted.data[o+1]!,b=painted.data[o+2]!;
        foreground=x>=17&&x<=end&&y>=60&&y<=125&&r>=g*1.04&&g>b*1.15&&r>12;
      }
      if(foreground)mask[y*width+x]=1;
    }
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(!pointInPolygon({x:x+.5,y:y+.5},door.aperture))mask[y*width+x]=0;
    frames.push(rectangles(mask,width,height));
  }
  result[door.id]=frames;
}
const json = '{\n' + Object.entries(result).map(([id, frames]) => `  ${JSON.stringify(id)}: [\n${frames.map(frame => `    ${JSON.stringify(frame)}`).join(',\n')}\n  ]`).join(',\n') + '\n}\n';
await writeFile(new URL('../src/door-occlusion.json',import.meta.url),json);
console.log('Packed native-pixel foreground masks for all seven doors.');
