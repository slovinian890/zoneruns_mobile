import { useRef, useEffect, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { AuroraColors, Colors } from '@/constants/theme';
import { latLngToHexCell, hexCellKey, HexCellId } from '@/services/territoryService';

export interface RunningMapProps {
  latitude: number;
  longitude: number;
  colors: typeof Colors.light;
  route?: { latitude: number; longitude: number }[];
  isRunning?: boolean;
  trailColor?: string; // hex color for the route trail
}

const generateLeafletHTML = (lat: number, lng: number, isDark: boolean, trailColor: string) => {
  // Free, keyless, unlimited vector tiles (no API key, no rate limit) via MapLibre GL,
  // rendered as a Leaflet layer through the maplibre-gl-leaflet plugin. Dark mode is a
  // real OpenFreeMap style now, not a CSS filter over raster tiles.
  const styleUrl = isDark
    ? 'https://tiles.openfreemap.org/styles/dark'
    : 'https://tiles.openfreemap.org/styles/positron';

  // Convert hex to rgb for animations
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
      : '91, 126, 164';
  };
  const trailRgb = hexToRgb(trailColor);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
  <script src="https://unpkg.com/@maplibre/maplibre-gl-leaflet@0.1.4/leaflet-maplibre-gl.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    #map { width: 100%; height: 100%; background: ${AuroraColors.mapBase}; }
    .leaflet-control-attribution { font-size: 9px !important; }
    .pulse-marker {
      width: 16px; height: 16px;
      border-radius: 50%;
      background: ${trailColor};
      border: 3px solid ${AuroraColors.text};
      box-shadow: 0 0 0 rgba(${trailRgb}, 0.4);
      animation: pulse 2s infinite;
    }
    .pulse-marker.running {
      background: ${trailColor};
      box-shadow: 0 0 0 rgba(${trailRgb}, 0.4);
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(${trailRgb}, 0.5); }
      70% { box-shadow: 0 0 0 12px rgba(${trailRgb}, 0); }
      100% { box-shadow: 0 0 0 0 rgba(${trailRgb}, 0); }
    }
    .start-marker {
      width: 12px; height: 12px;
      border-radius: 50%;
      background: #4CAF50;
      border: 3px solid ${AuroraColors.text};
    }
    .end-marker {
      width: 12px; height: 12px;
      border-radius: 50%;
      background: #F44336;
      border: 3px solid ${AuroraColors.text};
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var trailColor = '${trailColor}';
    var HEX_SIZE_M = 43.2; // mirrors hex_size_m() in supabase/migrations
    var EARTH_R = 6378137;

    // Initialize map
    var map = L.map('map', {
      center: [${lat}, ${lng}],
      zoom: 16,
      zoomControl: false,
      attributionControl: true
    });

    L.maplibreGL({
      style: '${styleUrl}',
      attribution: '&copy; <a href="https://openfreemap.org">OpenFreeMap</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Current location marker
    var currentIcon = L.divIcon({
      className: 'pulse-marker',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });

    var currentMarker = L.marker([${lat}, ${lng}], { icon: currentIcon }).addTo(map);

    // The trail is drawn as the hexagons the runner has actually crossed,
    // not a line dragged behind them — see addHexes(). hexPolys/drawnHexKeys
    // track what's already on the map so repeated ticks over the same hex
    // (GPS fires every ~2m, a hex is ~43m wide) are cheap no-ops.
    var hexLayer = L.featureGroup().addTo(map);
    var drawnHexKeys = {};
    var hexPolys = [];

    function mercToLatLng(x, y) {
      var lng = (x / EARTH_R) * 180 / Math.PI;
      var lat = (2 * Math.atan(Math.exp(y / EARTH_R)) - Math.PI / 2) * 180 / Math.PI;
      return [lat, lng];
    }

    // Mirrors hex_polygon(col, row) (supabase/migrations) — six corners of
    // the flat-top hex cell, in lat/lng.
    function hexCellLatLngs(col, row) {
      var r = HEX_SIZE_M;
      var cx = col * 1.5 * r;
      var cy = (Math.sqrt(3) * col / 2 + Math.sqrt(3) * row) * r;
      var pts = [];
      for (var i = 0; i <= 6; i++) {
        var ang = (Math.PI / 180) * (60 * (i % 6));
        pts.push(mercToLatLng(cx + r * Math.cos(ang), cy + r * Math.sin(ang)));
      }
      return pts;
    }

    function addHexes(cells) {
      if (!cells) return;
      for (var i = 0; i < cells.length; i++) {
        var c = cells[i];
        var key = c.col + ',' + c.row;
        if (drawnHexKeys[key]) continue;
        drawnHexKeys[key] = true;
        var poly = L.polygon(hexCellLatLngs(c.col, c.row), {
          color: trailColor,
          weight: 1,
          opacity: 0.9,
          fillColor: trailColor,
          fillOpacity: 0.45
        }).addTo(hexLayer);
        hexPolys.push(poly);
      }
    }

    // Start marker — set explicitly from the run's first GPS point rather
    // than inferred from a hex (a hex's cell center isn't the exact start
    // coordinate).
    var startMarker = null;
    var startIcon = L.divIcon({
      className: 'start-marker',
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });

    function setStart(lat, lng) {
      if (startMarker) map.removeLayer(startMarker);
      startMarker = L.marker([lat, lng], { icon: startIcon }).addTo(map);
    }

    // End marker
    var endMarker = null;
    var endIcon = L.divIcon({
      className: 'end-marker',
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });

    var isRunning = false;
    var followUser = true;

    // Handle map drag to disable auto-follow
    map.on('dragstart', function() {
      followUser = false;
    });

    // Re-enable follow after 5 seconds
    var followTimeout = null;
    map.on('dragend', function() {
      if (followTimeout) clearTimeout(followTimeout);
      followTimeout = setTimeout(function() {
        if (isRunning) followUser = true;
      }, 5000);
    });

    // Function to update location from React Native
    function updateLocation(lat, lng) {
      var latlng = L.latLng(lat, lng);
      currentMarker.setLatLng(latlng);

      if (followUser) {
        map.panTo(latlng, { animate: true, duration: 0.5 });
      }
    }

    // Function to change trail color dynamically
    function changeTrailColor(newColor) {
      trailColor = newColor;
      for (var i = 0; i < hexPolys.length; i++) {
        hexPolys[i].setStyle({ color: newColor, fillColor: newColor });
      }
    }

    // Function to set running state
    function setRunning(running) {
      isRunning = running;
      followUser = running;

      var el = currentMarker.getElement();
      if (el) {
        var div = el.querySelector('.pulse-marker') || el;
        if (running) {
          div.classList.add('running');
        } else {
          div.classList.remove('running');
        }
      }

      if (!running) {
        // Add end marker at the last known position
        if (endMarker) map.removeLayer(endMarker);
        endMarker = L.marker(currentMarker.getLatLng(), { icon: endIcon }).addTo(map);

        // Fit bounds to show every claimed hex
        try {
          var b = hexLayer.getBounds();
          if (b.isValid()) map.fitBounds(b, { padding: [40, 40] });
        } catch (e) {}
      }
    }

    // Function to reset map for new run
    function resetMap() {
      hexLayer.clearLayers();
      hexPolys = [];
      drawnHexKeys = {};
      if (startMarker) { map.removeLayer(startMarker); startMarker = null; }
      if (endMarker) { map.removeLayer(endMarker); endMarker = null; }
      followUser = true;
    }

    // Listen for messages from React Native
    function handleBridgeMessage(data) {
      switch(data.type) {
        case 'updateLocation':
          updateLocation(data.lat, data.lng);
          break;
        case 'addHexes':
          addHexes(data.cells);
          break;
        case 'setStart':
          setStart(data.lat, data.lng);
          break;
        case 'setRunning':
          setRunning(data.running);
          break;
        case 'reset':
          resetMap();
          break;
        case 'setTrailColor':
          changeTrailColor(data.color);
          break;
      }
    }

    document.addEventListener('message', function(event) {
      try { handleBridgeMessage(JSON.parse(event.data)); } catch(e) {}
    });

    // Also listen for window messages (Android compatibility)
    window.addEventListener('message', function(event) {
      try { handleBridgeMessage(JSON.parse(event.data)); } catch(e) {}
    });

    // Signal ready
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
    }
  </script>
</body>
</html>`;
};

export default function RunningMap({ latitude, longitude, colors, route = [], isRunning = false, trailColor = '#4FC3F7' }: RunningMapProps) {
  const webViewRef = useRef<WebView>(null);
  const isReadyRef = useRef(false);
  const wasRunningRef = useRef(isRunning);

  // Every GPS point gets converted to the hex cell it falls in; only the
  // genuinely-new cells (a hex is ~43m wide, GPS fires every ~2m) are ever
  // sent across the bridge. visitedHexList keeps insertion order so a late
  // 'ready' can resync the WebView with everything crossed so far.
  const visitedHexKeysRef = useRef<Set<string>>(new Set());
  const visitedHexListRef = useRef<HexCellId[]>([]);
  const lastProcessedIndexRef = useRef(0);

  const isDark = colors === Colors.dark;

  const sendMessage = useCallback((data: object) => {
    if (webViewRef.current && isReadyRef.current) {
      webViewRef.current.postMessage(JSON.stringify(data));
    }
  }, []);

  // The page is built once per mount from whatever position/color we have at
  // that moment; every update after that travels over the postMessage bridge
  // below. Baking live `latitude`/`longitude` into the HTML string would
  // change the WebView's `source.html` on every GPS tick, and changing
  // `source` forces react-native-webview to fully reload the page — wiping
  // the Leaflet map (and the hex trail drawn on it) several times a second
  // while running, which is why the trace never used to actually show up.
  const initialRef = useRef({ latitude, longitude, trailColor });
  const html = useMemo(
    () =>
      generateLeafletHTML(initialRef.current.latitude, initialRef.current.longitude, isDark, initialRef.current.trailColor),
    [isDark],
  );

  // Location, newly-crossed hexes, and running-state all land in one effect
  // so they're applied in a deterministic order: a freshly started run
  // clears the previous run's trail/markers before the new one streams in.
  useEffect(() => {
    const justStarted = isRunning && !wasRunningRef.current;
    wasRunningRef.current = isRunning;

    if (justStarted) {
      sendMessage({ type: 'reset' });
      visitedHexKeysRef.current = new Set();
      visitedHexListRef.current = [];
      lastProcessedIndexRef.current = 0;
      const start = route[0] ?? { latitude, longitude };
      sendMessage({ type: 'setStart', lat: start.latitude, lng: start.longitude });
    }

    sendMessage({ type: 'updateLocation', lat: latitude, lng: longitude });

    if (route.length > lastProcessedIndexRef.current) {
      const newCells: HexCellId[] = [];
      for (let i = lastProcessedIndexRef.current; i < route.length; i++) {
        const cell = latLngToHexCell(route[i].latitude, route[i].longitude);
        const key = hexCellKey(cell);
        if (!visitedHexKeysRef.current.has(key)) {
          visitedHexKeysRef.current.add(key);
          visitedHexListRef.current.push(cell);
          newCells.push(cell);
        }
      }
      lastProcessedIndexRef.current = route.length;
      if (newCells.length > 0) {
        sendMessage({ type: 'addHexes', cells: newCells });
      }
    }

    sendMessage({ type: 'setRunning', running: isRunning });
    if (!isRunning) {
      lastProcessedIndexRef.current = 0;
    }
  }, [latitude, longitude, route, isRunning, sendMessage]);

  // Update trail color dynamically when it changes
  useEffect(() => {
    sendMessage({ type: 'setTrailColor', color: trailColor });
  }, [trailColor, sendMessage]);

  const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'ready') {
        isReadyRef.current = true;
        // Send initial state
        sendMessage({ type: 'updateLocation', lat: latitude, lng: longitude });
        if (route.length > 0) {
          sendMessage({ type: 'setStart', lat: route[0].latitude, lng: route[0].longitude });
        }
        if (visitedHexListRef.current.length > 0) {
          sendMessage({ type: 'addHexes', cells: visitedHexListRef.current });
        }
        sendMessage({ type: 'setRunning', running: isRunning });
        sendMessage({ type: 'setTrailColor', color: trailColor });
      }
    } catch (e) {
      console.error('Error handling WebView message:', e);
    }
  }, [latitude, longitude, route, isRunning, trailColor, sendMessage]);

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html }}
        style={styles.webview}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        onMessage={handleMessage}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        cacheEnabled={true}
        startInLoadingState={false}
        // Prevent navigation away from the map
        onShouldStartLoadWithRequest={(request) => {
          return request.url.startsWith('about:') || request.url.startsWith('data:');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
