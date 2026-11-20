/* Shared map and media rules, independent of the map renderer. */
(function (root) {
  'use strict';
  const SCENE_ZOOM = 10;
  function zoomForScene(currentZoom) {
    return Math.max(SCENE_ZOOM, Number.isFinite(currentZoom) ? currentZoom : 0);
  }
  function videoURL(video) {
    if (!video || !/^[\w-]{11}$/.test(video.id) || !Number.isInteger(video.start) || !Number.isInteger(video.end) || video.start < 0 || video.end <= video.start) return null;
    const url = new URL('https://www.youtube-nocookie.com/embed/' + video.id);
    url.search = new URLSearchParams({start:String(video.start),end:String(video.end),playsinline:'1',rel:'0',autoplay:'0'}).toString();
    return url.href;
  }
  const policy = { SCENE_ZOOM, zoomForScene, videoURL };
  if (typeof module === 'object' && module.exports) module.exports = policy;
  else root.KinoMapPolicy = policy;
})(typeof globalThis !== 'undefined' ? globalThis : this);
