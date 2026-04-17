import { useRef, useEffect, useCallback } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { Colors } from '@/constants/theme';

export interface RunningMapProps {
  latitude: number;
  longitude: number;
  colors: typeof Colors.light;
  route?: Array<{ latitude: number; longitude: number }>;
  isRunning?: boolean;
  trailColor?: string; // hex color for the route trail
}

const generateLeafletHTML = (lat: number, lng: number, isDark: boolean, trailColor: string) => {
  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
  
  const tileAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

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
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    #map { width: 100%; height: 100%; }
    .leaflet-control-attribution { font-size: 9px !important; }
    .pulse-marker {
      width: 16px; height: 16px;
      border-radius: 50%;
      background: ${trailColor};
      border: 3px solid #FDFDFC;
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
      border: 3px solid #FDFDFC;
    }
    .end-marker {
      width: 12px; height: 12px;
      border-radius: 50%;
      background: #F44336;
      border: 3px solid #FDFDFC;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var trailColor = '${trailColor}';
    
    // Initialize map
    var map = L.map('map', {
      center: [${lat}, ${lng}],
      zoom: 16,
      zoomControl: false,
      attributionControl: true
    });

    L.tileLayer('${tileUrl}', {
      attribution: '${tileAttribution}',
      maxZoom: 19,
      subdomains: 'abcd'
    }).addTo(map);

    // Current location marker
    var currentIcon = L.divIcon({
      className: 'pulse-marker',
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });

    var currentMarker = L.marker([${lat}, ${lng}], { icon: currentIcon }).addTo(map);

    // Route polyline – uses the user's chosen trail color
    var routeCoords = [];
    var routeLine = L.polyline([], {
      color: trailColor,
      weight: 5,
      opacity: 0.85,
      smoothFactor: 1,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(map);

    // Glow / shadow line behind the main trail for depth
    var glowLine = L.polyline([], {
      color: trailColor,
      weight: 10,
      opacity: 0.25,
      smoothFactor: 1,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(map);

    // Start marker (will be set when run starts)
    var startMarker = null;
    var startIcon = L.divIcon({
      className: 'start-marker',
      iconSize: [12, 12],
      iconAnchor: [6, 6]
    });

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

    // Function to update route
    function updateRoute(coords) {
      if (!coords || coords.length === 0) return;
      
      routeCoords = coords.map(function(c) { return [c.latitude, c.longitude]; });
      routeLine.setLatLngs(routeCoords);
      glowLine.setLatLngs(routeCoords);

      // Update start marker
      if (routeCoords.length > 0 && !startMarker) {
        startMarker = L.marker(routeCoords[0], { icon: startIcon }).addTo(map);
      }
    }

    // Function to change trail color dynamically
    function changeTrailColor(newColor) {
      trailColor = newColor;
      routeLine.setStyle({ color: newColor });
      glowLine.setStyle({ color: newColor });
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

      if (!running && routeCoords.length > 1) {
        // Add end marker
        if (endMarker) map.removeLayer(endMarker);
        endMarker = L.marker(routeCoords[routeCoords.length - 1], { icon: endIcon }).addTo(map);
        
        // Fit bounds to show entire route
        if (routeCoords.length > 1) {
          map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
        }
      }
    }

    // Function to reset map for new run
    function resetMap() {
      routeCoords = [];
      routeLine.setLatLngs([]);
      glowLine.setLatLngs([]);
      if (startMarker) { map.removeLayer(startMarker); startMarker = null; }
      if (endMarker) { map.removeLayer(endMarker); endMarker = null; }
      followUser = true;
    }

    // Listen for messages from React Native
    document.addEventListener('message', function(event) {
      try {
        var data = JSON.parse(event.data);
        switch(data.type) {
          case 'updateLocation':
            updateLocation(data.lat, data.lng);
            break;
          case 'updateRoute':
            updateRoute(data.coords);
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
      } catch(e) {}
    });

    // Also listen for window messages (Android compatibility)
    window.addEventListener('message', function(event) {
      try {
        var data = JSON.parse(event.data);
        switch(data.type) {
          case 'updateLocation':
            updateLocation(data.lat, data.lng);
            break;
          case 'updateRoute':
            updateRoute(data.coords);
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
      } catch(e) {}
    });

    // Signal ready
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
    }
  </script>
</body>
</html>`;
};

export default function RunningMap({ latitude, longitude, colors, route = [], isRunning = false, trailColor = '#5B7EA4' }: RunningMapProps) {
  const webViewRef = useRef<WebView>(null);
  const isReadyRef = useRef(false);
  const lastSentRouteLength = useRef(0);

  const isDark = colors === Colors.dark;

  const sendMessage = useCallback((data: object) => {
    if (webViewRef.current && isReadyRef.current) {
      webViewRef.current.postMessage(JSON.stringify(data));
    }
  }, []);

  // Update location when it changes
  useEffect(() => {
    sendMessage({ type: 'updateLocation', lat: latitude, lng: longitude });
  }, [latitude, longitude, sendMessage]);

  // Update route when new points are added
  useEffect(() => {
    if (route.length > lastSentRouteLength.current) {
      sendMessage({ type: 'updateRoute', coords: route });
      lastSentRouteLength.current = route.length;
    }
  }, [route, sendMessage]);

  // Update running state
  useEffect(() => {
    sendMessage({ type: 'setRunning', running: isRunning });
    if (!isRunning) {
      lastSentRouteLength.current = 0;
    }
  }, [isRunning, sendMessage]);

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
          sendMessage({ type: 'updateRoute', coords: route });
        }
        sendMessage({ type: 'setRunning', running: isRunning });
        sendMessage({ type: 'setTrailColor', color: trailColor });
      }
    } catch (e) {}
  }, [latitude, longitude, route, isRunning, trailColor, sendMessage]);

  const html = generateLeafletHTML(latitude, longitude, isDark, trailColor);

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
