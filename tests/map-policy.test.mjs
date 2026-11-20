import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const {SCENE_ZOOM,zoomForScene,videoURL}=createRequire(import.meta.url)('../map-policy.js');
const catalog=JSON.parse(await readFile(new URL('../data.json',import.meta.url)));
test('All scene openings use the common zoom and preserve any closer view',()=>{
  assert.equal(SCENE_ZOOM,10);
  for(const current of [undefined,NaN,0,2.25,8,10])assert.equal(zoomForScene(current),10);
  for(const current of [10.25,12,15,18])assert.equal(zoomForScene(current),current);
});
test('Scene clips have bounded timestamps and no automatic playback',()=>{
  const clips=catalog.scenes.filter(s=>s.video);
  assert.equal(clips.length,4);
  for(const scene of clips){
    const v=scene.video,url=new URL(videoURL(v));
    assert.equal(url.origin,'https://www.youtube-nocookie.com');
    assert.equal(url.pathname,'/embed/'+v.id);
    assert.equal(url.searchParams.get('start'),String(v.start));
    assert.equal(url.searchParams.get('end'),String(v.end));
    assert.equal(url.searchParams.get('autoplay'),'0');
    assert.match(v.source,new RegExp('youtube.com/watch\\?v='+v.id));
    assert.ok(v.end-v.start>=3&&v.end-v.start<=15);
  }
});
test('Malformed or unbounded video data cannot create an embed',()=>{
  for(const input of [null,{}, {id:'javascript:alert(1)',start:0,end:3},
    {id:'LaDiYVnh5Eo',start:-1,end:3},{id:'LaDiYVnh5Eo',start:2,end:2},
    {id:'LaDiYVnh5Eo',start:2.5,end:5},{id:'LaDiYVnh5Eo',start:0}])assert.equal(videoURL(input),null);
});
