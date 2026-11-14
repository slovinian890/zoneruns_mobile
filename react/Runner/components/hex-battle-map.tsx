/**
 * Hex Battle Map – the tappable individual-hex view of the Compete screen.
 *
 * Unlike territory-map.tsx (which draws each runner's territory as one big
 * unioned polygon, read-only), this renders the *actual* hex grid from
 * get_hexes_in_bounds — every cell, claimed or neutral, with its owner,
 * defense level and bounty total — and reports taps back so the parent can
 * open the fortify/bounty action sheet. A hex can be owned by an individual
 * OR a clan (never both, see migrations/017_clan_hex_warfare.sql) — clan
 * hexes render in the clan's color with a dashed outline instead of the
 * owner's trail color, and "mine" highlighting follows whichever side
 * (your active clan, or yourself) the viewer is currently playing as.
 */

import { useRef, useEffect, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { AuroraColors, Colors } from '@/constants/theme';
import { HexCell, TerritoryGeoJSON } from '@/services/supabase';
import { HexCellId, hexCellKey } from '@/services/territoryService';

export interface HexBattleMapProps {
  latitude: number;
  longitude: number;
  colors: typeof Colors.light;
  myUserId: string;
  /** The clan the viewer currently represents, if any — drives "mine" highlighting for clan hexes. */
  myGroupId: string | null;
  cells: HexCell[];
  /** Hexes currently queued for a multi-hex bounty placement — drawn with a bright dashed outline. */
  selected: HexCellId[];
  onBoundsChanged?: (minLat: number, maxLat: number, minLng: number, maxLng: number) => void;
  onHexTap: (cell: HexCell) => void;
}

interface CellFeatureProps {
  key: string;
  col: number;
  row: number;
  userId: string | null;
  /** Already resolved to the clan's color when the hex is clan-owned, else the owner's trail color. */
  trailColor: string;
  groupId: string | null;
  level: number | null;
  maxLevel: number | null;
  bountyTotal: number;
}

const buildHTML = (lat: number, lng: number, isDark: boolean) => {
  const styleUrl = isDark
    ? 'https://tiles.openfreemap.org/styles/dark'
    : 'https://tiles.openfreemap.org/styles/positron';

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
.dot{width:18px;height:18px;border-radius:50%;background:${AuroraColors.primary};border:3px solid ${AuroraColors.text};animation:p 2s infinite}
@keyframes p{0%{box-shadow:0 0 0 0 rgba(201,213,74,.5)}70%{box-shadow:0 0 0 14px rgba(201,213,74,0)}100%{box-shadow:0 0 0 0 rgba(201,213,74,0)}}
.bounty-label{background:rgba(232,194,60,.92);color:#12160A;font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px;border:none;box-shadow:none;white-space:nowrap}
.bounty-label:before{display:none}
.level-label{background:transparent;color:#fff;font-size:13px;font-weight:800;text-shadow:0 0 3px #000,0 0 4px #000;border:none;box-shadow:none;padding:0}
.level-label:before{display:none}
</style>
</head>
<body>
<div id="map"></div>
<script>
var MINE_COLOR = '${AuroraColors.primary}';
// Hexes only read their defense-level number once zoomed in enough for the
// text to be legible inside one ~43m cell.
var LEVEL_LABEL_ZOOM = 18;
var map=L.map('map',{center:[${lat},${lng}],zoom:16,zoomControl:false,renderer:L.canvas({padding:0.5})});
L.maplibreGL({style:'${styleUrl}',attribution:'&copy; OpenFreeMap &copy; OpenStreetMap contributors'}).addTo(map);

var dotIcon=L.divIcon({className:'dot',iconSize:[18,18],iconAnchor:[9,9]});
var dot=L.marker([${lat},${lng}],{icon:dotIcon}).addTo(map);

var hexLayer=L.layerGroup().addTo(map);
var myIds=[];
var myGroupId=null;
var selectedSet={};
var layersByKey={};
var propsByKey={};
var currentZoom=map.getZoom();

// Mirrors territoryService.ts's isHexAlly() — "is this mine to heal" from
// whichever side (active clan, or myself) I'm currently playing as.
function isAlly(p){
  if(!p.userId) return false;
  if(myGroupId && p.groupId) return p.groupId === myGroupId;
  if(!myGroupId && !p.groupId) return myIds.indexOf(p.userId)!==-1;
  if(myGroupId && !p.groupId) return myIds.indexOf(p.userId)!==-1;
  return false;
}

function styleForCell(p){
  if(selectedSet[p.key]){
    return{color:'#FFFFFF',weight:3,opacity:1,dashArray:'4,3',fillColor:p.trailColor,fillOpacity:p.userId?0.5:0.2};
  }
  if(!p.userId){
    return{color:'rgba(255,255,255,0.22)',weight:1,opacity:0.4,fillColor:'#6B7280',fillOpacity:0.10};
  }
  // Darker fill = higher defense level (1..10) — strength reads at a glance
  // without tapping every hex. Spans nearly transparent to almost opaque
  // across the full 10-level range.
  var lvl=p.level||1, maxLvl=p.maxLevel||2;
  var fillOp=0.18+0.70*((lvl-1)/9);
  var mine=isAlly(p);
  return{
    color: mine ? MINE_COLOR : p.trailColor,
    weight: mine ? 2.5 : (1+(maxLvl-1)*0.3),
    opacity: mine ? 0.95 : 0.6,
    fillColor: p.trailColor,
    fillOpacity: fillOp,
    dashArray: p.groupId ? '5,3' : null
  };
}

// A bounty label takes priority (rarer, more urgent to notice); otherwise,
// once zoomed in past LEVEL_LABEL_ZOOM, show the hex's numeric defense
// level instead. Never both at once on the same hex.
function tooltipContent(p){
  if(p.bountyTotal > 0) return '\\u{1F4B0} ' + p.bountyTotal;
  if(p.userId && currentZoom >= LEVEL_LABEL_ZOOM) return String(p.level||1);
  return null;
}

function updateTooltip(layer, p){
  var content = tooltipContent(p);
  if(content == null){
    if(layer.getTooltip()) layer.unbindTooltip();
    return;
  }
  var className = p.bountyTotal > 0 ? 'bounty-label' : 'level-label';
  var existing = layer.getTooltip();
  if(!existing || existing.getContent() !== content || layer._labelClass !== className){
    if(existing) layer.unbindTooltip();
    layer.bindTooltip(content, { className: className, permanent:true, direction:'center' });
    layer._labelClass = className;
  }
}

function onEachCellFeature(feature, layer){
  var p = feature.properties;
  layersByKey[p.key] = layer;
  propsByKey[p.key] = p;
  layer.on('click', function(){
    if(window.ReactNativeWebView){
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'hexTap', col:p.col, row:p.row}));
    }
  });
  updateTooltip(layer, p);
}

function draw(fc){
  hexLayer.clearLayers();
  layersByKey = {};
  propsByKey = {};
  if(!fc || !fc.features) return;
  L.geoJSON(fc, {
    style: function(feature){ return styleForCell(feature.properties); },
    onEachFeature: onEachCellFeature
  }).addTo(hexLayer);
}

function redrawStyles(){
  for(var key in propsByKey){
    if(!propsByKey.hasOwnProperty(key)) continue;
    var layer = layersByKey[key];
    if(layer) layer.setStyle(styleForCell(propsByKey[key]));
  }
}

function refreshTooltips(){
  for(var key in propsByKey){
    if(!propsByKey.hasOwnProperty(key)) continue;
    var layer = layersByKey[key];
    if(layer) updateTooltip(layer, propsByKey[key]);
  }
}

map.on('zoomend',function(){
  currentZoom = map.getZoom();
  refreshTooltips();
});

map.on('moveend',function(){
  if(window.ReactNativeWebView){
    var b=map.getBounds();
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'bounds',s:b.getSouth(),n:b.getNorth(),w:b.getWest(),e:b.getEast()}));
  }
});

