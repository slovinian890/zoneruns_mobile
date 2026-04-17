import { StyleSheet, View, TouchableOpacity, FlatList, Alert, RefreshControl, TextInput, Modal, Platform, Dimensions } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { Image } from 'expo-image';
import { WebView } from 'react-native-webview';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius, CleanPaceColors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useFocusEffect, useRouter } from 'expo-router';
import { getFeedPosts, toggleLike, getPostComments, addComment } from '@/services/socialService';
import { getCurrentUser } from '@/services/authService';
import { PostWithAuthor, PostCommentWithAuthor, RouteData } from '@/services/supabase';
import { intervalToSeconds } from '@/services/runsService';
import { DEFAULT_TRAIL_COLOR } from '@/services/trailColorService';

const { width: SIRINA_ZASLONA } = Dimensions.get('window');

// Generira mini Leaflet zemljevid za objave na feedu
const generirajFeedPotHTML = (podatkiPoti: RouteData, jeTema: boolean): string => {
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
    .start-dot { width: 10px; height: 10px; border-radius: 50%; background: #4CAF50; border: 2px solid #fff; }
    .end-dot { width: 10px; height: 10px; border-radius: 50%; background: #F44336; border: 2px solid #fff; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var coords = ${koordinateJSON};
    var map = L.map('map', {
      zoomControl: false, attributionControl: false,
      dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
      touchZoom: false, boxZoom: false, keyboard: false
    });
    L.tileLayer('${urlPlosice}', { maxZoom: 19, subdomains: 'abcd' }).addTo(map);
    if (coords.length > 0) {
      L.polyline(coords, { color: '${barvaLinije}', weight: 7, opacity: 0.2 }).addTo(map);
      var line = L.polyline(coords, { color: '${barvaLinije}', weight: 3, opacity: 0.9 }).addTo(map);
      var startIcon = L.divIcon({ className: 'start-dot', iconSize: [10,10], iconAnchor: [5,5] });
      var endIcon = L.divIcon({ className: 'end-dot', iconSize: [10,10], iconAnchor: [5,5] });
      L.marker(coords[0], { icon: startIcon }).addTo(map);
      L.marker(coords[coords.length-1], { icon: endIcon }).addTo(map);
      map.fitBounds(line.getBounds(), { padding: [20, 20] });
    }
  </script>
</body>
</html>`;
};

// Generira celozaslonski Leaflet zemljevid za modal s podrobnostmi
const generirajPodrobnostiZemljevidHTML = (podatkiPoti: RouteData, jeTema: boolean): string => {
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
    .leaflet-control-attribution { font-size: 9px !important; }
    .start-dot { width: 14px; height: 14px; border-radius: 50%; background: #4CAF50; border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
    .end-dot { width: 14px; height: 14px; border-radius: 50%; background: #F44336; border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var coords = ${koordinateJSON};
    var map = L.map('map', { zoomControl: true, attributionControl: true });
    L.tileLayer('${urlPlosice}', { maxZoom: 19, subdomains: 'abcd' }).addTo(map);
    if (coords.length > 0) {
      L.polyline(coords, { color: '${barvaLinije}', weight: 10, opacity: 0.2, lineCap: 'round', lineJoin: 'round' }).addTo(map);
      var line = L.polyline(coords, { color: '${barvaLinije}', weight: 4, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }).addTo(map);
      var startIcon = L.divIcon({ className: 'start-dot', iconSize: [14,14], iconAnchor: [7,7] });
      var endIcon = L.divIcon({ className: 'end-dot', iconSize: [14,14], iconAnchor: [7,7] });
      L.marker(coords[0], { icon: startIcon }).addTo(map).bindPopup('Začetek');
      L.marker(coords[coords.length-1], { icon: endIcon }).addTo(map).bindPopup('Konec');
      map.fitBounds(line.getBounds(), { padding: [30, 30] });
    }
  </script>
</body>
</html>`;
};

export default function FeedScreen() {
  const barvnaShema = useColorScheme();
  const barve = Colors[barvnaShema ?? 'light'];
  const jeTema = barvnaShema === 'dark';
  const usmerjevalnik = useRouter();
  const [objave, setObjave] = useState<PostWithAuthor[]>([]);
  const [nalaganje, setNalaganje] = useState(true);
  const [osvezevanje, setOsvezevanje] = useState(false);
  const [napakaFeeda, setNapakaFeeda] = useState<string | null>(null);
  const [trenutniUporabnikId, setTrenutniUporabnikId] = useState<string | null>(null);
  const [razsirjenaObjavaId, setRazsirjenaObjavaId] = useState<string | null>(null);
  const [komentarji, setKomentarji] = useState<{ [key: string]: PostCommentWithAuthor[] }>({});
  const [besediloKomentarja, setBesediloKomentarja] = useState<{ [key: string]: string }>({});
  const [posiljamKomentar, setPosiljamKomentar] = useState(false);

  // Stanje modala s podrobnostmi
  const [podrobnostiObjave, setPodrobnostiObjave] = useState<PostWithAuthor | null>(null);

  useEffect(() => {
    naloziUporabnika();
  }, []);

  useFocusEffect(
    useCallback(() => {
      naloziObjave();
    }, [])
  );

  const naloziUporabnika = async () => {
    const uporabnik = await getCurrentUser();
    if (uporabnik) setTrenutniUporabnikId(uporabnik.id);
  };

  const naloziObjave = async () => {
    try {
      console.log('[FeedScreen] Loading posts...');
      const rezultat = await getFeedPosts({ page: 1, limit: 20 });
      console.log('[FeedScreen] Result:', { error: rezultat.error, count: rezultat.data?.length, total: rezultat.count });
      if (rezultat.error) {
        setNapakaFeeda(rezultat.error);
        setObjave([]);
      } else {
        setNapakaFeeda(null);
        setObjave(rezultat.data ?? []);
      }
    } catch (napaka) {
      console.error('[FeedScreen] Napaka pri nalaganju objav:', napaka);
      setNapakaFeeda(napaka instanceof Error ? napaka.message : 'Nalaganje feeda ni uspelo');
    } finally {
      setNalaganje(false);
      setOsvezevanje(false);
    }
  };

  const osveziPodatke = () => {
    setOsvezevanje(true);
    naloziObjave();
  };

  // Preklopi všeček – pošlje zahtevo na strežnik in lokalno posodobi števec
  const obdelajVsecek = async (objava: PostWithAuthor) => {
    if (!trenutniUporabnikId) {
      Alert.alert('Napaka', 'Prosimo, prijavite se za všečkanje objav');
      return;
    }
    const rezultat = await toggleLike(objava.id);
    if (rezultat.success) {
      setObjave(prej =>
        prej.map(o =>
          o.id === objava.id
            ? {
                ...o,
                is_liked: rezultat.liked,
                likes_count: rezultat.liked
                  ? (o.likes_count ?? 0) + 1
                  : Math.max(0, (o.likes_count ?? 0) - 1),
              }
            : o
        )
      );
    }
  };

  const preklopiKomentarje = async (objavaId: string) => {
    if (razsirjenaObjavaId === objavaId) {
      setRazsirjenaObjavaId(null);
    } else {
      setRazsirjenaObjavaId(objavaId);
      if (!komentarji[objavaId]) {
        const rezultat = await getPostComments(objavaId);
        setKomentarji(prej => ({ ...prej, [objavaId]: rezultat.data }));
      }
    }
  };

  const dodajKomentar = async (objavaId: string) => {
    const besedilo = besediloKomentarja[objavaId]?.trim();
    if (!besedilo) return;
    if (!trenutniUporabnikId) {
      Alert.alert('Napaka', 'Prosimo, prijavite se za komentiranje');
      return;
    }
    setPosiljamKomentar(true);
    const rezultat = await addComment({ post_id: objavaId, content: besedilo });
    setPosiljamKomentar(false);
    if (rezultat.success) {
      setBesediloKomentarja(prej => ({ ...prej, [objavaId]: '' }));
      const rezultatKomentarjev = await getPostComments(objavaId);
      setKomentarji(prej => ({ ...prej, [objavaId]: rezultatKomentarjev.data }));
      setObjave(prej =>
        prej.map(o =>
          o.id === objavaId ? { ...o, comments_count: (o.comments_count ?? 0) + 1 } : o
        )
      );
    } else {
      Alert.alert('Napaka', rezultat.error || 'Dodajanje komentarja ni uspelo');
    }
  };

  const oblikujTrajanje = (interval: string | null): string => {
    if (!interval) return '0:00';
    const sekunde = intervalToSeconds(interval);
    const ure = Math.floor(sekunde / 3600);
    const minute = Math.floor((sekunde % 3600) / 60);
    const sek = sekunde % 60;
    if (ure > 0) return `${ure}:${minute.toString().padStart(2, '0')}:${sek.toString().padStart(2, '0')}`;
    return `${minute}:${sek.toString().padStart(2, '0')}`;
  };

  const oblikujCasPred = (casovniZig: string): string => {
    if (!casovniZig) return '';
    const cas = new Date(casovniZig).getTime();
    if (isNaN(cas)) return '';
    const sekunde = Math.floor((Date.now() - cas) / 1000);
    if (sekunde < 0) return 'pravkar';
    if (sekunde < 60) return `pred ${sekunde}s`;
    const minute = Math.floor(sekunde / 60);
    if (minute < 60) return `pred ${minute}min`;
    const ure = Math.floor(minute / 60);
    if (ure < 24) return `pred ${ure}h`;
    const dnevi = Math.floor(ure / 24);
    return `pred ${dnevi}d`;
  };

  const oblikujCasTeka = (casTeka: string | null | undefined): string => {
    if (!casTeka) return '';
    const deli = casTeka.split(':');
    if (deli.length >= 2) {
      const u = parseInt(deli[0]);
      const m = deli[1];
      const ampm = u >= 12 ? 'PM' : 'AM';
      const u12 = u % 12 || 12;
      return `${u12}:${m} ${ampm}`;
    }
    return casTeka;
  };

  const obdelajPritiskUporabnika = (uporabnikId: string) => {
    if (uporabnikId === trenutniUporabnikId) {
      usmerjevalnik.push('/(tabs)/profile');
    } else {
      usmerjevalnik.push({ pathname: '/user-profile', params: { userId: uporabnikId } });
    }
  };

  const imaPodatkePoti = (objava: PostWithAuthor): boolean => {
    try {
      const podatkiPoti = objava.runs?.route_data as RouteData | undefined;
      return !!(podatkiPoti?.coordinates && podatkiPoti.coordinates.length >= 2);
    } catch {
      return false;
    }
  };

  const izrisiMiniZemljevid = (podatkiPoti: RouteData) => {
    try {
      const html = generirajFeedPotHTML(podatkiPoti, jeTema);
      if (!html) return null;
      return (
        <View style={styles.miniMapContainer}>
          <WebView
            source={{ html }}
            style={styles.miniMapWebView}
            scrollEnabled={false}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            cacheEnabled
          />
        </View>
      );
    } catch {
      return null;
    }
  };

  // ── Modal s podrobnostmi ──
  const izrisiModalPodrobnosti = () => {
    if (!podrobnostiObjave) return null;
    const tek = podrobnostiObjave.runs;
    const profilPodrobnosti = podrobnostiObjave.profiles;
    const podatkiPoti = tek?.route_data as RouteData | undefined;
    let imaPot = false;
    try {
      imaPot = !!(podatkiPoti?.coordinates && podatkiPoti.coordinates.length >= 2);
    } catch { /* ignore */ }

    return (
      <Modal visible={!!podrobnostiObjave} transparent animationType="slide" onRequestClose={() => setPodrobnostiObjave(null)}>
        <View style={styles.detailOverlay}>
          <ThemedView style={[styles.detailModal, { backgroundColor: jeTema ? barve.card : barve.background }]}>
            {/* Glava */}
            <View style={[styles.detailHeader, { borderBottomColor: barve.border }]}>
              <View style={styles.detailHeaderLeft}>
                {profilPodrobnosti?.avatar_url ? (
                  <Image source={{ uri: profilPodrobnosti.avatar_url }} style={styles.detailAvatar} />
                ) : (
                  <View style={[styles.detailAvatarPlaceholder, { backgroundColor: barve.backgroundSecondary }]}>
                    <IconSymbol name="person.fill" size={20} color={barve.primary} />
                  </View>
                )}
                <View>
                  <ThemedText type="bodyBold">
                    {profilPodrobnosti?.display_name || profilPodrobnosti?.username || 'Tekač'}
                  </ThemedText>
                  <ThemedText type="caption" variant="muted">
                    {tek?.run_date
                      ? new Date(tek.run_date).toLocaleDateString('sl-SI', {
                          weekday: 'short', month: 'short', day: 'numeric',
                        })
                      : oblikujCasPred(podrobnostiObjave.created_at)}
                    {tek?.run_time ? ` ob ${oblikujCasTeka(tek.run_time)}` : ''}
                  </ThemedText>
                </View>
              </View>
              <TouchableOpacity onPress={() => setPodrobnostiObjave(null)} style={styles.closeButton}>
                <IconSymbol name="xmark" size={22} color={barve.text} />
              </TouchableOpacity>
            </View>

            {/* Zemljevid poti */}
            {imaPot && podatkiPoti && (
              <View style={styles.detailMapContainer}>
                <WebView
                  source={{ html: generirajPodrobnostiZemljevidHTML(podatkiPoti, jeTema) }}
                  style={styles.detailMapWebView}
                  scrollEnabled={false}
                  originWhitelist={['*']}
                  javaScriptEnabled
                  domStorageEnabled
                  cacheEnabled
                />
              </View>
            )}

            {/* Statistika teka */}
            {tek && (
              <View style={[styles.detailStats, { borderColor: barve.border }]}>
                <View style={styles.detailStatItem}>
                  <ThemedText type="h2" variant="primary">
                    {Number(tek.distance_km || 0).toFixed(2)}
                  </ThemedText>
                  <ThemedText type="caption" variant="muted">km</ThemedText>
                </View>
                <View style={[styles.detailStatDivider, { backgroundColor: barve.border }]} />
                <View style={styles.detailStatItem}>
                  <ThemedText type="h2" variant="primary">
                    {oblikujTrajanje(tek.duration ?? null)}
                  </ThemedText>
                  <ThemedText type="caption" variant="muted">čas</ThemedText>
                </View>
                <View style={[styles.detailStatDivider, { backgroundColor: barve.border }]} />
                <View style={styles.detailStatItem}>
                  <ThemedText type="h2" variant="primary">
                    {tek.pace ?? '0:00'}
                  </ThemedText>
                  <ThemedText type="caption" variant="muted">tempo/km</ThemedText>
                </View>
              </View>
            )}

            {/* Opis */}
            {podrobnostiObjave.content ? (
              <View style={styles.detailDescription}>
                <ThemedText type="body">{podrobnostiObjave.content}</ThemedText>
              </View>
            ) : null}

            {/* Število všečkov in komentarjev */}
            <View style={[styles.detailFooter, { borderTopColor: barve.border }]}>
              <View style={styles.detailFooterItem}>
                <IconSymbol name="heart.fill" size={16} color={barve.primary} />
                <ThemedText type="bodySmall" variant="muted">{podrobnostiObjave.likes_count ?? 0} všečkov</ThemedText>
              </View>
              <View style={styles.detailFooterItem}>
                <IconSymbol name="bubble.left" size={16} color={barve.icon} />
                <ThemedText type="bodySmall" variant="muted">{podrobnostiObjave.comments_count ?? 0} komentarjev</ThemedText>
              </View>
            </View>
          </ThemedView>
        </View>
      </Modal>
    );
  };

  // ── Kartica objave ──
  const izrisiObjavo = ({ item }: { item: PostWithAuthor }) => {
    if (!item) return null;
    const profil = item.profiles;
    const prikaziZemljevid = imaPodatkePoti(item);

    return (
      <View
        style={[
          styles.postCard,
          {
            backgroundColor: jeTema ? barve.card : barve.background,
            borderWidth: 1,
            borderColor: barve.border,
          },
        ]}>
        {/* Glava uporabnika */}
        <View style={styles.postHeader}>
          <TouchableOpacity
            style={styles.userInfo}
            onPress={() => obdelajPritiskUporabnika(item.user_id)}
            activeOpacity={0.7}>
            {profil?.avatar_url ? (
              <Image source={{ uri: profil.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: barve.backgroundSecondary }]}>
                <IconSymbol name="person.fill" size={20} color={barve.primary} />
              </View>
            )}
            <View style={styles.userDetails}>
              <ThemedText type="bodyBold">
                {profil?.display_name || profil?.username || 'Neznano'}
              </ThemedText>
              <ThemedText type="caption" variant="muted">
                {oblikujCasPred(item.created_at)}
              </ThemedText>
            </View>
          </TouchableOpacity>
        </View>

        {/* Besedilo objave */}
        {item.content && (
          <ThemedText type="body" style={styles.description}>
            {item.content}
          </ThemedText>
        )}

        {/* Mini zemljevid poti (klikljiv za odprtje podrobnosti) */}
        {prikaziZemljevid && item.runs?.route_data && (
          <TouchableOpacity activeOpacity={0.9} onPress={() => setPodrobnostiObjave(item)}>
            {izrisiMiniZemljevid(item.runs.route_data as RouteData)}
            <View style={[styles.mapOverlayLabel, { backgroundColor: barve.primary + 'CC' }]}>
              <IconSymbol name="map.fill" size={12} color="#FFFFFF" />
              <ThemedText type="caption" lightColor="#FFFFFF" darkColor="#FFFFFF">
                Tapni za ogled poti
              </ThemedText>
            </View>
          </TouchableOpacity>
        )}

        {/* Povzetek statistike teka */}
        {item.runs && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setPodrobnostiObjave(item)}
            style={[
              styles.runStats,
              {
                backgroundColor: jeTema ? barve.background : barve.backgroundSecondary,
                borderWidth: 1,
                borderColor: barve.border,
              },
            ]}>
            <View style={styles.statItem}>
              <ThemedText type="h3" variant="primary">
                {Number(item.runs.distance_km || 0).toFixed(2)}
              </ThemedText>
              <ThemedText type="caption" variant="muted">km</ThemedText>
            </View>
            <View style={[styles.statDivider, { backgroundColor: barve.border }]} />
            <View style={styles.statItem}>
              <ThemedText type="h3" variant="primary">
                {oblikujTrajanje(item.runs.duration ?? null)}
              </ThemedText>
              <ThemedText type="caption" variant="muted">čas</ThemedText>
            </View>
            <View style={[styles.statDivider, { backgroundColor: barve.border }]} />
            <View style={styles.statItem}>
              <ThemedText type="h3" variant="primary">
                {item.runs.pace ?? '0:00'}
              </ThemedText>
              <ThemedText type="caption" variant="muted">tempo/km</ThemedText>
            </View>
          </TouchableOpacity>
        )}

        {/* Gumbi za všeček in komentarje */}
        <View style={[styles.postActions, { borderTopColor: barve.border }]}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => obdelajVsecek(item)}
            activeOpacity={0.7}>
            <IconSymbol
              name={item.is_liked ? 'heart.fill' : 'heart'}
              size={20}
              color={item.is_liked ? barve.primary : barve.icon}
            />
            <ThemedText type="bodySmall" variant={item.is_liked ? 'primary' : 'muted'}>
              {item.likes_count ?? 0}
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => preklopiKomentarje(item.id)}
            activeOpacity={0.7}>
            <IconSymbol
              name="bubble.left"
              size={20}
              color={razsirjenaObjavaId === item.id ? barve.primary : barve.icon}
            />
            <ThemedText type="bodySmall" variant={razsirjenaObjavaId === item.id ? 'primary' : 'muted'}>
              {item.comments_count ?? 0}
            </ThemedText>
          </TouchableOpacity>
          {item.runs && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => setPodrobnostiObjave(item)}
              activeOpacity={0.7}>
              <IconSymbol name="arrow.up.right.square" size={20} color={barve.icon} />
              <ThemedText type="bodySmall" variant="muted">Podrobnosti</ThemedText>
            </TouchableOpacity>
          )}
        </View>

        {/* Sekcija komentarjev */}
        {razsirjenaObjavaId === item.id && (
          <View style={[styles.commentsSection, { borderTopColor: barve.border }]}>
            {komentarji[item.id] && komentarji[item.id].length > 0 && (
              <View style={styles.commentsList}>
                {komentarji[item.id].map((komentar) => (
                  <View key={komentar.id} style={styles.commentItem}>
                    <TouchableOpacity
                      style={styles.commentHeader}
                      onPress={() => obdelajPritiskUporabnika(komentar.user_id)}
                      activeOpacity={0.7}>
                      {komentar.profiles?.avatar_url ? (
                        <Image source={{ uri: komentar.profiles.avatar_url }} style={styles.commentAvatar} />
                      ) : (
                        <View
                          style={[
                            styles.commentAvatarPlaceholder,
                            { backgroundColor: barve.backgroundSecondary },
                          ]}>
                          <IconSymbol name="person.fill" size={12} color={barve.primary} />
                        </View>
                      )}
                      <View style={styles.commentContent}>
                        <ThemedText type="bodySmall" variant="primary">
                          {komentar.profiles?.display_name || komentar.profiles?.username || 'Neznano'}
                        </ThemedText>
                        <ThemedText type="bodySmall" style={styles.commentText}>
                          {komentar.content}
                        </ThemedText>
                        <ThemedText type="caption" variant="muted">
                          {oblikujCasPred(komentar.created_at)}
                        </ThemedText>
                      </View>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Vnos komentarja */}
            <View
              style={[
                styles.commentInputContainer,
                {
                  backgroundColor: jeTema ? barve.background : barve.backgroundSecondary,
                  borderColor: barve.border,
                },
              ]}>
              <TextInput
                style={[styles.commentInput, { color: barve.text }]}
                value={besediloKomentarja[item.id] || ''}
                onChangeText={(besedilo) => setBesediloKomentarja((prej) => ({ ...prej, [item.id]: besedilo }))}
                placeholder="Dodaj komentar..."
                placeholderTextColor={barve.textMuted}
                multiline
                editable={!posiljamKomentar}
              />
              <TouchableOpacity
                onPress={() => dodajKomentar(item.id)}
                disabled={!besediloKomentarja[item.id]?.trim() || posiljamKomentar}
                style={[
                  styles.sendButton,
                  (!besediloKomentarja[item.id]?.trim() || posiljamKomentar) && { opacity: 0.5 },
                ]}
                activeOpacity={0.7}>
                <IconSymbol name="arrow.up.circle.fill" size={32} color={barve.primary} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  if (nalaganje) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ThemedText type="body" variant="secondary">Nalaganje...</ThemedText>
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
        <ThemedText type="h3">Feed</ThemedText>
      </View>

      {napakaFeeda ? (
        <View style={styles.emptyState}>
          <IconSymbol name="exclamationmark.triangle.fill" size={64} color={barve.primary} />
          <ThemedText type="h3" style={styles.emptyText}>Feeda ni mogoče naložiti</ThemedText>
          <ThemedText type="body" variant="muted" style={styles.emptySubtext}>
            {napakaFeeda}
          </ThemedText>
          <TouchableOpacity
            onPress={osveziPodatke}
            style={[styles.retryButton, { backgroundColor: barve.primary }]}
            activeOpacity={0.8}>
            <ThemedText type="bodyBold" lightColor="#FFFFFF" darkColor="#FFFFFF">
              Poskusi znova
            </ThemedText>
          </TouchableOpacity>
        </View>
      ) : objave.length === 0 ? (
        <View style={styles.emptyState}>
          <IconSymbol name="newspaper.fill" size={64} color={barve.icon} />
          <ThemedText type="h3" style={styles.emptyText}>Še ni objav</ThemedText>
          <ThemedText type="body" variant="muted" style={styles.emptySubtext}>
            Zaključite tek in ga objavite, da se prikaže tukaj!
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={objave}
          renderItem={izrisiObjavo}
          keyExtractor={(element) => element.id}
          contentContainerStyle={styles.postsList}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={osvezevanje} onRefresh={osveziPodatke} />}
        />
      )}

      {izrisiModalPodrobnosti()}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    paddingTop: 60,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  postsList: { padding: Spacing.md },
  postCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.card,
    marginBottom: Spacing.md,
  },
  postHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  userInfo: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 40, height: 40, borderRadius: 20, marginRight: Spacing.sm },
  avatarPlaceholder: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
    marginRight: Spacing.sm,
  },
  userDetails: { flex: 1 },
  description: { marginBottom: Spacing.sm },
  miniMapContainer: {
    height: 160,
    borderRadius: BorderRadius.small,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: '#ECECEC',
  },
  miniMapWebView: { flex: 1, backgroundColor: 'transparent' },
  mapOverlayLabel: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  runStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderRadius: BorderRadius.small,
    marginBottom: Spacing.sm,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 24 },
  postActions: {
    flexDirection: 'row',
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    gap: Spacing.lg,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: 4,
  },
  commentsSection: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
  },
  commentsList: { marginBottom: Spacing.sm },
  commentItem: { marginBottom: Spacing.sm },
  commentHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  commentAvatar: {
    width: 28, height: 28, borderRadius: 14,
    marginRight: Spacing.xs,
  },
  commentAvatarPlaceholder: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
    marginRight: Spacing.xs,
  },
  commentContent: { flex: 1 },
  commentText: { marginTop: 2, marginBottom: 2 },
  commentInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderWidth: 1,
    borderRadius: BorderRadius.card,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  commentInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: Spacing.xs,
    paddingRight: Spacing.xs,
    maxHeight: 100,
    fontFamily: Platform.select({
      ios: 'SF Pro Text',
      android: 'sans-serif',
      default: 'sans-serif',
    }),
  },
  sendButton: { paddingLeft: Spacing.xs },
  emptyState: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    padding: Spacing.xl,
  },
  emptyText: { marginTop: Spacing.md, marginBottom: Spacing.xs },
  emptySubtext: { textAlign: 'center', marginBottom: Spacing.md },
  retryButton: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.card,
  },
  detailOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  detailModal: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: 1,
  },
  detailHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  detailAvatar: { width: 40, height: 40, borderRadius: 20 },
  detailAvatarPlaceholder: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
  closeButton: { padding: Spacing.xs },
  detailMapContainer: {
    height: 260,
    borderBottomWidth: 1,
    borderBottomColor: '#ECECEC',
  },
  detailMapWebView: { flex: 1, backgroundColor: 'transparent' },
  detailStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.card,
  },
  detailStatItem: { flex: 1, alignItems: 'center' },
  detailStatDivider: { width: 1, height: 36 },
  detailExtraRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
    marginHorizontal: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.small,
  },
  detailExtraItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  detailDescription: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  detailFooter: {
    flexDirection: 'row',
    gap: Spacing.lg,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    borderTopWidth: 1,
  },
  detailFooterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
});
