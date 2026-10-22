// HTML страницы с Яндекс Картами 3.0 — общая для приложения (WebView) и Telegram (iframe).
import { YANDEX_MAPS_API_KEY } from '@/config';
import type { LatLng, Zone } from '@/lib/game';
import { colors } from '@/theme';

export type MapMarker = LatLng & {
  id: string;
  kind: 'ping' | 'player';
  color: string;
  label?: string | null;
  sub?: string | null;
};

export type MapProps = {
  me?: LatLng | null;
  zone?: Zone | null;
  nextZone?: Zone | null;
  markers?: MapMarker[];
  /** Затемнять всё вне зоны (в игре). */
  mask?: boolean;
  onPress?: (p: LatLng) => void;
};

export type YandexMapHandle = { recenter: () => void };

export const mapHtml = `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
  html, body, #map { margin:0; padding:0; width:100%; height:100%; background:${colors.bg}; overflow:hidden; }
  * { -webkit-tap-highlight-color: transparent; }
  .mk { position:absolute; width:0; height:0; pointer-events:none; font-family:-apple-system, Roboto, sans-serif; }
  .core { position:absolute; left:-9px; top:-9px; width:18px; height:18px; border-radius:50%;
          background:var(--c); border:3px solid #fff; box-sizing:border-box; box-shadow:0 2px 8px rgba(0,0,0,.6); }
  .pulse { position:absolute; left:-24px; top:-24px; width:48px; height:48px; border-radius:50%;
           background:var(--c); opacity:.0; animation:pulse 2s ease-out infinite; }
  @keyframes pulse { 0% { transform:scale(.3); opacity:.6 } 100% { transform:scale(1.4); opacity:0 } }
  .lbl { position:absolute; top:14px; left:0; transform:translateX(-50%); white-space:nowrap; text-align:center;
         padding:3px 8px; border-radius:10px; background:rgba(14,18,28,.88); color:#fff;
         font-size:12px; font-weight:700; border:1px solid rgba(255,255,255,.08); }
  .lbl span { display:block; font-size:10px; font-weight:600; color:#A3ABBD; }
  .me .core { background:${colors.me}; width:22px; height:22px; left:-11px; top:-11px; }
  .me .pulse { background:${colors.me}; }
  .player .core { width:30px; height:30px; left:-15px; top:-15px; display:flex; align-items:center; justify-content:center;
                  color:#fff; font-weight:800; font-size:13px; border-width:3px; border-color:var(--c); background:#1C2333; }
  .player .lbl { top:20px; }
</style>
<script>
  function post(m){
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m));
    else if (window.parent !== window) window.parent.postMessage({ ymap: m }, '*');
  }
  window.onerror = function(msg){ post({ type:'error', message:String(msg) }); };
</script>
<script src="https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(YANDEX_MAPS_API_KEY)}&lang=ru_RU"></script>
</head><body><div id="map"></div>
<script>
  var Y = null, map = null, last = null, centered = false;
  var markers = {};   // id -> { obj, el, sig }
  var features = {};  // id -> YMapFeature

  // ---- геометрия ----
  var R = 6371000;
  function ring(z, n) {
    var pts = [], lat = z.lat * Math.PI / 180;
    for (var i = 0; i <= n; i++) {
      var a = 2 * Math.PI * i / n;
      var dLat = z.r * Math.cos(a) / R, dLng = z.r * Math.sin(a) / (R * Math.cos(lat));
      pts.push([z.lng + dLng * 180 / Math.PI, z.lat + dLat * 180 / Math.PI]);
    }
    return pts;
  }
  function world(z) {
    var d = 2;
    return [[z.lng - d, z.lat - d], [z.lng + d, z.lat - d], [z.lng + d, z.lat + d], [z.lng - d, z.lat + d], [z.lng - d, z.lat - d]];
  }
  function zoomFor(z) {
    var px = Math.min(window.innerWidth, window.innerHeight) || 360;
    var mpp = (z.r * 2.3) / px;
    return Math.max(3, Math.min(19, Math.log2(156543.03 * Math.cos(z.lat * Math.PI / 180) / mpp)));
  }

  // ---- объекты ----
  function setFeature(id, geometry, style) {
    if (!geometry) {
      if (features[id]) { map.removeChild(features[id]); delete features[id]; }
      return;
    }
    if (features[id]) features[id].update({ geometry: geometry, style: style });
    else { features[id] = new Y.YMapFeature({ geometry: geometry, style: style }); map.addChild(features[id]); }
  }

  function esc(s){ return String(s || '').replace(/[&<>"]/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]; }); }

  function markerHtml(m) {
    var lbl = (m.label || m.sub) ? '<div class="lbl">' + esc(m.label) + (m.sub ? '<span>' + esc(m.sub) + '</span>' : '') + '</div>' : '';
    if (m.kind === 'player') {
      return '<div class="core">' + esc((m.label || '?').slice(0, 1).toUpperCase()) + '</div>' + lbl;
    }
    return '<div class="pulse"></div><div class="core"></div>' + lbl;
  }

  function setMarkers(list) {
    var seen = {};
    list.forEach(function(m) {
      seen[m.id] = true;
      var sig = m.kind + m.color + m.label + m.sub;
      var cur = markers[m.id];
      if (!cur) {
        var el = document.createElement('div');
        cur = markers[m.id] = { el: el, sig: null, obj: new Y.YMapMarker({ coordinates: [m.lng, m.lat], zIndex: m.zIndex || 1 }, el) };
        map.addChild(cur.obj);
      } else {
        cur.obj.update({ coordinates: [m.lng, m.lat] });
      }
      if (cur.sig !== sig) {
        cur.sig = sig;
        cur.el.className = 'mk ' + m.kind;
        cur.el.style.setProperty('--c', m.color);
        cur.el.innerHTML = markerHtml(m);
      }
    });
    Object.keys(markers).forEach(function(id) {
      if (!seen[id]) { map.removeChild(markers[id].obj); delete markers[id]; }
    });
  }

  window.recenter = function() {
    var d = last; if (!map || !d) return;
    var z = d.zone || (d.me ? { lat: d.me.lat, lng: d.me.lng, r: 250 } : null);
    if (z) map.update({ location: { center: [z.lng, z.lat], zoom: zoomFor(z), duration: 500 } });
  };

  window.update = function(d) {
    last = d;
    if (!map) return;
    var z = d.zone, nz = d.nextZone;
    setFeature('mask', z && d.mask ? { type:'Polygon', coordinates:[world(z), ring(z, 128).reverse()] } : null,
      { fill:'rgba(4,6,12,0.55)', stroke:[{ width:0, color:'rgba(0,0,0,0)' }] });
    setFeature('zone', z ? { type:'Polygon', coordinates:[ring(z, 128)] } : null,
      { fill: d.mask ? 'rgba(124,92,255,0.05)' : 'rgba(124,92,255,0.12)', stroke:[{ color:'${colors.primary}', width:3 }] });
    setFeature('next', nz ? { type:'Polygon', coordinates:[ring(nz, 128)] } : null,
      { fill:'rgba(0,0,0,0)', stroke:[{ color:'${colors.warn}', width:3, dash:[10, 8] }] });

    var list = (d.markers || []).slice();
    if (d.me) list.push({ id:'__me', kind:'me', color:'${colors.me}', lat:d.me.lat, lng:d.me.lng, zIndex:10 });
    setMarkers(list);

    if (!centered && (z || d.me)) { centered = true; window.recenter(); }
  };

  (async function() {
    try {
      await ymaps3.ready;
    } catch (e) {
      post({ type:'error', message:'Яндекс Карты не загрузились. Проверь ключ и «Ограничение по HTTP Referer»: ' +
        (window.ReactNativeWebView ? 'pryatki.app' : window.parent.location.hostname) });
      return;
    }
    Y = ymaps3;
    map = new Y.YMap(document.getElementById('map'),
      { location:{ center:[37.618, 55.751], zoom:14 }, theme:'dark', showScaleInCopyrights:false },
      [new Y.YMapDefaultSchemeLayer({ theme:'dark' }), new Y.YMapDefaultFeaturesLayer({})]);
    map.addChild(new Y.YMapListener({
      layer:'any',
      onClick: function(obj, ev) { if (ev && ev.coordinates) post({ type:'press', lng:ev.coordinates[0], lat:ev.coordinates[1] }); }
    }));
    post({ type:'ready' });
    if (last) window.update(last);
  })();
</script></body></html>`;
