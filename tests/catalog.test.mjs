import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const data=JSON.parse(await readFile(new URL('data.json',root),'utf8'));
const films=new Map(data.films.map(f=>[f.id,f]));

test('Every scene references a film, a plausible place, and reviewable text',()=>{
  assert.equal(films.size,data.films.length,'Duplicate film ID');
  const ids=new Set();
  for(const s of data.scenes){
    assert.ok(!ids.has(s.id),`Duplicate scene ${s.id}`);ids.add(s.id);
    assert.ok(films.has(s.film),`${s.id}: missing film`);
    assert.ok(Number.isFinite(s.lat)&&s.lat>=-85&&s.lat<=85,`${s.id}: latitude`);
    assert.ok(Number.isFinite(s.lng)&&s.lng>=-180&&s.lng<=180,`${s.id}: longitude`);
    for(const k of ['title','place','country','description'])assert.ok(typeof s[k]==='string'&&s[k].trim(),`${s.id}: missing ${k}`);
    assert.ok(['exact','approx'].includes(s.precision),`${s.id}: precision`);
    if(s.precision==='approx')assert.ok(s.note.length>20,`${s.id}: explain approximate geography`);
    assert.ok(/^https:\/\//.test(s.locationSource||films.get(s.film).source),`${s.id}: location source`);
  }
  for(const f of data.films)assert.ok(data.scenes.some(s=>s.film===f.id),`${f.id}: unused film`);
});

test('Films have valid partial/full release dates, attribution, and local JPEG stills',async()=>{
  for(const f of data.films){
    assert.match(f.release,/^(19|20)\d{2}(-\d{2})?(-\d{2})?$/,`${f.id}: release format`);
    const full=f.release.length===4?f.release+'-01-01':f.release.length===7?f.release+'-01':f.release;
    assert.equal(new Date(full+'T12:00:00Z').toISOString().slice(0,10),full,`${f.id}: real calendar date`);
    for(const k of ['source','imageSource'])assert.equal(new URL(f[k]).protocol,'https:',`${f.id}: ${k}`);
    assert.ok(f.director&&f.original&&f.title&&f.genre,`${f.id}: credits`);
    assert.match(f.image,/^assets\/(?:shots\/)?[a-z0-9-]+\.jpg$/);
    const image=await readFile(new URL(f.image,root));
    assert.ok(image.byteLength>1500,`${f.id}: image too small`);
    assert.equal(image.readUInt16BE(0),0xffd8,`${f.id}: not a JPEG`);
  }
});

test('Every map point has its own visually reviewed scene frame and source',async()=>{
  const images=new Set();
  for(const s of data.scenes){
    assert.equal(s.verified,true,`${s.id}: scene frame needs visual review`);
    assert.match(s.image,/^assets\/shots\/[a-z0-9-]+\.jpg$/,`${s.id}: no scene-specific image`);
    assert.ok(!images.has(s.image),`${s.id}: shares an image with another point`);images.add(s.image);
    assert.ok(s.shotDescription&&s.shotDescription.length>20,`${s.id}: missing frame/location evidence`);
    assert.equal(new URL(s.imageSource).protocol,'https:',`${s.id}: frame source`);
    const image=await readFile(new URL(s.image,root));assert.ok(image.byteLength>1000);assert.equal(image.readUInt16BE(0),0xffd8);
    if(['filming','inspiration'].includes(s.mapBasis))assert.ok(s.storyPlace&&s.note&&s.locationSource,`${s.id}: explain shooting/story geography`);
    if(s.episode){assert.equal(films.get(s.film).kind,'series');assert.ok(s.season&&s.episodeSource,`${s.id}: episode provenance`);}
  }
  assert.ok(data.films.some(f=>f.kind==='series'),'No TV series in catalog');
});

test('Local world geography covers the globe with valid geometries',async()=>{
  const geo=JSON.parse(await readFile(new URL('assets/world.geojson',root),'utf8'));
  assert.equal(geo.type,'FeatureCollection');assert.ok(geo.features.length>150);
  const extent=[Infinity,Infinity,-Infinity,-Infinity];
  function visit(coordinates){
    if(typeof coordinates[0]==='number'){
      const [lon,lat]=coordinates;assert.ok(lon>=-180&&lon<=180&&lat>=-90&&lat<=90);
      extent[0]=Math.min(extent[0],lon);extent[1]=Math.min(extent[1],lat);extent[2]=Math.max(extent[2],lon);extent[3]=Math.max(extent[3],lat);
    }else coordinates.forEach(visit);
  }
  geo.features.forEach(f=>{assert.ok(['Polygon','MultiPolygon'].includes(f.geometry.type));visit(f.geometry.coordinates);});
  assert.ok(extent[0]<-170&&extent[2]>170&&extent[1]<-60&&extent[3]>70);
});

test('Page loads local libraries and all declared assets exist',async()=>{
  const page=await readFile(new URL('index.html',root),'utf8');
  for(const match of page.matchAll(/(?:src|href)="([^"#]+)"/g)){
    const path=match[1].split("?")[0];if(/^(https?:|\.\/)/.test(path))continue;
    const entry=await stat(new URL(path,root));assert.ok(entry.isFile(),path);
  }
  assert.match(page,/lang="ru"/);assert.match(page,/name="viewport"/);
});
