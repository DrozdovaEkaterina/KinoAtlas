/* Shared map and media rules, independent of the map renderer. */
(function (root) {
  'use strict';
  const SCENE_ZOOM = 10;
  function zoomForScene(currentZoom) {
    return Math.max(SCENE_ZOOM, Number.isFinite(currentZoom) ? currentZoom : 0);
  }
  function videoURL(video) {
    if (!video || !/^[\w-]{11}$/.test(video.id)) return null;
    const fullVideo = ['trailer','source'].includes(video.type);
    if (!fullVideo && (!Number.isInteger(video.start) || !Number.isInteger(video.end))) return null;
    const start = video.start ?? 0;
    if (!Number.isInteger(start) || start < 0 || (video.end !== undefined && (!Number.isInteger(video.end) || video.end <= start))) return null;
    const url = new URL('https://www.youtube-nocookie.com/embed/' + video.id);
    const params = new URLSearchParams({start:String(start),playsinline:'1',rel:'0',autoplay:'0'});
    if (video.end !== undefined) params.set('end',String(video.end));
    url.search = params.toString();
    return url.href;
  }
  function sceneMedia(scene,film) {
    if (videoURL(scene.video)) return {...scene.video,type:'clip'};
    return videoURL(film.video) ? film.video : null;
  }
  function googleMapsURL(lat,lng) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat)>90 || Math.abs(lng)>180) return null;
    const url=new URL('https://www.google.com/maps/search/');
    url.search=new URLSearchParams({api:'1',query:lat+','+lng}).toString();
    return url.href;
  }
  const policy = { SCENE_ZOOM, zoomForScene, videoURL, sceneMedia, googleMapsURL };
  if (typeof module === 'object' && module.exports) module.exports = policy;
  else root.KinoMapPolicy = policy;
})(typeof globalThis !== 'undefined' ? globalThis : this);
