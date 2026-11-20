/* KinoAtlas — buildless, static, no visitor keys or accounts. */
(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const all = (selector) => [...document.querySelectorAll(selector)];
  const escape = (value) => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const normalize = value => String(value).toLocaleLowerCase('ru').normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/ё/g,'е');
  const {zoomForScene,videoURL,sceneMedia,googleMapsURL}=KinoMapPolicy;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pin = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>';
  const state = {films:[],scenes:[],countryAudit:[],regionsByCountry:new Map(),filtered:[],selected:null,region:'',film:'',kind:'',map:null,markers:new Map(),revealed:new Set(),hideSpoilers:false,mapStyle:'color',sidebarCollapsed:false};
  try { state.hideSpoilers = localStorage.getItem('kinoatlas-spoilers') === 'true';state.mapStyle=localStorage.getItem('kinoatlas-map-style')==='mono'?'mono':'color';state.sidebarCollapsed=localStorage.getItem('kinoatlas-sidebar-hidden')==='true'; } catch { /* Storage is optional. */ }
  const regionFor = (country,lng=0,code='') => {
    if(code==='AQ')return 'Антарктика';
    if(country==='Россия')return lng>=60?'Азия':'Европа';
    return state.regionsByCountry.get(code)||'';
  };
  const dateText = date => {
    if (/^\d{4}$/.test(date)) return date + ' год';
    if (/^\d{4}-\d{2}$/.test(date)) return new Intl.DateTimeFormat('ru',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(date+'-01T12:00:00Z'));
    return new Intl.DateTimeFormat('ru',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'));
  };
  const year = film => film.release.slice(0,4);
  const plural = (n,one,few,many) => n%100>=11&&n%100<=14?many:n%10===1?one:n%10>=2&&n%10<=4?few:many;
  const isAnimation = film => film.genre==='Анимация';
  const kindMatches = film => !state.kind || (state.kind==='game' ? Boolean(film.basedOnGame) : state.kind==='animation' ? isAnimation(film) : state.kind==='film' ? (film.kind||'film')==='film'&&!isAnimation(film) : film.kind===state.kind);
  const typeLabel = film => film.kind==='series'?'Сериал':isAnimation(film)?'Мультфильм':'Фильм';
  let toastTimeout,searchTimer;
  function toast(message) { $('#toast').textContent=message; $('#toast').hidden=false;clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('#toast').hidden=true,3300); }
  function mobileList(open) { $('#sidebar').classList.toggle('open',open);$('#mobile-list').textContent=open?'Вернуться к карте':'Поиск и фильтры';$('#mobile-list').setAttribute('aria-expanded',String(open));syncSidebar(); }
  function sidebarVisible(open) {
    if(matchMedia('(max-width:760px)').matches){mobileList(open);}
    else{state.sidebarCollapsed=!open;$('.workspace').classList.toggle('sidebar-collapsed',!open);try{localStorage.setItem('kinoatlas-sidebar-hidden',String(!open));}catch{}}
    syncSidebar();
    requestAnimationFrame(()=>{state.map?.invalidateSize({pan:false,animate:false});if(state.selected)flyToScene(state.selected);});
  }
  function syncSidebar() {
    const mobile=matchMedia('(max-width:760px)').matches;
    const open=mobile?$('#sidebar').classList.contains('open'):!state.sidebarCollapsed;
    $('#sidebar').inert=!open;
    $('#sidebar-toggle').setAttribute('aria-expanded',String(open));
    $('#sidebar-toggle').setAttribute('aria-label',open?'Скрыть боковую панель':'Показать боковую панель');
  }
  function setMapStyle(style) {
    state.mapStyle=style;$('.map-stage').dataset.mapStyle=style;
    all('[data-map-style]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mapStyle===style)));
    state.baseGeo?.setStyle(style==='mono'?{fillColor:'#bcbcbc',color:'#737373'}:{fillColor:'#a9bb91',color:'#6e8875'});
    try{localStorage.setItem('kinoatlas-map-style',style);}catch{}
  }
  function fillSelect(selector,items,label = x=>x) {
    for (const item of items) {const option=document.createElement('option');option.value=item;option.textContent=label(item);$(selector).append(option);}
  }
  function renderCountryAudit() {
    const q=normalize($('#audit-search').value.trim()),status=$('#audit-status').value;
    const rows=state.countryAudit.filter(c=>(!q||normalize(c.country+' '+c.title).includes(q))&&(!status||c.status===status));
    const labels={on_map:'Есть сцены на карте',frame_needed:'Фильм найден · нужен подходящий кадр',setting_unconfirmed:'Нужно уточнить место действия'};
    $('#audit-count').textContent=`${rows.length} из ${state.countryAudit.length}`;
    const fragment=document.createDocumentFragment();
    for(const c of rows){
      const row=document.createElement('div');row.className='audit-row';
      row.innerHTML=`<div><h3>${escape(c.country)}</h3><span class="audit-status ${escape(c.status)}">${labels[c.status]}</span><p>${escape(c.title)}</p><details><summary>Пояснение и источник</summary><p>${escape(c.note)}</p><a href="${escape(c.source)}" target="_blank" rel="noopener noreferrer">Источник о месте действия ↗</a></details></div>`;
      if(c.sceneIds.length){const button=document.createElement('button');button.className='audit-map-button';button.textContent='На карту';button.setAttribute('aria-label',`Показать на карте: ${c.country}`);button.addEventListener('click',()=>{const scene=state.scenes.find(s=>s.id===c.sceneIds[0]);$('#country-dialog').close();reset(false);$('#country').value=scene.country;applyFilters(true);mobileList(false);closeCard(false);});row.append(button);}
      fragment.append(row);
    }
    if(!rows.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='Ни одной страны по этим условиям. Измените запрос или статус.';fragment.append(empty);}
    $('#audit-list').replaceChildren(fragment);
  }
  function setHash(id) {const url=new URL(location.href);url.hash=id?'scene='+encodeURIComponent(id):'';history.replaceState(null,'',url);}
  function selectedFromHash() {return new URLSearchParams(location.hash.slice(1)).get('scene');}
  function reset(fit=true) {
    clearTimeout(searchTimer);
    $('#search').value='';$('#decade').value='';$('#genre').value='';$('#country').value='';state.region='';state.film='';state.kind='';
    all('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(!b.dataset.kind)));renderCollection();
    all('#regions button').forEach(b=>b.setAttribute('aria-pressed',String(!b.dataset.region)));applyFilters(fit!==false);
  }
  function applyFilters(fit=false) {
    if(fit)clearTimeout(searchTimer);
    const q=normalize($('#search').value.trim()), decade=$('#decade').value,genre=$('#genre').value,country=$('#country').value;
    state.filtered=state.scenes.filter(scene=>{
      const f=scene.movie;
      return (!q||scene.searchText.includes(q))&&(!decade||String(Math.floor(Number(year(f))/10)*10)===decade)&&(!genre||f.genre===genre)&&(!country||scene.country===country)&&(!state.region||scene.region===state.region)&&(!state.film||f.id===state.film)&&kindMatches(f);
    });
    if (state.selected&&!state.filtered.some(s=>s.id===state.selected.id)) closeCard(false);
    $('#search-feedback').hidden=state.filtered.length>0;$('#search-feedback').textContent='Ничего не найдено. Измените запрос или фильтры.';
    $('#random').disabled=!state.filtered.length;
    renderMarkers();
    if(fit) fitScenes();
    if($('#sidebar').classList.contains('open')) mobileList(true);
  }
  function renderMarkers() {
    if(!state.sceneLayer) return;
    state.sceneLayer.clearLayers();state.markers.clear();
    for(const scene of state.filtered) {
      const active=state.selected?.id===scene.id;
      const marker=L.marker([scene.lat,scene.lng],{
        title:`${scene.movie.title} · ${scene.place}`,alt:`Открыть сцену: ${scene.movie.title}, ${scene.place}`,keyboard:true,riseOnHover:true,
        icon:L.divIcon({className:'film-marker'+(active?' is-active':''),html:`<span class="film-dot ${scene.precision==='approx'?'approx':''}"></span>`,iconSize:[32,32],iconAnchor:[16,16]})
      });
      marker.bindTooltip(`${escape(scene.movie.title)} <span style="opacity:.65">· ${year(scene.movie)}</span>`,{direction:'top',offset:[0,-12]});
      marker.on('click',()=>openScene(scene.id));state.markers.set(scene.id,marker);state.sceneLayer.addLayer(marker);
    }
  }
  function fitScenes(scenes=state.filtered) {
    if(!state.map||!scenes.length) return;
    const bounds=L.latLngBounds(scenes.map(s=>[s.lat,s.lng]));
    if(scenes.length===1){state.map.setView(bounds.getCenter(),zoomForScene(state.map.getZoom()),{animate:!reducedMotion});return;}
    state.map.fitBounds(bounds,{paddingTopLeft:[55,85],paddingBottomRight:[65,140],maxZoom:12,animate:!reducedMotion});
  }
  function flyToScene(scene) {
    const map=state.map;if(!map)return;
    const mobile=matchMedia('(max-width:760px)').matches;
    const targetZoom=zoomForScene(map.getZoom());
    const box=$('#map').getBoundingClientRect(),card=$('#scene-card').getBoundingClientRect();
    // Keep the real coordinates; move the camera so the marker stays in the visible map.
    let target=L.point(Math.max(40,(card.left-box.left-20)/2),box.height/2);
    if(mobile){const info=$('.map-info').getBoundingClientRect();target=L.point(box.width/2,(info.bottom+card.top)/2-box.top);}
    const offset=target.subtract(map.getSize().divideBy(2));
    const center=map.unproject(map.project([scene.lat,scene.lng],targetZoom).subtract(offset),targetZoom);
    map.stop();map.setView(center,targetZoom,{animate:!reducedMotion,duration:.45});
  }
  function openScene(id,fly=true) {
    clearTimeout(searchTimer);
    const scene=state.scenes.find(s=>s.id===id);if(!scene)return;
    if(!state.filtered.includes(scene))reset(false);
    state.selected=scene;mobileList(false);setHash(id);renderMarkers();renderCard();
    if(fly)flyToScene(scene);
  }
  function closeCard(focus=true) {
    const id=state.selected?.id;state.selected=null;$('#scene-card').hidden=true;$('#scene-card').replaceChildren();$('.map-stage').classList.remove('has-card');setHash('');
    for(const marker of state.markers.values()) marker.getElement()?.classList.remove('is-active');
    if(focus&&id) state.markers.get(id)?.getElement()?.focus({preventScroll:true});
  }
  function renderCard() {
    const s=state.selected;if(!s)return;const f=s.movie;
    const media=sceneMedia(s,f);
    const fullSource=media?.sourceKind==='full-film'||media?.duration>=3600;
    const mediaLabel=media?.type==='clip'?'Фрагмент места':media?.type==='trailer'?'Трейлер':fullSource?'Фильм целиком':'Видеоматериал';
    const concealed=state.hideSpoilers&&!state.revealed.has(s.id);
    const isSeries=f.kind==='series';
    const body=concealed?'<div class="spoiler-cover"><p>Описание сюжета скрыто.</p><button id="reveal-scene">Показать описание сцены</button></div>':`<h3 class="story-heading">${escape(s.title)}</h3><p class="story-copy">${escape(s.description)}</p>`;
    const sources=[[isSeries?'О сериале':'О фильме',f.source],...(f.releaseSource?[['Дата премьеры',f.releaseSource]]:[]),['О месте',s.locationSource||f.source],['Кадр и сцена',s.imageSource],...(s.episodeSource?[['Об эпизоде',s.episodeSource]]:[])];
    const creditLabel=isSeries?(s.director?'Режиссёр эпизода':'Создатель сериала'):'Режиссёр';
    const credit=s.director||f.creator||f.director;
    const episode=isSeries&&s.season?`<p class="episode-meta">Сезон ${s.season}${s.episode?` · эпизод ${s.episode}`:''}${s.episodeTitle?`<br>${escape(s.episodeTitle)}`:''}${s.episodeDate?`<span>${escape(dateText(s.episodeDate))}</span>`:''}</p>`:'';
    const accuracy=s.mapBasis==='inspiration'?`Реальный прототип${s.storyPlace?` · на экране: ${escape(s.storyPlace)}`:''}`:s.mapBasis==='filming'?`Место съёмки${s.storyPlace?` · на экране: ${escape(s.storyPlace)}`:''}`:s.mapBasis==='story'?'Место действия · экранная реконструкция':(s.precision==='exact'?'Место действия · узнаваемая локация':'Приблизительная привязка · см. пояснение');
    const caption=s.frameCaption||(s.mapBasis==='inspiration'?`Кадр мультфильма · ${s.storyPlace}`:`Кадр сцены · ${s.place}`);
    $('#scene-card').innerHTML=`<div class="card-media-heading"><div class="media-tabs" role="group" aria-label="Материал сцены"><button id="show-frame" aria-pressed="true">Кадр</button>${media?'<button id="show-video" aria-pressed="false">Видео</button>':''}</div><button class="icon-button" id="close-card" aria-label="Закрыть карточку сцены">×</button></div><div class="card-image" id="card-media"><img src="${escape(s.image)}" alt="${escape(s.shotDescription||`Кадр сцены «${s.title}»: ${s.place}`)}"></div><a id="video-source" class="video-source" href="${escape(media?.source||s.imageSource)}" target="_blank" rel="noopener noreferrer" hidden>${mediaLabel} · Открыть на YouTube</a><p class="video-context" id="video-context" hidden>${media?.type==='clip'?'Фрагмент отмеченной сцены и места.':media?.type==='trailer'?'Трейлер всего произведения. Он может показывать другие места.':fullSource?'Опубликованная версия фильма. Показ с начала.':'Опубликованный видеоматериал о произведении. Он может показывать другие места.'}</p><span class="frame-caption">${escape(caption)}${s.timecode?` · ${escape(s.timecode)}`:''}</span><div class="card-body"><div class="card-film-meta"><span>${typeLabel(f)}</span><span>${year(f)}</span><span>${escape(f.genre)}</span><span>${escape(s.country)}</span></div><h2 id="card-title">${escape(f.title)}</h2><p class="original-title">${escape(f.original)}</p>${f.basedOnGame?`<p class="game-meta">По игре «${escape(f.basedOnGame)}»</p>`:''}<dl class="film-facts"><div><dt>${isSeries?'Премьера сериала':'Премьера / первый выпуск'}</dt><dd>${escape(dateText(f.release))}</dd></div><div><dt>${creditLabel}</dt><dd>${escape(credit)}</dd></div></dl>${episode}<div class="place-line">${pin}<span>${escape(s.place)}</span></div><p class="accuracy">${accuracy}</p>${body}${s.note?`<p class="location-note">${escape(s.note)}</p>`:''}<div class="card-actions"><a class="google-maps-link" href="${escape(googleMapsURL(s.lat,s.lng))}" target="_blank" rel="noopener noreferrer">Посмотреть на google maps</a></div><div class="source-links">${sources.map(([label,url])=>`<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`).join('')}</div></div>`;
    $('#scene-card').hidden=false;$('#scene-card').scrollTop=0;$('.map-stage').classList.add('has-card');
    const showMedia=(video)=>{
      $('#show-frame').setAttribute('aria-pressed',String(!video));$('#show-video')?.setAttribute('aria-pressed',String(video));
      $('#video-source').hidden=!video;$('#video-context').hidden=!video;$('#scene-card .frame-caption').hidden=video;
      if(video){const iframe=document.createElement('iframe');iframe.src=videoURL(media);iframe.title=`${f.title} — ${mediaLabel}`;iframe.allow='encrypted-media; picture-in-picture; fullscreen';iframe.allowFullscreen=true;iframe.referrerPolicy='strict-origin-when-cross-origin';$('#card-media').replaceChildren(iframe);}
      else{const img=document.createElement('img');img.src=s.image;img.alt=s.shotDescription||`Кадр сцены «${s.title}»: ${s.place}`;$('#card-media').replaceChildren(img);}
    };
    $('#show-frame').addEventListener('click',()=>showMedia(false));$('#show-video')?.addEventListener('click',()=>showMedia(true));
    $('#close-card').addEventListener('click',()=>closeCard());
    $('#reveal-scene')?.addEventListener('click',()=>{state.revealed.add(s.id);renderCard();});
  }
  function selectFilm(id) {
    reset(false);state.film=id;$('#search').value=state.films.find(f=>f.id===id).title;applyFilters(true);closeCard(false);mobileList(false);$('#collection-dialog').close();
    toast('На карте — места выбранной истории');
  }
  function renderCollection() {
    const fragment=document.createDocumentFragment();
    for(const f of [...state.films].sort((a,b)=>a.title.localeCompare(b.title,'ru'))) {
      if(!kindMatches(f))continue;
      const firstScene=state.scenes.find(s=>s.film===f.id);
      const tile=document.createElement('button');tile.className='film-tile';tile.innerHTML=`<img src="${escape(firstScene?.image||f.image)}" alt="Кадр ${f.kind==='series'?'сериала':'фильма'} «${escape(f.title)}»" loading="lazy"><strong>${escape(f.title)}</strong><small>${typeLabel(f)} · ${year(f)} · ${escape(f.creator||f.director)}${f.basedOnGame?`<br>По игре «${escape(f.basedOnGame)}»`:''}</small>`;
      tile.addEventListener('click',()=>selectFilm(f.id));fragment.append(tile);
    }$('#film-grid').replaceChildren(fragment);
  }
  async function initMap() {
    if(typeof L==='undefined')throw new Error('Не удалось загрузить библиотеку карты. Обновите страницу.');
    state.map=L.map('map',{zoomControl:false,minZoom:1,maxZoom:18,zoomSnap:.25,zoomDelta:1,wheelDebounceTime:40,wheelPxPerZoomLevel:100,worldCopyJump:false,maxBounds:[[-85,-190],[85,190]],maxBoundsViscosity:.8,attributionControl:true}).setView([24,20],2.5);
    state.map.attributionControl.setPrefix('<a href="https://leafletjs.com/" target="_blank" rel="noopener noreferrer">Leaflet</a>');
    state.map.attributionControl.addAttribution('География: <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer">Natural Earth</a>');
    state.map.createPane('baseGeo');state.map.getPane('baseGeo').style.zIndex=190;
    const response=await fetch('assets/world.geojson');if(!response.ok)throw new Error('Не загрузилась география карты. Обновите страницу.');const geo=await response.json();
    state.baseGeo=L.geoJSON(geo,{pane:'baseGeo',interactive:false,style:{fillColor:'#a9bb91',fillOpacity:1,color:'#6e8875',weight:.6,opacity:.7}}).addTo(state.map);
    setMapStyle(state.mapStyle);L.control.scale({imperial:false,position:'bottomleft'}).addTo(state.map);
    const graticule=L.layerGroup().addTo(state.map);
    for(let lng=-180;lng<=180;lng+=30)L.polyline([[-80,lng],[85,lng]],{color:'#81978c',weight:.6,opacity:.10,interactive:false}).addTo(graticule);
    for(let lat=-60;lat<=60;lat+=30)L.polyline([[lat,-180],[lat,180]],{color:'#81978c',weight:.6,opacity:.10,interactive:false}).addTo(graticule);
    const labels=L.layerGroup().addTo(state.map);
    for(const [lat,lng,name,ocean] of [[49,-106,'СЕВЕРНАЯ АМЕРИКА'],[-21,-64,'ЮЖНАЯ АМЕРИКА'],[54,23,'ЕВРОПА'],[45,88,'АЗИЯ'],[6,19,'АФРИКА'],[-72,0,'АНТАРКТИДА'],[-26,129,'АВСТРАЛИЯ'],[6,-148,'Тихий океан',true],[11,-36,'Атлантический океан',true],[-25,72,'Индийский океан',true]]) {
      L.marker([lat,lng],{interactive:false,keyboard:false,icon:L.divIcon({className:'map-label'+(ocean?' ocean-label':''),html:escape(name),iconSize:[180,25],iconAnchor:[90,12]})}).addTo(labels);
    }
    const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,noWrap:true,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'});
    let failures=0,tileNoticeShown=false;
    tiles.on('tileerror',()=>{failures++;if(failures>3&&!tileNoticeShown){tileNoticeShown=true;$('#map-notice').textContent='Подробная подложка недоступна. Общая карта и все сцены продолжают работать.';$('#map-notice').hidden=false;}});
    tiles.on('tileload',()=>{failures=0;$('#map-notice').hidden=true;});
    const updateZoom=()=>{$('#map').dataset.zoom=String(state.map.getZoom());const detailed=state.map.getZoom()>=5;$('.map-stage').classList.toggle('zoomed',detailed);if(detailed&&!state.map.hasLayer(tiles)){tiles.addTo(state.map);state.map.removeLayer(labels);state.map.removeLayer(graticule);}else if(!detailed&&state.map.hasLayer(tiles)){state.map.removeLayer(tiles);labels.addTo(state.map);graticule.addTo(state.map);$('#map-notice').hidden=true;}};
    state.map.on('zoomend',updateZoom);updateZoom();
    const foldInfo=()=>setMapInfoOpen(false);
    state.map.on('dragstart',foldInfo);
    $('#map').addEventListener('wheel',foldInfo,{passive:true});
    $('#map').addEventListener('touchmove',foldInfo,{passive:true});
    $('#map').addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','+','-','='].includes(event.key))foldInfo();});
    state.sceneLayer=L.layerGroup().addTo(state.map);
    $('#world-view').addEventListener('click',()=>{setMapInfoOpen(false);closeCard(false);fitScenes();});$('#zoom-in').addEventListener('click',()=>{setMapInfoOpen(false);state.map.zoomIn(1,{animate:false});});$('#zoom-out').addEventListener('click',()=>{setMapInfoOpen(false);state.map.zoomOut(1,{animate:false});});
    $('#fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('.map-stage').requestFullscreen();}catch{toast('Полноэкранный режим недоступен в этом браузере');}});
    document.addEventListener('fullscreenchange',()=>{state.map.invalidateSize();$('#fullscreen').setAttribute('aria-label',document.fullscreenElement?'Выйти из полного экрана':'Полноэкранная карта');});
    new ResizeObserver(()=>{state.map.invalidateSize({pan:false,animate:false});if(state.selected)flyToScene(state.selected);}).observe($('.map-stage'));
  }
  function setMapInfoOpen(open) {
    $('.map-info').classList.toggle('is-collapsed',!open);$('#map-info-details').hidden=!open;
    $('#map-info-toggle').setAttribute('aria-expanded',String(open));
    $('#map-info-toggle').setAttribute('aria-label',open?'Свернуть пояснения к карте':'Показать пояснения к карте');
  }
  function bindUI() {
    $('#map-info-toggle').addEventListener('click',()=>{setMapInfoOpen($('#map-info-toggle').getAttribute('aria-expanded')!=='true');});
    $('.workspace').classList.toggle('sidebar-collapsed',state.sidebarCollapsed);syncSidebar();
    $('#sidebar-toggle').addEventListener('click',()=>sidebarVisible($('#sidebar-toggle').getAttribute('aria-expanded')!=='true'));
    $('#sidebar-close').addEventListener('click',()=>{sidebarVisible(false);$('#sidebar-toggle').focus({preventScroll:true});});
    matchMedia('(max-width:760px)').addEventListener('change',syncSidebar);
    all('[data-map-style]').forEach(b=>b.addEventListener('click',()=>setMapStyle(b.dataset.mapStyle)));

    $('#search').addEventListener('input',()=>{state.film='';clearTimeout(searchTimer);if(state.selected)closeCard(false);applyFilters();searchTimer=setTimeout(fitScenes,220);});
    for(const id of ['decade','genre','country'])$('#'+id).addEventListener('change',()=>applyFilters(true));
    $('#clear').addEventListener('click',reset);
    all('[data-kind]').forEach(button=>button.addEventListener('click',()=>{state.kind=button.dataset.kind;state.film='';all('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.kind===state.kind)));renderCollection();applyFilters(true);}));
    all('#regions button').forEach(button=>button.addEventListener('click',()=>{state.region=button.dataset.region;all('#regions button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));applyFilters(true);}));
    $('#spoiler-toggle').setAttribute('aria-checked',String(state.hideSpoilers));
    $('#spoiler-toggle').addEventListener('click',()=>{state.hideSpoilers=!state.hideSpoilers;state.revealed.clear();$('#spoiler-toggle').setAttribute('aria-checked',String(state.hideSpoilers));try{localStorage.setItem('kinoatlas-spoilers',String(state.hideSpoilers));}catch{}renderCard();});
    $('#random').addEventListener('click',()=>{if(!state.filtered.length)return;const others=state.filtered.filter(s=>s.id!==state.selected?.id);const pool=others.length?others:state.filtered;openScene(pool[Math.floor(Math.random()*pool.length)].id);});
    $('#mobile-list').addEventListener('click',()=>mobileList(!$('#sidebar').classList.contains('open')));
    $('#collection-nav').addEventListener('click',()=>$('#collection-dialog').showModal());$('#about-nav').addEventListener('click',()=>$('#about-dialog').showModal());$('#map-nav').addEventListener('click',()=>{mobileList(false);closeCard(false);});
    $('#open-country-audit').addEventListener('click',()=>{$('#about-dialog').close();$('#country-dialog').showModal();renderCountryAudit();});
    $('#audit-search').addEventListener('input',renderCountryAudit);$('#audit-status').addEventListener('change',renderCountryAudit);
    all('.dialog-close').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
    all('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();}}));
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&!$('dialog[open]')){closeCard();mobileList(false);}
      if(event.key==='/'&&!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)&&!$('dialog[open]')){event.preventDefault();sidebarVisible(true);$('#search').focus();}
    });
    window.addEventListener('hashchange',()=>{const id=selectedFromHash();if(id)openScene(id);else closeCard(false);});
  }
  async function main() {
    const response=await fetch('data.json?v=20261120.3',{cache:'no-cache'});if(!response.ok)throw new Error('Не удалось загрузить коллекцию. Попробуйте обновить страницу.');
    const catalog=await response.json();state.films=catalog.films;
    state.countryAudit=catalog.countryAudit;state.regionsByCountry=new Map(state.countryAudit.map(c=>[c.iso,c.region]));
    const films=new Map(state.films.map(f=>[f.id,f]));state.scenes=catalog.scenes.map(s=>({...s,movie:films.get(s.film),region:regionFor(s.country,s.lng,s.countryCode)}));
    for(const scene of state.scenes)scene.searchText=normalize([scene.movie.title,scene.movie.original,scene.movie.creator,scene.movie.director,scene.director,scene.episodeTitle,scene.movie.basedOnGame,scene.region,scene.place,scene.country,scene.title,year(scene.movie)].join(' '));
    const countries=new Set(state.scenes.map(s=>s.country));
    const mapped=state.countryAudit.filter(c=>c.status==='on_map').length;$('#country-summary').textContent=`Проверены все ${state.countryAudit.length} стран: ${mapped} уже представлены сюжетными сценами. В обзоре видны найденные фильмы и оставшиеся пробелы. Отсутствие точки не означает, что в стране не происходило действие фильма.`;
    fillSelect('#decade',[...new Set(state.films.map(f=>Math.floor(Number(year(f))/10)*10))].sort((a,b)=>b-a),d=>d+'-е');
    fillSelect('#genre',[...new Set(state.films.map(f=>f.genre))].sort((a,b)=>a.localeCompare(b,'ru')));
    fillSelect('#country',[...countries].sort((a,b)=>a.localeCompare(b,'ru')));
    bindUI();renderCollection();
    await initMap();applyFilters();
    state.map.once('moveend',()=>state.map.on('movestart',()=>setMapInfoOpen(false)));
    const deepLink=selectedFromHash();if(deepLink)openScene(deepLink);else fitScenes();
  }
  main().catch(error=>{
    console.error(error);$('#search-feedback').hidden=false;$('#search-feedback').textContent='Ошибка загрузки';
    const message=document.createElement('div');message.className='fatal';message.textContent=error.message;const retry=document.createElement('button');retry.textContent='Обновить страницу';retry.style.cssText='display:block;margin-top:20px;padding:10px 16px;background:#f47957;color:#172024;border-radius:5px';retry.onclick=()=>location.reload();message.append(retry);document.body.append(message);
  });
})();
