/**
 * Territory Map – Leaflet + WebView polygon overlay for the Compete feature.
 *
 * Each runner's claimed land is a real polygon (built server-side from their
 * closed-loop runs), rendered here with Leaflet's native GeoJSON support:
 *  • Your territory → your trail colour, drawn on top
 *  • Everyone else's → their colour
 *
 * Same component also renders the Groups view: the parent just feeds it
 * group-shaped rows (group id in place of user id, group colour, each
 * group's merged/unioned polygon) instead of per-user ones — this component
 * doesn't know or care which it's drawing, see `mode` for the one cosmetic
 * difference (tooltip label formatting).
 *
 * Territories are fetched per-viewport (see onBoundsChanged) so the map
 * never has to load the whole world's claims at once.
 */

import { useRef, useEffect, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { AuroraColors, Colors } from '@/constants/theme';
import { TerritoryFeature } from '@/services/supabase';

export interface TerritoryMapProps {
  latitude: number;
  longitude: number;
  colors: typeof Colors.light;
  trailColor: string;
  /** Claimed territories in the visible area (from Supabase) */
  territories: TerritoryFeature[];
  /**
   * Feature ids (TerritoryFeature.user_id) to draw as "mine" — thicker
   * border, drawn on top. A plain list rather than a single id because a
   * group view needs to highlight every group the viewer belongs to, not
   * just one.
   */
  highlightIds: string[];
  /** 'group' drops the '@' person-mention prefix from tooltip labels. */
  mode?: 'individual' | 'group';
  /** Called when the user pans/zooms so parent can fetch territories for new bounds */
  onBoundsChanged?: (minLat: number, maxLat: number, minLng: number, maxLng: number) => void;
}

// ─── Leaflet HTML Builder ───────────────────────────────────

const buildHTML = (lat: number, lng: number, isDark: boolean, trailColor: string) => {
  // Free, keyless, unlimited vector tiles (no API key, no rate limit) via MapLibre GL,
  // rendered as a Leaflet layer through the maplibre-gl-leaflet plugin. Dark mode is a
  // real OpenFreeMap style now, not a CSS filter over raster tiles.
  const styleUrl = isDark
    ? 'https://tiles.openfreemap.org/styles/dark'
    : 'https://tiles.openfreemap.org/styles/positron';

  const hexToRgb = (hex: string) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}` : '91,126,164';
  };
  const rgb = hexToRgb(trailColor);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"><\/script>
<script src="https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden}
#map{width:100%;height:100%;background:${AuroraColors.mapBase}}
.leaflet-control-attribution{font-size:9px!important}
.dot{width:18px;height:18px;border-radius:50%;background:${trailColor};border:3px solid ${AuroraColors.text};box-shadow:0 0 0 rgba(${rgb},.4);animation:p 2s infinite}
@keyframes p{0%{box-shadow:0 0 0 0 rgba(${rgb},.5)}70%{box-shadow:0 0 0 14px rgba(${rgb},0)}100%{box-shadow:0 0 0 0 rgba(${rgb},0)}}
.owner-label{background:rgba(0,0,0,.65);color:#fff;font-size:11px;padding:2px 6px;border-radius:4px;border:none;box-shadow:none;white-space:nowrap}
.owner-label:before{display:none}
</style>
</head>
<body>
<div id="map"></div>
<script>
var map=L.map('map',{center:[${lat},${lng}],zoom:16,zoomControl:false,renderer:L.canvas({padding:0.5})});
L.maplibreGL({style:'${styleUrl}',attribution:'&copy; OpenFreeMap &copy; OpenStreetMap contributors'}).addTo(map);

var dotIcon=L.divIcon({className:'dot',iconSize:[18,18],iconAnchor:[9,9]});
var dot=L.marker([${lat},${lng}],{icon:dotIcon}).addTo(map);

var terrLyr=L.layerGroup().addTo(map);
var myIds=[];

function styleFor(f){
  var mine = myIds.indexOf(f.properties.user_id) !== -1;
  return {
    color: f.properties.color,
    fillColor: f.properties.color,
    weight: mine ? 2.5 : 1.5,
    opacity: mine ? 0.95 : 0.55,
    fillOpacity: mine ? 0.38 : 0.22
  };
}

function draw(items){
  terrLyr.clearLayers();
  if(!items) return;
  // draw others first, "my" territory/territories last so they sit on top
  var others = items.filter(function(t){ return myIds.indexOf(t.user_id) === -1; });
  var mine = items.filter(function(t){ return myIds.indexOf(t.user_id) !== -1; });
  others.concat(mine).forEach(function(t){
    if(!t.geojson) return;
    var feature = { type:'Feature', properties:{ user_id:t.user_id, color:t.trail_color }, geometry:t.geojson };
    var layer = L.geoJSON(feature, { style: styleFor }).addTo(terrLyr);
    layer.bindTooltip(t.label, { className:'owner-label', sticky:true });
  });
}

map.on('moveend',function(){
  if(window.ReactNativeWebView){
    var b=map.getBounds();
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'bounds',s:b.getSouth(),n:b.getNorth(),w:b.getWest(),e:b.getEast()}));
  }
});

function msg(d){
  if(d.type==='loc'){dot.setLatLng([d.lat,d.lng])}
  if(d.type==='me'){myIds=d.ids||[]}
  if(d.type==='terr'){draw(d.items)}
  if(d.type==='pan'){map.panTo([d.lat,d.lng],{animate:true})}
}
document.addEventListener('message',function(e){try{msg(JSON.parse(e.data))}catch(x){}});
window.addEventListener('message',function(e){try{msg(JSON.parse(e.data))}catch(x){}});

if(window.ReactNativeWebView){
  var b=map.getBounds();
  window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));
  window.ReactNativeWebView.postMessage(JSON.stringify({type:'bounds',s:b.getSouth(),n:b.getNorth(),w:b.getWest(),e:b.getEast()}));
}
<\/script>
</body>
</html>`;
};

