/**
 * Territory Map – Leaflet + WebView hex-grid overlay for the Compete feature.
 *
 * Renders a full-screen map covered with flat-top hexagons:
 *  • User's claimed tiles → user's trailColor
 *  • Followed users' tiles → their colour
 *  • Unclaimed tiles → semi-transparent grey
 *
 * Hex math runs entirely inside the WebView JS for speed.
 * Ownership data is pushed from React Native after each Supabase fetch.
 */

import { useRef, useEffect, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Colors } from '@/constants/theme';
import { HexTerritory } from '@/services/territoryService';

export interface TerritoryMapProps {
  latitude: number;
  longitude: number;
  colors: typeof Colors.light;
  trailColor: string;
  /** Claimed hexes in the visible area (from Supabase) */
  territories: HexTerritory[];
  /** Current user ID */
  userId: string;
  /** Called when the user pans/zooms so parent can fetch territories for new bounds */
  onBoundsChanged?: (minLat: number, maxLat: number, minLng: number, maxLng: number) => void;
}

// ─── Leaflet HTML Builder ───────────────────────────────────

const buildHTML = (lat: number, lng: number, isDark: boolean, trailColor: string) => {
  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

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
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden}
#map{width:100%;height:100%}
.leaflet-control-attribution{font-size:9px!important}
.dot{width:18px;height:18px;border-radius:50%;background:${trailColor};border:3px solid #FDFDFC;box-shadow:0 0 0 rgba(${rgb},.4);animation:p 2s infinite}
@keyframes p{0%{box-shadow:0 0 0 0 rgba(${rgb},.5)}70%{box-shadow:0 0 0 14px rgba(${rgb},0)}100%{box-shadow:0 0 0 0 rgba(${rgb},0)}}
</style>
</head>
<body>
<div id="map"></div>
<script>
var HS=0.00045, S3=Math.sqrt(3);

var map=L.map('map',{center:[${lat},${lng}],zoom:16,zoomControl:false,renderer:L.canvas({padding:0.5})});
L.tileLayer('${tileUrl}',{attribution:'&copy; OSM &copy; CARTO',maxZoom:19,subdomains:'abcd'}).addTo(map);

var dotIcon=L.divIcon({className:'dot',iconSize:[18,18],iconAnchor:[9,9]});
var dot=L.marker([${lat},${lng}],{icon:dotIcon}).addTo(map);

var hexLyr=L.layerGroup().addTo(map);
var terr={};

function hc(q,r){var o=Math.abs(q%2)===1;return[r*S3*HS+(o?S3/2*HS:0),q*1.5*HS]}
function hv(la,ln){var v=[];for(var i=0;i<6;i++){var a=Math.PI/180*(60*i);v.push([la+HS*Math.sin(a),ln+HS*Math.cos(a)])}return v}

function draw(){
  hexLyr.clearLayers();
  if(map.getZoom()<14)return;
  var b=map.getBounds();
  var s=b.getSouth(),n=b.getNorth(),w=b.getWest(),e=b.getEast();
  var q0=Math.floor(w/(1.5*HS))-1,q1=Math.ceil(e/(1.5*HS))+1;
  var r0=Math.floor(s/(S3*HS))-2,r1=Math.ceil(n/(S3*HS))+2;
  for(var q=q0;q<=q1;q++){for(var r=r0;r<=r1;r++){
    var c=hc(q,r);
    if(c[0]<s-HS||c[0]>n+HS||c[1]<w-HS||c[1]>e+HS)continue;
    var id=q+'_'+r, own=terr[id];
    var col=own?own.c:'#888888';
    hexLyr.addLayer(L.polygon(hv(c[0],c[1]),{
      color:col,fillColor:col,
      fillOpacity:own?0.42:0.06,
      weight:own?1.5:0.5,
      opacity:own?0.6:0.12,
      interactive:false
    }));
  }}
}

map.on('moveend',function(){
  draw();
  if(window.ReactNativeWebView){
    var b=map.getBounds();
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'bounds',s:b.getSouth(),n:b.getNorth(),w:b.getWest(),e:b.getEast()}));
  }
});

function msg(d){
  if(d.type==='loc'){dot.setLatLng([d.lat,d.lng])}
  if(d.type==='terr'){terr={};if(d.items)d.items.forEach(function(t){terr[t.hex_id]={c:t.trail_color,u:t.user_id}});draw()}
  if(d.type==='pan'){map.panTo([d.lat,d.lng],{animate:true})}
}
document.addEventListener('message',function(e){try{msg(JSON.parse(e.data))}catch(x){}});
window.addEventListener('message',function(e){try{msg(JSON.parse(e.data))}catch(x){}});

draw();
if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));
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
  userId,
  onBoundsChanged,
}: TerritoryMapProps) {
  const webRef = useRef<WebView>(null);
  const isReady = useRef(false);
  const onBoundsRef = useRef(onBoundsChanged);
  onBoundsRef.current = onBoundsChanged;

  const isDark = colors === Colors.dark;

  const send = useCallback((msg: object) => {
    if (webRef.current && isReady.current) {
      webRef.current.postMessage(JSON.stringify(msg));
    }
  }, []);

  // Push user location
  useEffect(() => {
    send({ type: 'loc', lat: latitude, lng: longitude });
  }, [latitude, longitude, send]);

  // Push territory data
  useEffect(() => {
    send({ type: 'terr', items: territories });
  }, [territories, send]);

  const handleMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const d = JSON.parse(event.nativeEvent.data);
        if (d.type === 'ready') {
          isReady.current = true;
          send({ type: 'loc', lat: latitude, lng: longitude });
          send({ type: 'terr', items: territories });
        }
        if (d.type === 'bounds' && onBoundsRef.current) {
          onBoundsRef.current(d.s, d.n, d.w, d.e);
        }
      } catch {}
    },
    [latitude, longitude, territories, send],
  );

  const html = buildHTML(latitude, longitude, isDark, trailColor);

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
