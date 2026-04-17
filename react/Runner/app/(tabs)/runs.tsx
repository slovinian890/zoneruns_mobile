import { StyleSheet, View, TouchableOpacity, FlatList, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import { WebView } from 'react-native-webview';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius, CleanPaceColors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useFocusEffect } from 'expo-router';
import { getUserRuns, intervalToSeconds, deleteRun } from '@/services/runsService';
import { Run, RouteData } from '@/services/supabase';

import { DEFAULT_TRAIL_COLOR } from '@/services/trailColorService';

// Generira mini Leaflet zemljevid s prikazom poti teka
const generirajPredogledPotiHTML = (podatkiPoti: RouteData, jeTema: boolean): string => {
  const koordinate = podatkiPoti.coordinates || [];
  if (koordinate.length === 0) return '';

  const barvaLinije = podatkiPoti.trailColor || DEFAULT_TRAIL_COLOR;

  const urlPlosice = jeTema
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

  const koordinateJSON = JSON.stringify(koordinate.map(k => [k.latitude, k.longitude]));

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    #map { width: 100%; height: 100%; }
    .leaflet-control-attribution { display: none !important; }
    .leaflet-control-zoom { display: none !important; }
    .start-dot { width: 8px; height: 8px; border-radius: 50%; background: #4CAF50; border: 2px solid #fff; }
    .end-dot { width: 8px; height: 8px; border-radius: 50%; background: #F44336; border: 2px solid #fff; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var coords = ${koordinateJSON};
    var map = L.map('map', {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
      keyboard: false
    });

    L.tileLayer('${urlPlosice}', { maxZoom: 19, subdomains: 'abcd' }).addTo(map);

    if (coords.length > 0) {
      L.polyline(coords, { color: '${barvaLinije}', weight: 8, opacity: 0.2 }).addTo(map);
      var line = L.polyline(coords, { color: '${barvaLinije}', weight: 4, opacity: 0.9 }).addTo(map);
      
      var startIcon = L.divIcon({ className: 'start-dot', iconSize: [8,8], iconAnchor: [4,4] });
      var endIcon = L.divIcon({ className: 'end-dot', iconSize: [8,8], iconAnchor: [4,4] });
      
      L.marker(coords[0], { icon: startIcon }).addTo(map);
      L.marker(coords[coords.length-1], { icon: endIcon }).addTo(map);
      
      map.fitBounds(line.getBounds(), { padding: [15, 15] });
    }
  </script>
</body>
</html>`;
};

export default function RunsScreen() {
  const barvnaShema = useColorScheme();
  const barve = Colors[barvnaShema ?? 'light'];
  const jeTema = barvnaShema === 'dark';
  const [teki, setTeki] = useState<Run[]>([]);
  const [nalaganje, setNalaganje] = useState(true);
  const [osvezevanje, setOsvezevanje] = useState(false);

  useFocusEffect(
    useCallback(() => {
      naloziTeke();
    }, [])
  );

  const naloziTeke = async () => {
    try {
      const rezultat = await getUserRuns();
      setTeki(rezultat.data);
    } catch (napaka) {
      console.error('Napaka pri nalaganju tekov:', napaka);
    } finally {
      setNalaganje(false);
      setOsvezevanje(false);
    }
  };

  const osveziPodatke = () => {
    setOsvezevanje(true);
    naloziTeke();
  };

  const izbrisiTek = async (tekId: string) => {
    const rezultat = await deleteRun(tekId);
    if (rezultat.success) {
      setTeki((prej) => prej.filter((t) => t.id !== tekId));
    }
  };

  const oblikujTrajanje = (interval: string | null): string => {
    if (!interval) return '0:00';
    const sekunde = intervalToSeconds(interval);
    const ure = Math.floor(sekunde / 3600);
    const minute = Math.floor((sekunde % 3600) / 60);
    const sek = sekunde % 60;
    if (ure > 0) {
      return `${ure}:${minute.toString().padStart(2, '0')}:${sek.toString().padStart(2, '0')}`;
    }
    return `${minute}:${sek.toString().padStart(2, '0')}`;
  };

  const izrisiPredogledPoti = (podatkiPoti: RouteData | null) => {
    if (!podatkiPoti || !podatkiPoti.coordinates || podatkiPoti.coordinates.length < 2) {
      return null;
    }

    const html = generirajPredogledPotiHTML(podatkiPoti, jeTema);
    if (!html) return null;

    return (
      <View style={styles.routePreview}>
        <WebView
          source={{ html }}
          style={styles.routeWebView}
          scrollEnabled={false}
          originWhitelist={['*']}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          cacheEnabled={true}
          onShouldStartLoadWithRequest={(zahteva) => {
            return zahteva.url.startsWith('about:') || zahteva.url.startsWith('data:');
          }}
        />
      </View>
    );
  };

  const izrisiTek = ({ item }: { item: Run }) => (
    <View
      style={[
        styles.runCard,
        {
          backgroundColor: jeTema ? barve.card : barve.background,
          borderWidth: 1,
          borderColor: barve.border,
        },
      ]}>
      {/* Glava: datum & brisanje */}
      <View style={styles.runHeader}>
        <View style={{ flex: 1 }}>
          <ThemedText type="bodyBold">
            {item.title ||
              new Date(item.run_date).toLocaleDateString('sl-SI', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
          </ThemedText>
          <ThemedText type="caption" variant="muted">
            {item.run_time ||
              new Date(item.created_at).toLocaleTimeString('sl-SI', {
                hour: '2-digit',
                minute: '2-digit',
              })}
          </ThemedText>
        </View>
        <TouchableOpacity
          onPress={() =>
            require('react-native').Alert.alert('Izbriši tek', 'Ste prepričani?', [
              { text: 'Prekliči', style: 'cancel' },
              { text: 'Izbriši', style: 'destructive', onPress: () => izbrisiTek(item.id) },
            ])
          }
          style={styles.deleteButton}>
          <IconSymbol name="trash" size={16} color={barve.icon} />
        </TouchableOpacity>
      </View>

      {/* Mini zemljevid poti */}
      {izrisiPredogledPoti(item.route_data)}

      {/* Vrstica statistike */}
      <View style={styles.runStats}>
        <View style={styles.statItem}>
          <ThemedText type="h3" variant="primary">
            {Number(item.distance_km).toFixed(2)}
          </ThemedText>
          <ThemedText type="caption" variant="muted">
            km
          </ThemedText>
        </View>
        <View style={[styles.statDivider, { backgroundColor: barve.border }]} />
        <View style={styles.statItem}>
          <ThemedText type="h3" variant="primary">
            {oblikujTrajanje(item.duration)}
          </ThemedText>
          <ThemedText type="caption" variant="muted">
            čas
          </ThemedText>
        </View>
        <View style={[styles.statDivider, { backgroundColor: barve.border }]} />
        <View style={styles.statItem}>
          <ThemedText type="h3" variant="primary">
            {item.pace ?? '0:00'}
          </ThemedText>
          <ThemedText type="caption" variant="muted">
            tempo/km
          </ThemedText>
        </View>
      </View>

      {/* Dodatne informacije */}
      {(item.calories > 0 || item.elevation_m > 0) && (
        <View style={styles.extraStats}>
          {item.calories > 0 && (
            <View style={styles.extraStatItem}>
              <IconSymbol name="flame.fill" size={14} color={barve.primary} />
              <ThemedText type="caption" variant="muted">
                {item.calories} kal
              </ThemedText>
            </View>
          )}
          {item.elevation_m > 0 && (
            <View style={styles.extraStatItem}>
              <IconSymbol name="arrow.up.right" size={14} color={barve.primary} />
              <ThemedText type="caption" variant="muted">
                {item.elevation_m}m višina
              </ThemedText>
            </View>
          )}
        </View>
      )}

      {item.notes && (
        <ThemedText type="bodySmall" variant="muted" style={styles.notes}>
          {item.notes}
        </ThemedText>
      )}
    </View>
  );

  if (nalaganje) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ThemedText type="body" variant="secondary">
            Nalaganje...
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: jeTema ? barve.card : barve.backgroundSecondary,
            borderBottomWidth: 1,
            borderBottomColor: barve.border,
          },
        ]}>
        <View style={styles.headerRow}>
          <ThemedText type="h3">Moji teki</ThemedText>
          <ThemedText type="caption" variant="muted">
            {teki.length} {teki.length === 1 ? 'tek' : teki.length === 2 ? 'teka' : teki.length === 3 || teki.length === 4 ? 'teki' : 'tekov'}
          </ThemedText>
        </View>
      </View>

      {teki.length === 0 ? (
        <View style={styles.emptyState}>
          <IconSymbol name="figure.run" size={64} color={barve.icon} />
          <ThemedText type="h3" style={styles.emptyText}>
            Še ni tekov
          </ThemedText>
          <ThemedText type="body" variant="muted" style={styles.emptySubtext}>
            Pojdite na zavihek Tek in začnite slediti!
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={teki}
          renderItem={izrisiTek}
          keyExtractor={(element) => element.id}
          contentContainerStyle={styles.runsList}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={osvezevanje} onRefresh={osveziPodatke} />}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingTop: 60,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  runsList: {
    padding: Spacing.md,
  },
  runCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.card,
    marginBottom: Spacing.sm,
  },
  runHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  deleteButton: {
    padding: Spacing.xs,
  },
  routePreview: {
    height: 140,
    borderRadius: BorderRadius.small,
    overflow: 'hidden',
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: '#ECECEC',
  },
  routeWebView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  runStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 32,
  },
  extraStats: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  extraStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  notes: {
    marginTop: Spacing.sm,
    fontStyle: 'italic',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  emptyText: {
    marginTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  emptySubtext: {
    textAlign: 'center',
  },
});
