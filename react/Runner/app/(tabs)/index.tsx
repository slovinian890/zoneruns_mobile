import {
  StyleSheet,
  View,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Animated,
} from 'react-native';
import { useEffect, useState, useRef, useCallback } from 'react';
import * as Location from 'expo-location';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius, CleanPaceColors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import RunningMap from '@/components/running-map';
import TerritoryMap from '@/components/territory-map';
import { createRun, secondsToInterval, calculatePace } from '@/services/runsService';
import { updateUserStatsAfterRun, checkAndAwardAchievements } from '@/services/statsService';
import { getCurrentUser } from '@/services/authService';
import { Run, RouteData } from '@/services/supabase';
import PostRunModal from '@/components/post-run-modal';
import { getTrailColor, DEFAULT_TRAIL_COLOR } from '@/services/trailColorService';
import {
  getTerritoriesFromRuns,
  HexTerritory,
} from '@/services/territoryService';
import { useFocusEffect } from 'expo-router';

// ── Haversine formula za izračun razdalje (km) med dvema GPS točkama ──
// Uporablja polmer Zemlje (6371 km) in trigonometrične funkcije za natančen
// izračun razdalje po površini krogle
const izracunajRazdaljo = (
  sir1: number,
  dol1: number,
  sir2: number,
  dol2: number,
): number => {
  const R = 6371;
  const dSir = ((sir2 - sir1) * Math.PI) / 180;
  const dDol = ((dol2 - dol1) * Math.PI) / 180;
  const a =
    Math.sin(dSir / 2) ** 2 +
    Math.cos((sir1 * Math.PI) / 180) *
      Math.cos((sir2 * Math.PI) / 180) *
      Math.sin(dDol / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ── Načini pogleda ──
type Nacin = 'idle' | 'running' | 'compete';

export default function HomeScreen() {
  const barvnaShema = useColorScheme();
  const barve = Colors[barvnaShema ?? 'light'];

  // ── GPS & dovoljenja ──
  const [lokacija, setLokacija] = useState<Location.LocationObject | null>(null);
  const [sporocilNapake, setSporocilNapake] = useState<string | null>(null);
  const [nalaganje, setNalaganje] = useState(true);

  // ── Način ──
  const [nacin, setNacin] = useState<Nacin>('idle');

  // ── Stanje teka ──
  const [razdalja, setRazdalja] = useState(0);
  const [trajanje, setTrajanje] = useState(0);
  const [zacetniCas, setZacetniCas] = useState<number | null>(null);
  const [pot, setPot] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [shranjevanje, setShranjevanje] = useState(false);

  // ── Reference ──
  const narocninaLokacije = useRef<Location.LocationSubscription | null>(null);
  const casovnikRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const zadnjaLokacijaRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const mirovanjeNarocnina = useRef<Location.LocationSubscription | null>(null);

  // ── Modal po teku ──
  const [prikaziModalObjave, setPrikaziModalObjave] = useState(false);
  const [shranjenTek, setShranjenTek] = useState<Run | null>(null);

  // ── Barva sledi ──
  const [barvaSled, setBarvaSled] = useState<string>(DEFAULT_TRAIL_COLOR);

  // ── Stanje tekmovanja ──
  const [teritoriji, setTeritorioji] = useState<HexTerritory[]>([]);
  const [mojePlosice, setMojePlosice] = useState(0);
  const [uporabnikId, setUporabnikId] = useState<string>('');

  // ── Naloži podatke uporabnika & barvo sledi ob fokusu ──
  useFocusEffect(
    useCallback(() => {
      getTrailColor().then(setBarvaSled);
      getCurrentUser().then((u) => {
        if (u) setUporabnikId(u.id);
      });
    }, []),
  );

  // ── Animacija dihanja za aktivni časovnik ──
  const dihalniPulz = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (nacin === 'running') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(dihalniPulz, {
            toValue: 1.05,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(dihalniPulz, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      dihalniPulz.setValue(1);
    }
  }, [nacin]);

  // ── Neprekinjeno sledenje lokaciji v mirovanju ──
  // Zahteva dovoljenja, preveri storitve in začne spremljati GPS pozicijo
  useEffect(() => {
    let preklicano = false;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setSporocilNapake('Dovoljenje za dostop do lokacije je bilo zavrnjeno');
          setNalaganje(false);
          return;
        }

        const omogoceno = await Location.hasServicesEnabledAsync();
        if (!omogoceno) {
          setSporocilNapake('Prosimo, omogočite lokacijske storitve v nastavitvah naprave');
          setNalaganje(false);
          return;
        }

        const trenutna = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
        });
        if (!preklicano) {
          setLokacija(trenutna);
          setNalaganje(false);
        }

        const narocnina = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 3000, distanceInterval: 2 },
          (lok) => { if (!preklicano) setLokacija(lok); },
        );
        if (!preklicano) mirovanjeNarocnina.current = narocnina;
        else narocnina.remove();
      } catch {
        if (!preklicano) {
          setSporocilNapake('Napaka pri pridobivanju lokacije – preverite, ali je GPS vklopljen');
          setNalaganje(false);
        }
      }
    })();

    return () => {
      preklicano = true;
      mirovanjeNarocnina.current?.remove();
      mirovanjeNarocnina.current = null;
    };
  }, []);

  // ── Časovnik + GPS sledenje v živo med tekom ──
  // Ko se tek začne, ustavi mirovno sledenje in zažene visokofrekvenčno GPS sledenje.
  // Za vsako novo točko izračuna razdaljo s Haversine formulo in posodobi pot.
  useEffect(() => {
    if (nacin === 'running' && zacetniCas) {
      casovnikRef.current = setInterval(() => {
        setTrajanje(Math.floor((Date.now() - zacetniCas) / 1000));
      }, 1000);

      mirovanjeNarocnina.current?.remove();
      mirovanjeNarocnina.current = null;

      Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1500, distanceInterval: 2 },
        (novaLok) => {
          const { latitude, longitude } = novaLok.coords;
          setLokacija(novaLok);

          if (zadnjaLokacijaRef.current) {
            const odsek = izracunajRazdaljo(
              zadnjaLokacijaRef.current.latitude,
              zadnjaLokacijaRef.current.longitude,
              latitude,
              longitude,
            );
            if (odsek < 0.1) setRazdalja((prej) => prej + odsek);
          }

          zadnjaLokacijaRef.current = { latitude, longitude };
          setPot((prej) => [...prej, { latitude, longitude }]);
        },
      ).then((nar) => { narocninaLokacije.current = nar; });
    } else {
      casovnikRef.current && clearInterval(casovnikRef.current);
      casovnikRef.current = null;
      narocninaLokacije.current?.remove();
      narocninaLokacije.current = null;

      if (!mirovanjeNarocnina.current) {
        Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 3000, distanceInterval: 2 },
          (lok) => setLokacija(lok),
        ).then((nar) => { mirovanjeNarocnina.current = nar; });
      }
    }

    return () => {
      casovnikRef.current && clearInterval(casovnikRef.current);
      narocninaLokacije.current?.remove();
    };
  }, [nacin, zacetniCas]);

  // ── Začni tek ──
  const zacniTek = useCallback(() => {
    setZacetniCas(Date.now());
    setRazdalja(0);
    setTrajanje(0);
    setPot([]);
    if (lokacija) {
      const { latitude, longitude } = lokacija.coords;
      zadnjaLokacijaRef.current = { latitude, longitude };
      setPot([{ latitude, longitude }]);
    }
    setNacin('running');
  }, [lokacija]);

  // ── Ustavi tek & shrani ──
  // Preveri minimalno trajanje, izračuna tempo in kalorije,
  // pripravi podatke o poti in shrani tek v bazo
  const ustaviTek = useCallback(async () => {
    setNacin('idle');

    if (trajanje < 5) {
      Alert.alert('Tek prekratek', 'Tecite vsaj nekaj sekund za shranitev.');
      setRazdalja(0); setTrajanje(0); setPot([]); setZacetniCas(null);
      zadnjaLokacijaRef.current = null;
      return;
    }

    setShranjevanje(true);

    try {
      const uporabnik = await getCurrentUser();
      if (!uporabnik) {
        Alert.alert('Napaka', 'Prosimo, prijavite se za shranitev teka');
        setShranjevanje(false);
        return;
      }

      const tempo = calculatePace(razdalja, trajanje);
      const trajanjeInterval = secondsToInterval(trajanje);

      const podatkiPoti: RouteData = {
        coordinates: pot.map((t) => ({ latitude: t.latitude, longitude: t.longitude })),
        startLocation: pot[0] ? { latitude: pot[0].latitude, longitude: pot[0].longitude } : undefined,
        endLocation: pot.length > 0
          ? { latitude: pot[pot.length - 1].latitude, longitude: pot[pot.length - 1].longitude }
          : undefined,
        trailColor: barvaSled,
      };

      const zdaj = new Date();
      const casTekaOblikovan = `${zdaj.getHours().toString().padStart(2, '0')}:${zdaj.getMinutes().toString().padStart(2, '0')}:${zdaj.getSeconds().toString().padStart(2, '0')}`;

      const rezultat = await createRun({
        title: `Tek – ${zdaj.toLocaleDateString('sl-SI', { weekday: 'short', month: 'short', day: 'numeric' })}`,
        run_date: zdaj.toISOString().split('T')[0],
        run_time: casTekaOblikovan,
        distance_km: Math.round(razdalja * 100) / 100,
        duration: trajanjeInterval,
        pace: tempo,
        calories: Math.round(razdalja * 60),
        route_data: podatkiPoti,
      });

      if (rezultat.success) {
        if (rezultat.run) {
          const rezultatStatistike = await updateUserStatsAfterRun(rezultat.run);
          if (rezultatStatistike.success && rezultatStatistike.stats) {
            const noveDosezki = await checkAndAwardAchievements(rezultat.run, rezultatStatistike.stats);
            if (noveDosezki.length > 0) {
              Alert.alert('Dosežek odklenjen! 🏆', noveDosezki.map((d) => d.title).join(', '));
            }
          }
          setShranjenTek(rezultat.run);
          setPrikaziModalObjave(true);
        }

        if (rezultat.queued) {
          Alert.alert('Shranjeno brez povezave', 'Vaš tek se bo sinhroniziral, ko boste spet na spletu.');
        }

        setRazdalja(0); setTrajanje(0); setPot([]); setZacetniCas(null);
        zadnjaLokacijaRef.current = null;
      } else {
        Alert.alert('Napaka', rezultat.error || 'Shranjevanje teka ni uspelo');
      }
    } catch (napaka) {
      console.error('Napaka pri ustavitvi teka:', napaka);
      Alert.alert('Napaka', 'Nekaj je šlo narobe pri shranjevanju teka.');
    } finally {
      setShranjevanje(false);
    }
  }, [trajanje, razdalja, pot, barvaSled]);

  // ── Vstopi v način tekmovanja ──
  const obdelajTekmovanje = useCallback(async () => {
    setNacin('compete');

    const { territories: podatki, myCount } = await getTerritoriesFromRuns();
    setTeritorioji(podatki);
    setMojePlosice(myCount);
  }, []);

  // ── Oblikovalci ──
  const oblikujTrajanje = (sekunde: number): string => {
    const ure = Math.floor(sekunde / 3600);
    const minute = Math.floor((sekunde % 3600) / 60);
    const sek = sekunde % 60;
    if (ure > 0) return `${ure}:${minute.toString().padStart(2, '0')}:${sek.toString().padStart(2, '0')}`;
    return `${minute}:${sek.toString().padStart(2, '0')}`;
  };

  const oblikujTempo = (razdKm: number, trajSek: number): string => {
    if (razdKm === 0 || trajSek === 0) return '0:00';
    const sekNaKm = trajSek / razdKm;
    return `${Math.floor(sekNaKm / 60)}:${Math.floor(sekNaKm % 60).toString().padStart(2, '0')}`;
  };

  const tempo = oblikujTempo(razdalja, trajanje);

  // ── Stanja nalaganja / napake ──
  if (nalaganje) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" color={barve.primary} />
          <ThemedText type="body" variant="secondary" style={{ marginTop: Spacing.md }}>
            Pridobivanje vaše lokacije...
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (sporocilNapake) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.centeredContainer}>
          <IconSymbol name="exclamationmark.triangle.fill" size={48} color={barve.primary} />
          <ThemedText type="body" variant="secondary" style={{ textAlign: 'center', marginTop: Spacing.md }}>
            {sporocilNapake}
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!lokacija) return null;
  const { latitude, longitude } = lokacija.coords;

  // ══════════════════════════════════════════════════════════
  // ── POGLED TEKMOVANJA ──
  // ══════════════════════════════════════════════════════════
  if (nacin === 'compete') {
    return (
      <ThemedView style={styles.container}>
        <View
          style={[
            styles.header,
            {
              backgroundColor: barvnaShema === 'dark' ? barve.card : barve.backgroundSecondary,
              borderBottomWidth: 1,
              borderBottomColor: barve.border,
            },
          ]}>
          <View style={styles.headerContent}>
            <View style={styles.headerTitleRow}>
              <TouchableOpacity onPress={() => setNacin('idle')} style={styles.backBtn}>
                <IconSymbol name="chevron.left" size={22} color={barve.primary} />
              </TouchableOpacity>
              <IconSymbol name="hexagon.fill" size={26} color={barve.primary} />
              <ThemedText type="h3">Ozemlje</ThemedText>
            </View>
          </View>

          <View
            style={[
              styles.tileBadge,
              {
                backgroundColor: barvnaShema === 'dark' ? barve.background : CleanPaceColors.offWhite,
                borderWidth: 1,
                borderColor: barve.border,
              },
            ]}>
            <View style={styles.statItem}>
              <ThemedText type="h2" variant="primary">
                {mojePlosice}
              </ThemedText>
              <ThemedText type="caption" variant="muted">
                ploščic
              </ThemedText>
            </View>
            <View style={[styles.statDivider, { backgroundColor: barve.border }]} />
            <View style={styles.statItem}>
              <View style={[styles.colorDot, { backgroundColor: barvaSled }]} />
              <ThemedText type="caption" variant="muted">
                vaša barva
              </ThemedText>
            </View>
          </View>
        </View>

        <TerritoryMap
          latitude={latitude}
          longitude={longitude}
          colors={barve}
          trailColor={barvaSled}
          territories={teritoriji}
          userId={uporabnikId}
        />
      </ThemedView>
    );
  }

  // ══════════════════════════════════════════════════════════
  // ── MIROVANJE + TEK POGLED ──
  // ══════════════════════════════════════════════════════════
  return (
    <ThemedView style={styles.container}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: barvnaShema === 'dark' ? barve.card : barve.backgroundSecondary,
            borderBottomWidth: 1,
            borderBottomColor: barve.border,
          },
        ]}>
        <View style={styles.headerContent}>
          <View style={styles.headerTitleRow}>
            <IconSymbol name="figure.run" size={28} color={barve.primary} />
            <ThemedText type="h3">Run Tracker</ThemedText>
          </View>
        </View>

        {nacin === 'running' && (
          <Animated.View
            style={[
              styles.statsBar,
              {
                backgroundColor:
                  barvnaShema === 'dark' ? barve.background : CleanPaceColors.offWhite,
                borderWidth: 1,
                borderColor: barve.primary,
                transform: [{ scale: dihalniPulz }],
              },
            ]}>
            <View style={styles.statItem}>
              <ThemedText type="h2" variant="primary">
                {razdalja.toFixed(2)}
              </ThemedText>
              <ThemedText type="caption" variant="muted">
                km
              </ThemedText>
            </View>
            <View style={[styles.statDivider, { backgroundColor: barve.border }]} />
            <View style={styles.statItem}>
              <ThemedText type="h2" variant="primary">
                {oblikujTrajanje(trajanje)}
              </ThemedText>
              <ThemedText type="caption" variant="muted">
                čas
              </ThemedText>
            </View>
            <View style={[styles.statDivider, { backgroundColor: barve.border }]} />
            <View style={styles.statItem}>
              <ThemedText type="h2" variant="primary">
                {tempo}
              </ThemedText>
              <ThemedText type="caption" variant="muted">
                tempo/km
              </ThemedText>
            </View>
          </Animated.View>
        )}
      </View>

      <RunningMap
        latitude={latitude}
        longitude={longitude}
        colors={barve}
        route={pot}
        isRunning={nacin === 'running'}
        trailColor={barvaSled}
      />

      <View
        style={[
          styles.controlPanel,
          {
            backgroundColor: barvnaShema === 'dark' ? barve.card : barve.background,
            borderTopWidth: 1,
            borderTopColor: barve.border,
          },
        ]}>
        {nacin === 'idle' ? (
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.startButton, { backgroundColor: barve.primary, flex: 1 }]}
              onPress={zacniTek}
              activeOpacity={0.7}>
              <IconSymbol name="play.fill" size={22} color={CleanPaceColors.offWhite} />
              <ThemedText
                type="bodyBold"
                lightColor={CleanPaceColors.offWhite}
                darkColor={CleanPaceColors.offWhite}>
                Začni tek
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.competeButton,
                {
                  backgroundColor: barvnaShema === 'dark' ? barve.background : CleanPaceColors.frostBlue,
                  borderWidth: 1.5,
                  borderColor: barve.primary,
                },
              ]}
              onPress={obdelajTekmovanje}
              activeOpacity={0.7}>
              <IconSymbol name="hexagon.fill" size={20} color={barve.primary} />
              <ThemedText type="bodyBold" variant="primary">
                Tekmuj
              </ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[
              styles.stopButton,
              {
                backgroundColor: barve.background,
                borderWidth: 2,
                borderColor: '#E53935',
              },
            ]}
            onPress={ustaviTek}
            activeOpacity={0.7}
            disabled={shranjevanje}>
            <IconSymbol name="stop.fill" size={22} color="#E53935" />
            <ThemedText type="bodyBold" lightColor="#E53935" darkColor="#E53935">
              {shranjevanje ? 'Shranjevanje...' : 'Ustavi & shrani'}
            </ThemedText>
          </TouchableOpacity>
        )}
      </View>

      <PostRunModal
        visible={prikaziModalObjave}
        run={shranjenTek}
        onClose={() => {
          setPrikaziModalObjave(false);
          setShranjenTek(null);
        }}
        onPost={() => {}}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
  },
  header: {
    paddingTop: 60,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  headerContent: { marginBottom: Spacing.sm },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  backBtn: {
    padding: 4,
    marginRight: 2,
  },
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderRadius: BorderRadius.card,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    marginTop: Spacing.sm,
  },
  tileBadge: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderRadius: BorderRadius.card,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    marginTop: Spacing.sm,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 32 },
  colorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginBottom: 4,
  },
  controlPanel: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.card,
    gap: Spacing.sm,
  },
  competeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.card,
    gap: Spacing.sm,
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.card,
    gap: Spacing.sm,
  },
});
