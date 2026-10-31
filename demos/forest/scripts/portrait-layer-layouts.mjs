// Regions are expressed in the original 256px portraits. The mouth and eye
// regions do not overlap, so either layer can animate without moving the other.
export const portraitLayerLayouts = {
  borin: { mouth: {x:83,y:130,width:90,height:73}, eyes: [{x:86,y:96,width:34,height:23},{x:134,y:96,width:34,height:23}] },
  king: { mouth: {x:83,y:131,width:90,height:70}, eyes: [{x:88,y:99,width:33,height:22},{x:134,y:99,width:34,height:22}] },
  guard: { mouth: {x:80,y:132,width:98,height:68}, eyes: [{x:87,y:102,width:34,height:23},{x:133,y:102,width:34,height:23}] },
  innkeeper: { mouth: {x:98,y:154,width:64,height:39}, eyes: [{x:82,y:117,width:36,height:30},{x:133,y:113,width:37,height:31}] },
  miner: { mouth: {x:83,y:118,width:96,height:77}, eyes: [{x:91,y:86,width:33,height:23},{x:139,y:86,width:34,height:23}] },
};

export function eyeRegion(layout) {
  const x=Math.min(...layout.eyes.map(r=>r.x)),y=Math.min(...layout.eyes.map(r=>r.y));
  return {x,y,width:Math.max(...layout.eyes.map(r=>r.x+r.width))-x,height:Math.max(...layout.eyes.map(r=>r.y+r.height))-y};
}