function msg(d){
  if(d.type==='loc'){dot.setLatLng([d.lat,d.lng])}
  if(d.type==='me'){myIds=d.ids||[]; myGroupId=d.groupId||null; redrawStyles();}
  if(d.type==='cells'){draw(d.fc)}
  if(d.type==='selected'){
    selectedSet={};
    (d.keys||[]).forEach(function(k){selectedSet[k]=true;});
    redrawStyles();
  }
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

export default function HexBattleMap({
  latitude,
  longitude,
  colors,
  myUserId,
  myGroupId,
  cells,
  selected,
  onBoundsChanged,
  onHexTap,
}: HexBattleMapProps) {
  const webRef = useRef<WebView>(null);
  const isReady = useRef(false);
  const onBoundsRef = useRef(onBoundsChanged);
  onBoundsRef.current = onBoundsChanged;
  const onHexTapRef = useRef(onHexTap);
  onHexTapRef.current = onHexTap;

  const isDark = colors === Colors.dark;

  // Built once per mount; every later update travels over the postMessage
  // bridge (see running-map.tsx / territory-map.tsx for why — baking live
  // values into `source.html` forces a full WebView reload on every change).
  const initialRef = useRef({ latitude, longitude });
  const html = useMemo(() => buildHTML(initialRef.current.latitude, initialRef.current.longitude, isDark), [isDark]);

  const send = useCallback((msg: object) => {
    if (webRef.current && isReady.current) {
      webRef.current.postMessage(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    send({ type: 'loc', lat: latitude, lng: longitude });
  }, [latitude, longitude, send]);

  useEffect(() => {
    send({ type: 'me', ids: myUserId ? [myUserId] : [], groupId: myGroupId });
  }, [myUserId, myGroupId, send]);

  const cellsByKey = useMemo(() => {
    const map = new Map<string, HexCell>();
    cells.forEach((c) => map.set(`${c.hexCol},${c.hexRow}`, c));
    return map;
  }, [cells]);

  const featureCollection = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: cells.map((c) => ({
        type: 'Feature',
        properties: {
          key: `${c.hexCol},${c.hexRow}`,
          col: c.hexCol,
          row: c.hexRow,
          userId: c.userId,
          trailColor: (c.ownerGroupId ? c.groupColor : c.trailColor) || '#6B7280',
          groupId: c.ownerGroupId,
          level: c.level,
          maxLevel: c.maxLevel,
          bountyTotal: c.bountyTotal,
        } as CellFeatureProps,
        geometry: c.geojson as TerritoryGeoJSON,
      })),
    }),
    [cells],
  );

  useEffect(() => {
    send({ type: 'cells', fc: featureCollection });
  }, [featureCollection, send]);

  const selectedKeys = useMemo(() => selected.map(hexCellKey), [selected]);
  useEffect(() => {
    send({ type: 'selected', keys: selectedKeys });
  }, [selectedKeys, send]);

  const handleMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const d = JSON.parse(event.nativeEvent.data);
        if (d.type === 'ready') {
          isReady.current = true;
          send({ type: 'loc', lat: latitude, lng: longitude });
          send({ type: 'me', ids: myUserId ? [myUserId] : [], groupId: myGroupId });
          send({ type: 'cells', fc: featureCollection });
          send({ type: 'selected', keys: selectedKeys });
        }
        if (d.type === 'bounds' && onBoundsRef.current) {
          onBoundsRef.current(d.s, d.n, d.w, d.e);
        }
        if (d.type === 'hexTap') {
          const cell = cellsByKey.get(`${d.col},${d.row}`);
          if (cell) onHexTapRef.current(cell);
        }
      } catch {}
    },
    [latitude, longitude, myUserId, myGroupId, featureCollection, selectedKeys, cellsByKey, send],
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
        onShouldStartLoadWithRequest={(r) => r.url.startsWith('about:') || r.url.startsWith('data:')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
