import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
const {SCENE_ZOOM,zoomForScene,videoURL,sceneMedia,googleMapsURL}=createRequire(import.meta.url)('../map-policy.js');
const catalog=JSON.parse(await readFile(new URL('../data.json',import.meta.url)));
test('All scene openings use the common zoom and preserve any closer view',()=>{
  assert.equal(SCENE_ZOOM,10);
  for(const current of [undefined,NaN,0,2.25,8,10])assert.equal(zoomForScene(current),10);
  for(const current of [10.25,12,15,18])assert.equal(zoomForScene(current),current);
});
test('Scene clips have bounded timestamps and no automatic playback',()=>{
  const clips=catalog.scenes.filter(s=>s.video);
  assert.ok(clips.length>=4);
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

test('Every point has video, with exact clips taking priority over whole-film trailers',()=>{
  const films=new Map(catalog.films.map(f=>[f.id,f]));
  for(const s of catalog.scenes){
    const f=films.get(s.film),media=sceneMedia(s,f);
    assert.ok(media&&videoURL(media),s.id+': no video');
    assert.equal(media.id,s.video?.id||f.video.id);
    assert.match(media.source,/^https:\/\/www\.youtube\.com\/watch\?v=/);
    if(!s.video){assert.ok(['trailer','source'].includes(media.type));assert.ok(media.title&&media.publisher);}
  }
  const f=catalog.films[0];
  assert.equal(sceneMedia({video:{id:'bad'}},f).id,f.video.id);
});
test('Full trailers are unbounded; malformed timestamps are rejected',()=>{
  const url=new URL(videoURL({id:'2vm2FdHg7Io',type:'trailer'}));
  assert.equal(url.searchParams.get('start'),'0');assert.equal(url.searchParams.get('end'),null);
  assert.equal(url.searchParams.get('autoplay'),'0');
  assert.equal(videoURL({id:'2vm2FdHg7Io',type:'trailer',start:-1}),null);
});
test('Google Maps links use the coordinates of the actual point, including polar locations',()=>{
  for(const s of catalog.scenes){const u=new URL(googleMapsURL(s.lat,s.lng));assert.equal(u.origin,'https://www.google.com');assert.equal(u.searchParams.get('api'),'1');assert.equal(u.searchParams.get('query'),s.lat+','+s.lng);}
  for(const [lat,lng] of [[NaN,1],[91,0],[0,181]])assert.equal(googleMapsURL(lat,lng),null);
});
test('Polar regions and geographically supported game adaptations are represented',()=>{
  assert.ok(catalog.scenes.some(s=>s.countryCode==='AQ'&&s.lat< -60));
  assert.ok(catalog.scenes.some(s=>s.countryCode==='US'&&s.place.includes('Аляска')));
  const games=catalog.films.filter(f=>f.basedOnGame);assert.ok(games.length>=5);
  for(const f of games)assert.ok(catalog.scenes.some(s=>s.film===f.id));
});
