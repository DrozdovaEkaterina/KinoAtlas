/* KinoAtlas — buildless, static, no visitor keys or accounts. */
(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const all = (selector) => [...document.querySelectorAll(selector)];
  const escape = (value) => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const normalize = value => String(value).toLocaleLowerCase('ru').normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/ё/g,'е');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pin = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>';
  const state = {films:[],scenes:[],filtered:[],selected:null,region:'',film:'',map:null,markers:new Map(),revealed:new Set(),hideSpoilers:false};
  try { state.hideSpoilers = localStorage.getItem('kinoatlas-spoilers') === 'true'; } catch { /* Storage is optional. */ }
  const regionFor = country => {
    if (['США','Бразилия','Перу'].includes(country)) return 'Америка';
    if (['Китай','Япония','Южная Корея','Индия','Иран','Камбоджа'].includes(country)) return 'Азия';
    if (['Алжир','Египет','Сенегал'].includes(country)) return 'Африка';
    if (['Австралия','Новая Зеландия'].includes(country)) return 'Океания';
    return 'Европа';
  };
  const dateText = date => {
    if (/^\d{4}$/.test(date)) return date + ' год';
    if (/^\d{4}-\d{2}$/.test(date)) return new Intl.DateTimeFormat('ru',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(date+'-01T12:00:00Z'));
    return new Intl.DateTimeFormat('ru',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
  };
  const year = film => film.release.slice(0,4);
  let toastTimeout;
  function toast(message) { $('#toast').textContent=message; $('#toast').hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('#toast').hidden=true,3300); }
  function mobileList(open) { $('#sidebar').classList.toggle('open',open);$('#mobile-list').innerHTML=open?'Вернуться к карте':`Все сцены <span id="mobile-count">${state.filtered.length}</span>`;$('#mobile-list').setAttribute('aria-expanded',String(open)); }
  function fillSelect(selector,items,label = x=>x) {
    for (const item of items) {const option=document.createElement('option');option.value=item;option.textContent=label(item);$(selector).append(option);}
  }
  function setHash(id) {const url=new URL(location.href);url.hash=id?'scene='+encodeURIComponent(id):'';history.replaceState(null,'',url);}
  function selectedFromHash() {return new URLSearchParams(location.hash.slice(1)).get('scene');}
  function reset() {
    $('#search').value='';$('#decade').value='';$('#genre').value='';$('#country').value='';state.region='';state.film='';
    all('#regions button').forEach(b=>b.setAttribute('aria-pressed',String(!b.dataset.region)));applyFilters(true);
  }
  function applyFilters(fit=false) {
    const q=normalize($('#search').value.trim()), decade=$('#decade').value,genre=$('#genre').value,country=$('#country').value;
    state.filtered=state.scenes.filter(scene=>{
      const f=scene.movie;
      return (!q||scene.searchText.includes(q))&&(!decade||String(Math.floor(Number(year(f))/10)*10)===decade)&&(!genre||f.genre===genre)&&(!country||scene.country===country)&&(!state.region||scene.region===state.region)&&(!state.film||f.id===state.film);
    });
    if (state.selected&&!state.filtered.some(s=>s.id===state.selected.id)) closeCard(false);
    $('#result-count').textContent=`${state.filtered.length} из ${state.scenes.length}`;
    $('#mobile-count') && ($('#mobile-count').textContent=state.filtered.length);
    $('#random').disabled=!state.filtered.length;
    renderList();renderMarkers();
    if(fit) fitScenes();
    if($('#sidebar').classList.contains('open')) mobileList(true);
  }
  function renderList() {
    const fragment=document.createDocumentFragment();
    if(!state.filtered.length) {
      const empty=document.createElement('div');empty.className='empty';empty.innerHTML='<strong>Пока ни одного совпадения</strong>Попробуйте другой фильм, режиссёра или место. Можно убрать часть фильтров.<br><button type="button">Сбросить фильтры</button>';empty.querySelector('button').addEventListener('click',reset);fragment.append(empty);
    }
    for (const scene of state.filtered) {
      const row=document.createElement('button');row.className='scene-row'+(state.selected?.id===scene.id?' selected':'');row.dataset.scene=scene.id;
      row.setAttribute('aria-label',`${scene.movie.title}: ${scene.place}`);
      row.innerHTML=`<img src="${escape(scene.movie.image)}" alt="" loading="lazy" width="61" height="45"><span class="row-text"><strong>${escape(scene.movie.title)}</strong><small>${escape(scene.place)} · ${year(scene.movie)}</small></span>`;
      row.addEventListener('click',()=>openScene(scene.id));fragment.append(row);
    }
    $('#scene-list').replaceChildren(fragment);
  }
  function renderMarkers() {
    if(!state.map) return;
    state.cluster.clearLayers();state.markers.clear();
    for(const scene of state.filtered) {
      const active=state.selected?.id===scene.id;
      const marker=L.marker([scene.lat,scene.lng],{
        title:`${scene.movie.title} · ${scene.place}`,alt:`Открыть сцену: ${scene.movie.title}, ${scene.place}`,keyboard:true,riseOnHover:true,
        icon:L.divIcon({className:'film-marker'+(active?' is-active':''),html:`<span class="film-dot ${scene.precision==='approx'?'approx':''}"></span>`,iconSize:[32,32],iconAnchor:[16,16]})
      });
      marker.bindTooltip(`${escape(scene.movie.title)} <span style="opacity:.65">· ${year(scene.movie)}</span>`,{direction:'top',offset:[0,-12]});
      marker.on('click',()=>openScene(scene.id));state.markers.set(scene.id,marker);state.cluster.addLayer(marker);
    }
  }
  function fitScenes(scenes=state.filtered) {
    if(!state.map||!scenes.length) return;
    const bounds=L.latLngBounds(scenes.map(s=>[s.lat,s.lng]));
    if(scenes.length===1){state.map.setView(bounds.getCenter(),scenes[0].precision==='exact'?13:9,{animate:!reducedMotion});return;}
    state.map.fitBounds(bounds,{paddingTopLeft:[55,85],paddingBottomRight:[65,140],maxZoom:12,animate:!reducedMotion});
  }
  function flyToScene(scene) {
    const mobile=matchMedia('(max-width:760px)').matches;
    const targetZoom=scene.precision==='exact'?15:8;
    const map=state.map;
    // Offset the real point to the unobscured part of the map, never its coordinates.
    const projected=map.project([scene.lat,scene.lng],targetZoom);
    const offset=mobile?L.point(0,-map.getSize().y*.20):L.point(-190,15);
    const center=map.unproject(projected.subtract(offset),targetZoom);
    map.flyTo(center,targetZoom,{duration:reducedMotion?0:1.1,animate:!reducedMotion});
  }
  function openScene(id,fly=true) {
    const scene=state.scenes.find(s=>s.id===id);if(!scene)return;
    if(!state.filtered.includes(scene))reset();
    state.selected=scene;mobileList(false);setHash(id);renderList();renderMarkers();renderCard();
    if(fly)flyToScene(scene);
  }
  function closeCard(focus=true) {
    const id=state.selected?.id;state.selected=null;$('#scene-card').hidden=true;$('.map-stage').classList.remove('has-card');setHash('');renderList();
    for(const marker of state.markers.values()) marker.getElement()?.classList.remove('is-active');
    if(focus&&id) state.markers.get(id)?.getElement()?.focus({preventScroll:true});
  }
  function renderCard() {
    const s=state.selected;if(!s)return;const f=s.movie;
    const count=state.scenes.filter(x=>x.film===f.id).length;
    const concealed=state.hideSpoilers&&!state.revealed.has(s.id);
    const body=concealed?'<div class="spoiler-cover"><p>Здесь начинается история фильма.</p><button id="reveal-scene">Показать описание сцены</button></div>':`<h3 class="story-heading">${escape(s.title)}</h3><p class="story-copy">${escape(s.description)}</p>`;
    const sources=[['О фильме',f.source],...(f.releaseSource?[['Дата премьеры',f.releaseSource]]:[]),['О месте',s.locationSource||f.source],['Источник кадра',f.imageSource]];
    $('#scene-card').innerHTML=`<div class="card-image"><img src="${escape(f.image)}" alt="Кадр из фильма «${escape(f.title)}»"><span class="card-topline">КИНО НА КАРТЕ</span><button class="icon-button card-close" id="close-card" aria-label="Закрыть карточку сцены">×</button></div><span class="frame-caption">Кадр из фильма · иллюстрация, не обязательно этот эпизод</span><div class="card-body"><div class="card-film-meta"><span>${year(f)}</span><span>${escape(f.genre)}</span><span>${escape(s.country)}</span></div><h2 id="card-title">${escape(f.title)}</h2><p class="original-title">${escape(f.original)}</p><dl class="film-facts"><div><dt>Премьера / первый выпуск</dt><dd>${escape(dateText(f.release))}</dd></div><div><dt>Режиссёр</dt><dd>${escape(f.director)}</dd></div></dl><div class="place-line">${pin}<span>${escape(s.place)}</span></div><p class="accuracy">${s.precision==='exact'?'Узнаваемое реальное место':'Приблизительная привязка · см. пояснение'}</p>${body}${s.note?`<p class="location-note">${escape(s.note)}</p>`:''}<div class="card-actions"><button id="film-scenes">${count>1?`Все места фильма · ${count}`:'Оставить этот фильм'}</button><button id="share-scene">Ссылка на сцену</button></div><div class="source-links">${sources.map(([label,url])=>`<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`).join('')}</div></div>`;
    $('#scene-card').hidden=false;$('#scene-card').scrollTop=0;$('.map-stage').classList.add('has-card');
    $('#close-card').addEventListener('click',()=>closeCard());
    $('#reveal-scene')?.addEventListener('click',()=>{state.revealed.add(s.id);renderCard();});
    $('#film-scenes').addEventListener('click',()=>selectFilm(f.id));
    $('#share-scene').addEventListener('click',async()=>{
      try{await navigator.clipboard.writeText(location.href);toast('Ссылка на сцену скопирована');}
      catch{toast('Ссылка на эту сцену — в адресной строке браузера');}
    });
  }
  function selectFilm(id) {
    reset();state.film=id;$('#search').value=state.films.find(f=>f.id===id).title;applyFilters(true);closeCard(false);mobileList(false);$('#collection-dialog').close();
    toast('На карте — места выбранного фильма');
  }
  function renderCollection() {
    const fragment=document.createDocumentFragment();
    for(const f of [...state.films].sort((a,b)=>a.title.localeCompare(b.title,'ru'))) {
      const count=state.scenes.filter(s=>s.film===f.id).length;
      const tile=document.createElement('button');tile.className='film-tile';tile.innerHTML=`<img src="${escape(f.image)}" alt="Кадр из фильма «${escape(f.title)}»" loading="lazy"><strong>${escape(f.title)}</strong><small>${year(f)} · ${escape(f.director)}<br>${count} ${count===1?'место':count<5?'места':'мест'}</small>`;
      tile.addEventListener('click',()=>selectFilm(f.id));fragment.append(tile);
    }$('#film-grid').replaceChildren(fragment);
  }
  async function initMap() {
    if(typeof L==='undefined')throw new Error('Не удалось загрузить библиотеку карты. Обновите страницу.');
    state.map=L.map('map',{zoomControl:false,minZoom:.5,maxZoom:18,zoomSnap:.25,worldCopyJump:false,maxBounds:[[-80,-190],[85,190]],maxBoundsViscosity:.8,attributionControl:true}).setView([24,20],2.5);
    state.map.attributionControl.setPrefix('<a href="https://leafletjs.com/" target="_blank" rel="noopener noreferrer">Leaflet</a>');
    state.map.attributionControl.addAttribution('География: <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer">Natural Earth</a>');
    state.map.createPane('baseGeo');state.map.getPane('baseGeo').style.zIndex=190;
    const response=await fetch('assets/world.geojson');if(!response.ok)throw new Error('Не загрузилась география карты. Обновите страницу.');const geo=await response.json();
    L.geoJSON(geo,{pane:'baseGeo',interactive:false,style:{fillColor:'#293a3d',fillOpacity:1,color:'#43554f',weight:.6,opacity:.7}}).addTo(state.map);
    const graticule=L.layerGroup().addTo(state.map);
    for(let lng=-180;lng<=180;lng+=30)L.polyline([[-80,lng],[85,lng]],{color:'#81978c',weight:.6,opacity:.10,interactive:false}).addTo(graticule);
    for(let lat=-60;lat<=60;lat+=30)L.polyline([[lat,-180],[lat,180]],{color:'#81978c',weight:.6,opacity:.10,interactive:false}).addTo(graticule);
    const labels=L.layerGroup().addTo(state.map);
    for(const [lat,lng,name,ocean] of [[49,-106,'СЕВЕРНАЯ АМЕРИКА'],[-21,-64,'ЮЖНАЯ АМЕРИКА'],[54,23,'ЕВРОПА'],[45,88,'АЗИЯ'],[6,19,'АФРИКА'],[-26,129,'АВСТРАЛИЯ'],[6,-148,'Тихий океан',true],[11,-36,'Атлантический океан',true],[-25,72,'Индийский океан',true]]) {
      L.marker([lat,lng],{interactive:false,keyboard:false,icon:L.divIcon({className:'map-label'+(ocean?' ocean-label':''),html:escape(name),iconSize:[180,25],iconAnchor:[90,12]})}).addTo(labels);
    }
    const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,noWrap:true,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'});
    let failures=0,tileNoticeShown=false;
    tiles.on('tileerror',()=>{failures++;if(failures>3&&!tileNoticeShown){tileNoticeShown=true;$('#map-notice').textContent='Подробная подложка недоступна. Общая карта и все сцены продолжают работать.';$('#map-notice').hidden=false;}});
    tiles.on('tileload',()=>{failures=0;$('#map-notice').hidden=true;});
    const updateZoom=()=>{const detailed=state.map.getZoom()>=5;$('.map-stage').classList.toggle('zoomed',detailed);if(detailed&&!state.map.hasLayer(tiles)){tiles.addTo(state.map);state.map.removeLayer(labels);state.map.removeLayer(graticule);}else if(!detailed&&state.map.hasLayer(tiles)){state.map.removeLayer(tiles);labels.addTo(state.map);graticule.addTo(state.map);$('#map-notice').hidden=true;}};
    state.map.on('zoomend',updateZoom);
    state.cluster=L.markerClusterGroup({showCoverageOnHover:false,maxClusterRadius:43,spiderfyOnMaxZoom:true,animate:!reducedMotion,iconCreateFunction:cluster=>L.divIcon({html:String(cluster.getChildCount()),className:'cluster-marker',iconSize:[38,38]})}).addTo(state.map);
    $('#world-view').addEventListener('click',()=>{closeCard(false);fitScenes();});$('#zoom-in').addEventListener('click',()=>state.map.zoomIn());$('#zoom-out').addEventListener('click',()=>state.map.zoomOut());
    $('#fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('.map-stage').requestFullscreen();}catch{toast('Полноэкранный режим недоступен в этом браузере');}});
    document.addEventListener('fullscreenchange',()=>{state.map.invalidateSize();$('#fullscreen').setAttribute('aria-label',document.fullscreenElement?'Выйти из полного экрана':'Полноэкранная карта');});
    new ResizeObserver(()=>state.map.invalidateSize()).observe($('.map-stage'));
  }
  function bindUI() {
    $('#search').addEventListener('input',()=>{state.film='';applyFilters();});
    for(const id of ['decade','genre','country'])$('#'+id).addEventListener('change',()=>applyFilters(true));
    $('#clear').addEventListener('click',reset);
    all('#regions button').forEach(button=>button.addEventListener('click',()=>{state.region=button.dataset.region;all('#regions button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));applyFilters(true);}));
    $('#spoiler-toggle').setAttribute('aria-checked',String(state.hideSpoilers));
    $('#spoiler-toggle').addEventListener('click',()=>{state.hideSpoilers=!state.hideSpoilers;state.revealed.clear();$('#spoiler-toggle').setAttribute('aria-checked',String(state.hideSpoilers));try{localStorage.setItem('kinoatlas-spoilers',String(state.hideSpoilers));}catch{}renderCard();});
    $('#random').addEventListener('click',()=>{if(!state.filtered.length)return;const others=state.filtered.filter(s=>s.id!==state.selected?.id);const pool=others.length?others:state.filtered;openScene(pool[Math.floor(Math.random()*pool.length)].id);});
    $('#mobile-list').addEventListener('click',()=>mobileList(!$('#sidebar').classList.contains('open')));
    $('#collection-nav').addEventListener('click',()=>$('#collection-dialog').showModal());$('#about-nav').addEventListener('click',()=>$('#about-dialog').showModal());$('#map-nav').addEventListener('click',()=>{mobileList(false);closeCard(false);});
    all('.dialog-close').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
    all('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();}}));
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&!$('dialog[open]')){closeCard();mobileList(false);}
      if(event.key==='/'&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)&&!$('dialog[open]')){event.preventDefault();if(matchMedia('(max-width:760px)').matches)mobileList(true);$('#search').focus();}
    });
    window.addEventListener('hashchange',()=>{const id=selectedFromHash();if(id)openScene(id);else closeCard(false);});
  }
  async function main() {
    const response=await fetch('data.json');if(!response.ok)throw new Error('Не удалось загрузить коллекцию. Попробуйте обновить страницу.');
    const catalog=await response.json();state.films=catalog.films;
    const films=new Map(state.films.map(f=>[f.id,f]));state.scenes=catalog.scenes.map(s=>({...s,movie:films.get(s.film),region:regionFor(s.country)}));
    for(const scene of state.scenes)scene.searchText=normalize([scene.movie.title,scene.movie.original,scene.movie.director,scene.place,scene.country,scene.title,year(scene.movie)].join(' '));
    const countries=new Set(state.scenes.map(s=>s.country));
    $('#stats').innerHTML=`<span><strong>${state.scenes.length}</strong>сцен</span><span><strong>${state.films.length}</strong>фильма</span><span><strong>${countries.size}</strong>стран</span>`;
    $('#nav-count').textContent=state.films.length;
    fillSelect('#decade',[...new Set(state.films.map(f=>Math.floor(Number(year(f))/10)*10))].sort((a,b)=>b-a),d=>d+'-е');
    fillSelect('#genre',[...new Set(state.films.map(f=>f.genre))].sort((a,b)=>a.localeCompare(b,'ru')));
    fillSelect('#country',[...countries].sort((a,b)=>a.localeCompare(b,'ru')));
    bindUI();renderCollection();
    await initMap();applyFilters();
    const deepLink=selectedFromHash();if(deepLink)openScene(deepLink);else fitScenes();
    $('#mobile-count') && ($('#mobile-count').textContent=state.scenes.length);
  }
  main().catch(error=>{
    console.error(error);$('#result-count').textContent='Ошибка загрузки';
    const message=document.createElement('div');message.className='fatal';message.textContent=error.message;const retry=document.createElement('button');retry.textContent='Обновить страницу';retry.style.cssText='display:block;margin-top:20px;padding:10px 16px;background:#f47957;color:#172024;border-radius:5px';retry.onclick=()=>location.reload();message.append(retry);document.body.append(message);
  });
})();
