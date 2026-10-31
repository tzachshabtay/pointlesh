import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {assertAsset,LIP_SYNC_SHAPES,selectedLipSyncTrack,assertLipSyncTrack} from '@ai-game-assets/core';
import {portraitLayerLayouts} from '../scripts/portrait-layer-layouts.mjs';

const root=new URL('../public/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('authoring/assets.json',root),'utf8'));
const contains=(r,x,y)=>x>=r.x&&x<r.x+r.width&&y>=r.y&&y<r.y+r.height;
for(const id of Object.keys(portraitLayerLayouts))test(`${id}: independent lip sync and blinking preserve the original face`,async()=>{
  const portrait=manifest.assets[`portrait.${id}`],settings=portrait.lipSync;
  assertAsset(portrait);
  assert.equal(settings.enabled,true);assert.equal(settings.layered,true);
  assert.equal(settings.voiceAssetId,`voice.${id}`);
  assert.equal(settings.eyes.blink,true);assert.equal(settings.eyes.gaze,false);
  const base=await sharp(await readFile(new URL(portrait.versions[portrait.activeVersion].file,root))).ensureAlpha().raw().toBuffer();
  for(const [assetId,region,expectedFrames] of [
    [settings.mouthAssetId,manifest.assets[settings.mouthAssetId].mouthSet.editRegion,9],
    [settings.eyes.assetId,settings.eyes.region,3],
  ]){
    const asset=manifest.assets[assetId];assertAsset(asset);
    const {data,info}=await sharp(await readFile(new URL(asset.versions[asset.activeVersion].file,root))).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    assert.equal(asset.frameGrid.frameCount,expectedFrames);
    assert.equal(info.width,768);assert.equal(info.height,256*expectedFrames/3);
    const changedFrames=new Set();
    for(let frame=0;frame<expectedFrames;frame++)for(let y=0;y<256;y++)for(let x=0;x<256;x++){
      const a=(y*256+x)*4,b=((Math.floor(frame/3)*256+y)*768+frame%3*256+x)*4;
      const same=base.subarray(a,a+4).equals(data.subarray(b,b+4));
      if(frame===0||!contains(region,x,y))assert.ok(same,`${assetId}: frame ${frame} changed fixed pixel ${x},${y}`);
      else if(!same)changedFrames.add(frame);
      assert.equal(data[b+3],base[a+3],`${assetId}: alpha changed`);
    }
    assert.equal(changedFrames.size,expectedFrames-1);
  }
  const mouth=manifest.assets[settings.mouthAssetId].mouthSet;
  assert.deepEqual(Object.keys(mouth.frames),LIP_SYNC_SHAPES);
  const a=mouth.editRegion,b=settings.eyes.region;
  assert.ok(a.y>=b.y+b.height||b.y>=a.y+a.height);
});

test('portrait voices have timing for the exact selected recording and text',async()=>{
  const voices=new Set(Object.values(manifest.assets).filter(a=>a.lipSync?.enabled).map(a=>a.lipSync.voiceAssetId));
  let checked=0;
  for(const asset of Object.values(manifest.assets)){
    if(asset.kind!=='voice-line')continue;
    const version=asset.versions[asset.activeVersion];
    if(!voices.has(version?.voiceSettings?.voiceAssetId??asset.voiceSettings?.voiceAssetId)||!version?.file)continue;
    const track=selectedLipSyncTrack(asset);
    assert.ok(track,`${asset.id} is missing current timing`);assertLipSyncTrack(track);
    assert.equal(track.source,'rhubarb');
    const hash=createHash('sha256').update(await readFile(new URL(version.file,root))).digest('hex');
    assert.equal(track.audioHash,hash,`${asset.id} timing belongs to another take`);
    checked++;
  }
  // A clean checkout may have fewer promoted recordings than the local authoring
  // workspace. Every recording that is present must still have exact timing.
  assert.ok(checked>0,'Recorded portrait speech is covered');
});
