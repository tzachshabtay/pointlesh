import {portraitLayerLayouts,eyeRegion} from './portrait-layer-layouts.mjs';

/** One-time demo artwork upgrade; leaves existing voice takes and portraits intact. */
export function addPortraitFaceLayers(manifest) {
  for(const [id,layout] of Object.entries(portraitLayerLayouts)){
    const portrait=manifest.assets[`portrait.${id}`];
    if(!portrait)throw new Error(`Missing portrait: ${id}`);
    for(const [kind,count,rows] of [['mouths',9,3],['eyes',3,1]]){
      const assetId=`portrait.${id}.${kind}`;
      const frameGrid={frameWidth:256,frameHeight:256,columns:3,rows,frameCount:count};
      const prompt=kind==='mouths'
        ? `Nine registered lip-sync mouth/jaw poses for ${id}: rest, closed, teeth, open, wide, round, pucker, lip bite, tongue. Fixed face and original palette.`
        : `Independent blink for ${id}: original open eyes, halfway closed, fully closed. Fixed centered gaze; unchanged mouth and face.`;
      const mouthSet=kind==='mouths'?{
        frames:Object.fromEntries(['X','A','B','C','D','E','F','G','H'].map((shape,i)=>[shape,i])),
        sourceAssetId:portrait.id,sourceVersion:portrait.activeVersion,editRegion:layout.mouth,frameGrid,
      }:undefined;
      manifest.assets[assetId]={id:assetId,kind:'spritesheet',prompt,
        dimensions:{width:768,height:256*rows},frameGrid,...(mouthSet?{mouthSet}:{}),
        settings:{format:'png',background:'transparent',frameAlignment:'none'},
        activeVersion:'face-layers',versions:{'face-layers':{
          name:'face-layers',file:`art/portraits/${id}.${kind}.png`,prompt,
          createdAt:'2026-10-31T00:00:00.000Z',model:'imagegen',...(mouthSet?{mouthSet}:{}),
          notes:'Generated from the existing portrait. Registration preserves original pixels outside the edited region. See art-source/portraits/face-layers.txt.',
        }},tags:['forest','portrait',kind==='mouths'?'lip-sync':'portrait-eyes',id],
      };
      (manifest.assetPaths??={})[assetId]=[...(manifest.assetPaths[portrait.id]??['Graphics','Portraits'])];
    }
    portrait.linkedAnimationAssets={...portrait.linkedAnimationAssets,
      'lip-sync':{assetId:`portrait.${id}.mouths`,label:'Lip sync'},
      eyes:{assetId:`portrait.${id}.eyes`,label:'Eyes · blink'},
    };
    portrait.lipSync={enabled:true,voiceAssetId:`voice.${id}`,language:'en',wordsPerMinute:150,
      mouthAssetId:`portrait.${id}.mouths`,layered:true,
      eyes:{assetId:`portrait.${id}.eyes`,region:eyeRegion(layout),
        frames:{open:0,half:1,closed:2,left:0,right:0},blink:true,gaze:false,blinkInterval:[3,6],blinkDuration:.24},
    };
  }
  return manifest;
}
