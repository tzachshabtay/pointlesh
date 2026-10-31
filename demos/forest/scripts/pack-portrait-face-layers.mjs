// Register generated facial poses against the fixed source face, then copy only
// the authored patches. Original alpha and all other pixels remain unchanged.
import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {portraitLayerLayouts} from './portrait-layer-layouts.mjs';
const root=new URL('../',import.meta.url),size=256;
const inside=(x,y,r)=>x>=r.x&&x<r.x+r.width&&y>=r.y&&y<r.y+r.height;

function register(base,generated,layout) {
  const samples=[];
  for(let y=12;y<layout.mouth.y;y+=4)for(let x=24;x<232;x+=4){
    if(layout.eyes.some(r=>inside(x,y,{x:r.x-4,y:r.y-4,width:r.width+8,height:r.height+8})))continue;
    const offset=(y*size+x)*4;
    if(base[offset+3]>240)samples.push({x,y,offset});
  }
  const score=(scale,dx,dy)=>{
    let total=0;
    for(const {x,y,offset} of samples){
      const sx=Math.round((x-dx)/scale),sy=Math.round((y-dy)/scale);
      if(sx<0||sy<0||sx>=size||sy>=size){total+=600;continue;}
      const s=(sy*size+sx)*4;
      for(let c=0;c<4;c++)total+=Math.abs(base[offset+c]-generated[s+c]);
    }
    return total/samples.length;
  };
  let best={score:Infinity,scale:1,dx:0,dy:0};
  const scan=(scales,xs,ys)=>{for(const scale of scales)for(const dx of xs)for(const dy of ys){const s=score(scale,dx,dy);if(s<best.score)best={score:s,scale,dx,dy};}};
  const range=(a,b,step)=>Array.from({length:Math.floor((b-a)/step)+1},(_,i)=>a+i*step);
  scan(range(.75,1.125,.025),range(-42,66,3),range(-30,54,3));
  const coarse={...best};
  scan(range(coarse.scale-.025,coarse.scale+.025,.005),range(coarse.dx-3,coarse.dx+3,1),range(coarse.dy-3,coarse.dy+3,1));
  // Bilinear registration avoids creating thick outlines at the patch boundary.
  const pixels=Buffer.alloc(base.length);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const sx=(x-best.dx)/best.scale,sy=(y-best.dy)/best.scale,l=Math.floor(sx),t=Math.floor(sy),fx=sx-l,fy=sy-t;
    if(l<0||t<0||l>=size-1||t>=size-1)continue;
    const dst=(y*size+x)*4;
    for(let c=0;c<4;c++)pixels[dst+c]=Math.round(generated[(t*size+l)*4+c]*(1-fx)*(1-fy)+generated[(t*size+l+1)*4+c]*fx*(1-fy)+generated[((t+1)*size+l)*4+c]*(1-fx)*fy+generated[((t+1)*size+l+1)*4+c]*fx*fy);
  }
  return {pixels,transform:best};
}
function patch(base,pixels,regions) {
  const result=Buffer.from(base);
  for(const r of regions)for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++){
    const i=((r.y+y)*size+r.x+x)*4;
    const blend=Math.min(1,Math.min(x,y,r.width-1-x,r.height-1-y)/3);
    for(let c=0;c<3;c++)result[i+c]=Math.round(base[i+c]*(1-blend)+pixels[i+c]*blend);
  }
  return result;
}
async function sheet(frames,columns,path) {
  const rows=Math.ceil(frames.length/columns),pixels=Buffer.alloc(size*columns*size*rows*4);
  for(const [f,frame] of frames.entries())for(let y=0;y<size;y++)frame.copy(pixels,((Math.floor(f/columns)*size+y)*size*columns+f%columns*size)*4,y*size*4,(y+1)*size*4);
  await sharp(pixels,{raw:{width:size*columns,height:size*rows,channels:4}}).png().toFile(path);
}
for(const [id,layout] of Object.entries(portraitLayerLayouts)){
  const base=await sharp(await readFile(new URL(`public/art/portraits/${id}.png`,root))).ensureAlpha().raw().toBuffer();
  const generated=await sharp(await readFile(new URL(`art-source/portraits/${id}-face-layers.png`,root))).resize(768,1024,{fit:'fill'}).ensureAlpha().raw().toBuffer();
  const mouth=[base],eyes=[base],transforms=[];
  for(let frame=1;frame<12;frame++){
    if(frame===9)continue;
    const cell=Buffer.alloc(base.length);
    for(let y=0;y<size;y++){const start=((Math.floor(frame/3)*size+y)*768+frame%3*size)*4;generated.copy(cell,y*size*4,start,start+size*4);}
    const {pixels,transform}=register(base,cell,layout);transforms.push({frame,...transform});
    const result=patch(base,pixels,frame<9?[layout.mouth]:layout.eyes);
    (frame<9?mouth:eyes).push(result);
  }
  await sheet(mouth,3,new URL(`public/art/portraits/${id}.mouths.png`,root).pathname);
  await sheet(eyes,3,new URL(`public/art/portraits/${id}.eyes.png`,root).pathname);
  await writeFile(new URL(`art-source/portraits/${id}-face-registration.json`,root),JSON.stringify(transforms,null,2)+'\n');
  console.log(id,transforms);
}