// ─── React Native Component ─────────────────────────────────

export default function TerritoryMap({
  latitude,
  longitude,
  colors,
  trailColor,
  territories,
  highlightIds,
  mode = 'individual',
  onBoundsChanged,
}: TerritoryMapProps) {
  const webRef = useRef<WebView>(null);
  const isReady = useRef(false);
  const onBoundsRef = useRef(onBoundsChanged);
  onBoundsRef.current = onBoundsChanged;

  const isDark = colors === Colors.dark;

  // Built once per mount from whatever position/color we have at that
  // moment; every later update travels over the postMessage bridge below.
  // Baking live `latitude`/`longitude` into the HTML string would change the
  // WebView's `source.html` on every GPS tick, forcing react-native-webview
  // to fully reload the page — wiping the drawn territory polygons and the
  // user's pan/zoom each time instead of smoothly updating in place.
  const initialRef = useRef({ latitude, longitude, trailColor });
  const html = useMemo(
    () => buildHTML(initialRef.current.latitude, initialRef.current.longitude, isDark, initialRef.current.trailColor),
    [isDark],
  );

  const send = useCallback((msg: object) => {
    if (webRef.current && isReady.current) {
      webRef.current.postMessage(JSON.stringify(msg));
    }
  }, []);

  // Push user location
  useEffect(() => {
    send({ type: 'loc', lat: latitude, lng: longitude });
  }, [latitude, longitude, send]);

  // Push the ids to highlight as "mine" (so "mine" styling + sort-on-top works)
  useEffect(() => {
    send({ type: 'me', ids: highlightIds });
  }, [highlightIds, send]);

  // Push territory data
  const territoryItems = useMemo(
    () =>
      territories.map((t) => {
        const areaLabel =
          t.area_m2 >= 10000 ? `${(t.area_m2 / 1_000_000).toFixed(2)} km²` : `${Math.round(t.area_m2)} m²`;
        const label = t.username ? `${mode === 'group' ? t.username : '@' + t.username} · ${areaLabel}` : areaLabel;
        return { user_id: t.user_id, trail_color: t.trail_color, geojson: t.geojson, label };
      }),
    [territories, mode],
  );

  useEffect(() => {
    send({ type: 'terr', items: territoryItems });
  }, [territoryItems, send]);

  const handleMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const d = JSON.parse(event.nativeEvent.data);
        if (d.type === 'ready') {
          isReady.current = true;
          // Full resync: any 'loc'/'me'/'terr' sent before this point was
          // silently dropped (send() no-ops until isReady is true), so push
          // the latest of each now or the territory map can open empty.
          send({ type: 'loc', lat: latitude, lng: longitude });
          send({ type: 'me', ids: highlightIds });
          send({ type: 'terr', items: territoryItems });
        }
        if (d.type === 'bounds' && onBoundsRef.current) {
          onBoundsRef.current(d.s, d.n, d.w, d.e);
        }
      } catch {}
    },
    [latitude, longitude, highlightIds, territoryItems, send],
  );

  return (
    <View style={styles.container}>
      <WebView
        ref={webRef}
        source={{ html }}
        style={styles.webview}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        onMessage={handleMessage}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        cacheEnabled
        startInLoadingState={false}
        onShouldStartLoadWithRequest={(r) =>
          r.url.startsWith('about:') || r.url.startsWith('data:')
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
