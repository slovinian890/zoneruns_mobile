import {
  StyleSheet,
  View,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useEffect, useState, useRef, useCallback } from 'react';
import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useAmbientVariant } from '@/components/ambient-background';
import { Spacing, AuroraColors, Shadows } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { GradientButton } from '@/components/ui/gradient-button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { StatBlock } from '@/components/ui/stat-block';
import { TAB_BAR_HEIGHT } from '@/components/ui/floating-tab-bar';
import RunningMap from '@/components/running-map';
import TerritoryMap from '@/components/territory-map';
import { createRun, secondsToInterval, calculatePace } from '@/services/runsService';
import { updateUserStatsAfterRun, checkAndAwardAchievements } from '@/services/statsService';
import { getCurrentUser } from '@/services/authService';
import { Run, RouteData, TerritoryFeature, GroupTerritoryFeature, ClaimTerritoryResult } from '@/services/supabase';
import { getGroupTerritoriesInBounds, getMyGroups } from '@/services/groupsService';
import PostRunModal from '@/components/post-run-modal';
import { getTrailColor, DEFAULT_TRAIL_COLOR } from '@/services/trailColorService';
import { Colors } from '@/constants/theme';
import {
  getTerritoriesInBounds,
  claimTerritoryFromRun,
  getMyTerritoryStats,
  isLoopReady,
  formatArea,
} from '@/services/territoryService';
import { getPlaceLabel, notifyAttackVictims, zoneWord } from '@/services/notificationsService';
import { coinsForDistance } from '@/services/coinsService';
import {
  startBackgroundLocationTracking,
  stopBackgroundLocationTracking,
  setBackgroundLocationListener,
} from '@/services/locationTask';
import {
  showLiveRunNotification,
  dismissLiveRunNotification,
  addStopRunActionListener,
  addPauseRunActionListener,
  addResumeRunActionListener,
  setLiveRunPlaybackState,
} from '@/services/liveRunNotificationService';
import { useFocusEffect } from 'expo-router';

// GPS fixes worse than this (meters) are dropped instead of being drawn into
// the trail or counted toward distance / loop closure — a bad single fix
// otherwise shows up as a spike in the route and can throw off both.
const NAJSLABSA_SPREJEMLJIVA_NATANCNOST_M = 30;

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
  const insets = useSafeAreaInsets();

  // ── GPS & dovoljenja ──
  const [lokacija, setLokacija] = useState<Location.LocationObject | null>(null);
  const [sporocilNapake, setSporocilNapake] = useState<string | null>(null);
  const [nalaganje, setNalaganje] = useState(true);

  // ── Način ──
  const [nacin, setNacin] = useState<Nacin>('idle');
  useAmbientVariant(nacin === 'running' ? 'active' : 'default');

  // ── Stanje teka ──
  const [razdalja, setRazdalja] = useState(0);
  const [trajanje, setTrajanje] = useState(0);
  const [zacetniCas, setZacetniCas] = useState<number | null>(null);
  const [pot, setPot] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [shranjevanje, setShranjevanje] = useState(false);
  const [pavzirano, setPavzirano] = useState(false);
  // Ghost tek: izbran pred začetkom, velja za celoten tek, ki sledi — žrtvam
  // ukradenega ozemlja ne pošlje "pod napadom" obvestila (glej
  // claim_territory_from_run), tek sam in zaseg ozemlja pa potekata enako.
  const [duhTek, setDuhTek] = useState(false);

  // ── Reference ──
  const narocninaLokacije = useRef<Location.LocationSubscription | null>(null);
  const casovnikRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const zadnjaLokacijaRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const mirovanjeNarocnina = useRef<Location.LocationSubscription | null>(null);
  // Mirrors `razdalja` for the live-run notification's 1s interval tick,
  // which otherwise would only ever see the state as of effect setup.
  const razdaljaRef = useRef(0);
  // Same idea for `trajanje`, so pavza/nadaljevanje can report the latest
  // elapsed time to the lock-screen notification without depending on it.
  const trajanjeRef = useRef(0);
  // Mutable start time used for the elapsed-time math. Shifted forward on
  // resume by however long the pause lasted, so trajanje stays continuous
  // without touching the `zacetniCas` state (which would retrigger the
  // whole background-tracking effect below).
  const zacetniCasRef = useRef<number | null>(null);
  const pavziranoRef = useRef(false);
  const pavzaZacetekRef = useRef<number | null>(null);
  // Always-current ustaviTek/prekiniTek/nadaljujTek, so the notification's
  // actions (wired up once per run start) call the latest version without
  // retriggering the whole background-tracking effect every time
  // razdalja/trajanje change.
  const ustaviTekRef = useRef<() => void>(() => {});
  const prekiniTekRef = useRef<() => void>(() => {});
  const nadaljujTekRef = useRef<() => void>(() => {});

  // ── Modal po teku ──
  const [prikaziModalObjave, setPrikaziModalObjave] = useState(false);
  const [shranjenTek, setShranjenTek] = useState<Run | null>(null);
  const [zadnjiRezultatOzemlja, setZadnjiRezultatOzemlja] = useState<ClaimTerritoryResult | null>(null);
  const [zasluzeniKovanci, setZasluzeniKovanci] = useState(0);

  // ── Barva sledi ──
  const [barvaSled, setBarvaSled] = useState<string>(DEFAULT_TRAIL_COLOR);

  // ── Stanje tekmovanja ──
  const [teritoriji, setTeritorioji] = useState<TerritoryFeature[]>([]);
  const [teritorijiSkupin, setTeritorijiSkupin] = useState<GroupTerritoryFeature[]>([]);
  const [mojaPovrsina, setMojaPovrsina] = useState(0);
  const [uporabnikId, setUporabnikId] = useState<string>('');
  const [pogledOzemlja, setPogledOzemlja] = useState<'posamezniki' | 'skupine'>('posamezniki');
  const [mojeSkupineId, setMojeSkupineId] = useState<string[]>([]);
  const zadnjiOkvirRef = useRef<{ minLat: number; maxLat: number; minLng: number; maxLng: number } | null>(null);

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
  const dihalniPulz = useSharedValue(1);

  useEffect(() => {
    if (nacin === 'running' && !pavzirano) {
      dihalniPulz.value = withRepeat(
        withTiming(1.05, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      dihalniPulz.value = withTiming(1, { duration: 200 });
    }
  }, [nacin, pavzirano, dihalniPulz]);

  const statsBarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dihalniPulz.value }],
  }));

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
  // Ko se tek začne, ustavi mirovno sledenje in zažene sledenje lokaciji
  // prek ozadnega taska (services/locationTask), ki pošilja točke tudi,
  // če je zaslon zaklenjen ali je aplikacija v ozadju — telefon namreč
  // med tekom običajno ni ves čas odklenjen v roki. Če se ozadnje sledenje
  // iz kakršnegakoli razloga ne zažene (npr. dovoljenje zavrnjeno), pade
  // nazaj na navadno sledenje v ospredju, da tek vseeno deluje.
  useEffect(() => {
    if (!(nacin === 'running' && zacetniCas)) return;

    let aktiven = true;
    zacetniCasRef.current = zacetniCas;
    pavziranoRef.current = false;
    pavzaZacetekRef.current = null;
    setPavzirano(false);

    casovnikRef.current = setInterval(() => {
      if (pavziranoRef.current) return;
      const trajanjeSek = Math.floor((Date.now() - (zacetniCasRef.current ?? zacetniCas)) / 1000);
      setTrajanje(trajanjeSek);
      trajanjeRef.current = trajanjeSek;
      showLiveRunNotification({
        distanceLabel: razdaljaRef.current.toFixed(2),
        durationLabel: oblikujTrajanje(trajanjeSek),
        paceLabel: oblikujTempo(razdaljaRef.current, trajanjeSek),
      });
    }, 1000);

    // Takoj prikaži obvestilo (ne čakaj na prvi tik časovnika), da se
    // vmesnik na zaklenjenem zaslonu pojavi, brž ko se tek začne.
    showLiveRunNotification({ distanceLabel: '0.00', durationLabel: '0:00', paceLabel: '0:00' });
    const stopActionNarocnina = addStopRunActionListener(() => ustaviTekRef.current());
    const pauseActionNarocnina = addPauseRunActionListener(() => prekiniTekRef.current());
    const resumeActionNarocnina = addResumeRunActionListener(() => nadaljujTekRef.current());

    mirovanjeNarocnina.current?.remove();
    mirovanjeNarocnina.current = null;

    const obdelajNovoLokacijo = (novaLok: Location.LocationObject) => {
      if (!aktiven || pavziranoRef.current) return;
      const { latitude, longitude, accuracy } = novaLok.coords;
      if (accuracy != null && accuracy > NAJSLABSA_SPREJEMLJIVA_NATANCNOST_M) return;

      setLokacija(novaLok);

      if (zadnjaLokacijaRef.current) {
        const odsek = izracunajRazdaljo(
          zadnjaLokacijaRef.current.latitude,
          zadnjaLokacijaRef.current.longitude,
          latitude,
          longitude,
        );
        if (odsek < 0.1) {
          setRazdalja((prej) => prej + odsek);
          razdaljaRef.current += odsek;
        }
      }

      zadnjaLokacijaRef.current = { latitude, longitude };
      setPot((prej) => [...prej, { latitude, longitude }]);
    };

    setBackgroundLocationListener((lokacije) => lokacije.forEach(obdelajNovoLokacijo));
    startBackgroundLocationTracking().then((uspeh) => {
      if (!uspeh && aktiven) {
        // Ni uspelo (npr. dovoljenje zavrnjeno) – nadaljuj vsaj v ospredju.
        Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1500, distanceInterval: 2 },
          obdelajNovoLokacijo,
        ).then((nar) => { if (aktiven) narocninaLokacije.current = nar; else nar.remove(); });
      }
    });

    activateKeepAwakeAsync('zoneruns-tek');

    return () => {
      aktiven = false;
      casovnikRef.current && clearInterval(casovnikRef.current);
      casovnikRef.current = null;

      setBackgroundLocationListener(null);
      stopBackgroundLocationTracking();
      narocninaLokacije.current?.remove();
      narocninaLokacije.current = null;
      deactivateKeepAwake('zoneruns-tek');
      stopActionNarocnina.remove();
      pauseActionNarocnina.remove();
      resumeActionNarocnina.remove();
      dismissLiveRunNotification();

      if (!mirovanjeNarocnina.current) {
        Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 3000, distanceInterval: 2 },
          (lok) => setLokacija(lok),
        ).then((nar) => { mirovanjeNarocnina.current = nar; });
      }
    };
  }, [nacin, zacetniCas]);

  // ── Začni tek ──
  const zacniTek = useCallback(() => {
    setZacetniCas(Date.now());
    setRazdalja(0);
    razdaljaRef.current = 0;
    setTrajanje(0);
    trajanjeRef.current = 0;
    setPot([]);
    if (lokacija) {
      const { latitude, longitude } = lokacija.coords;
      zadnjaLokacijaRef.current = { latitude, longitude };
      setPot([{ latitude, longitude }]);
    }
    setNacin('running');
  }, [lokacija]);

  // ── Prikaži rezultat zasega ozemlja po teku ──
  const prikaziRezultatOzemlja = useCallback((rezultat: ClaimTerritoryResult) => {
    if (rezultat.success) {
      const ukradeno = rezultat.stolen ?? [];
      const skupajUkradeno = ukradeno.reduce((v, s) => v + s.area_m2, 0);
      let sporocilo = `Zaseženo ${formatArea(rezultat.claimed_area_m2 ?? 0)} ozemlja!`;
      if (ukradeno.length > 0) {
        const skupajObmocij = ukradeno.reduce((v, s) => v + (s.zones_lost ?? 0), 0);
        sporocilo += `\nOd tega ${formatArea(skupajUkradeno)} (${skupajObmocij} ${zoneWord(skupajObmocij)}) ukradenega ${
          ukradeno.length === 1 ? 'nasprotniku' : `od ${ukradeno.length} nasprotnikov`
        }.`;
      }
      Alert.alert('Ozemlje zaseženo! 🏴', sporocilo);
    } else if (rezultat.reason === 'loop_not_closed') {
      // Tiho – tek ni bil zanka, ni razloga za opozorilo ob vsakem teku
    } else if (rezultat.reason === 'daily_limit_reached') {
      Alert.alert('Že ste zasegli ozemlje danes', 'Zaseg ozemlja je mogoč enkrat na dan. Poskusite znova jutri.');
    }
  }, []);

  // ── Ustavi tek & shrani ──
  // Preveri minimalno trajanje, izračuna tempo in kalorije,
  // pripravi podatke o poti in shrani tek v bazo
  const ustaviTek = useCallback(async () => {
    setNacin('idle');

    if (trajanje < 5) {
      Alert.alert('Tek prekratek', 'Tecite vsaj nekaj sekund za shranitev.');
      setRazdalja(0); setTrajanje(0); setPot([]); setZacetniCas(null);
      zadnjaLokacijaRef.current = null;
      pavziranoRef.current = false;
      pavzaZacetekRef.current = null;
      setPavzirano(false);
      setDuhTek(false);
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

      // Teče vzporedno s shranjevanjem teka spodaj — brez API ključa (uporabi
      // že dovoljeno lokacijo naprave), zato lahko tiho spodleti brez posledic.
      const krajZasegaPromise = getPlaceLabel(podatkiPoti.startLocation ?? null);

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
        is_ghost: duhTek,
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

          // Poskusi zaseči ozemlje, če je pot sklenjena zanka
          const rezultatOzemlja = await claimTerritoryFromRun(rezultat.run.id, await krajZasegaPromise);
          prikaziRezultatOzemlja(rezultatOzemlja);

          // Če smo komu ukradli ozemlje, pošlji push "pod napadom" obvestilo
          // žrtvam (best-effort – attack_notifications vrstica že obstaja v
          // bazi ne glede na to, ali ta klic uspe).
          if (rezultatOzemlja.success && (rezultatOzemlja.stolen?.length ?? 0) > 0) {
            void notifyAttackVictims(rezultat.run.id);
          }

          setZadnjiRezultatOzemlja(rezultatOzemlja);
          setZasluzeniKovanci(coinsForDistance(rezultat.run.distance_km));
          setShranjenTek(rezultat.run);
          setPrikaziModalObjave(true);
        }

        if (rezultat.queued) {
          Alert.alert('Shranjeno brez povezave', 'Vaš tek se bo sinhroniziral, ko boste spet na spletu.');
        }

        setRazdalja(0); setTrajanje(0); setPot([]); setZacetniCas(null);
        zadnjaLokacijaRef.current = null;
        pavziranoRef.current = false;
        pavzaZacetekRef.current = null;
        setPavzirano(false);
        setDuhTek(false);
      } else {
        Alert.alert('Napaka', rezultat.error || 'Shranjevanje teka ni uspelo');
      }
    } catch (napaka) {
      console.error('Napaka pri ustavitvi teka:', napaka);
      Alert.alert('Napaka', 'Nekaj je šlo narobe pri shranjevanju teka.');
    } finally {
      setShranjevanje(false);
    }
  }, [trajanje, razdalja, pot, barvaSled, duhTek, prikaziRezultatOzemlja]);

  // ── Premor & nadaljevanje teka ──
  // Pavza samo ustavi časovnik/GPS obdelavo (prek pavziranoRef) — ozadnje
  // sledenje lokaciji teče naprej, da se ne podvaja zagon/ustavitev
  // ozadnega taska. Ob nadaljevanju premaknemo zacetniCasRef naprej za
  // trajanje premora, da trajanje ne "poskoči", in ponastavimo zadnjo
  // lokacijo, da prvi GPS popravek po premoru ne šteje kot prehojena pot.
  const prekiniTek = useCallback(() => {
    if (pavziranoRef.current) return;
    pavziranoRef.current = true;
    pavzaZacetekRef.current = Date.now();
    setPavzirano(true);
    setLiveRunPlaybackState(true);
    showLiveRunNotification(
      {
        distanceLabel: razdaljaRef.current.toFixed(2),
        durationLabel: oblikujTrajanje(trajanjeRef.current),
        paceLabel: oblikujTempo(razdaljaRef.current, trajanjeRef.current),
      },
      { paused: true },
    );
  }, []);

  const nadaljujTek = useCallback(() => {
    if (!pavziranoRef.current) return;
    if (pavzaZacetekRef.current != null) {
      const odmikPavze = Date.now() - pavzaZacetekRef.current;
      if (zacetniCasRef.current != null) zacetniCasRef.current += odmikPavze;
      pavzaZacetekRef.current = null;
    }
    zadnjaLokacijaRef.current = null;
    pavziranoRef.current = false;
    setPavzirano(false);
    setLiveRunPlaybackState(false);
    showLiveRunNotification({
      distanceLabel: razdaljaRef.current.toFixed(2),
      durationLabel: oblikujTrajanje(trajanjeRef.current),
      paceLabel: oblikujTempo(razdaljaRef.current, trajanjeRef.current),
    });
  }, []);

  useEffect(() => {
    ustaviTekRef.current = ustaviTek;
    prekiniTekRef.current = prekiniTek;
    nadaljujTekRef.current = nadaljujTek;
  }, [ustaviTek, prekiniTek, nadaljujTek]);

  // ── Naloži ozemlja za trenutni pogled zemljevida ──
  // Zapomni si zadnji okvir, da lahko preklopiOzemljaPogled znova naloži
  // podatke za nov način (posamezniki/skupine), ne da bi čakali, da uporabnik
  // znova premakne karto.
  const naloziOzemljaVOkviru = useCallback(
    async (minLat: number, maxLat: number, minLng: number, maxLng: number) => {
      zadnjiOkvirRef.current = { minLat, maxLat, minLng, maxLng };
      if (pogledOzemlja === 'skupine') {
        const podatki = await getGroupTerritoriesInBounds(minLat, minLng, maxLat, maxLng);
        setTeritorijiSkupin(podatki);
      } else {
        const podatki = await getTerritoriesInBounds(minLat, minLng, maxLat, maxLng);
        setTeritorioji(podatki);
      }
    },
    [pogledOzemlja],
  );

  // ── Preklopi med pogledom "posamezniki" in "skupine" na karti ozemelj ──
  const preklopiPogledOzemlja = useCallback(
    (novPogled: 'posamezniki' | 'skupine') => {
      setPogledOzemlja(novPogled);
      const okvir = zadnjiOkvirRef.current;
      if (!okvir) return;
      if (novPogled === 'skupine') {
        getGroupTerritoriesInBounds(okvir.minLat, okvir.minLng, okvir.maxLat, okvir.maxLng).then(setTeritorijiSkupin);
      } else {
        getTerritoriesInBounds(okvir.minLat, okvir.minLng, okvir.maxLat, okvir.maxLng).then(setTeritorioji);
      }
    },
    [],
  );

  // ── Vstopi v način tekmovanja ──
  const obdelajTekmovanje = useCallback(async () => {
    setNacin('compete');
    setPogledOzemlja('posamezniki');

    const [{ areaM2 }, rezultatSkupin] = await Promise.all([getMyTerritoryStats(), getMyGroups()]);
    setMojaPovrsina(areaM2);
    setMojeSkupineId(rezultatSkupin.success ? (rezultatSkupin.groups ?? []).map((s) => s.id) : []);

    if (lokacija) {
      const { latitude: la, longitude: lo } = lokacija.coords;
      const zamik = 0.01; // ~1km okvir ob vstopu, dokler karta ne sporoči natančnega pogleda
      await naloziOzemljaVOkviru(la - zamik, la + zamik, lo - zamik, lo + zamik);
    }
  }, [lokacija, naloziOzemljaVOkviru]);

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
  const zankaPripravljena = nacin === 'running' && isLoopReady(pot);

  // ── Stanja nalaganja / napake ──
  if (nalaganje) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" color={AuroraColors.primary} />
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
          <IconSymbol name="exclamationmark.triangle.fill" size={48} color={AuroraColors.primary} />
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
        <View style={[styles.header, Shadows.card, { paddingTop: insets.top + Spacing.sm }]}>
          <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFillObject} />
          <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.headerTint]} />
          <View style={styles.headerContent}>
            <View style={styles.headerTitleRow}>
              <TouchableOpacity onPress={() => setNacin('idle')} style={styles.backBtn}>
                <IconSymbol name="chevron.left" size={22} color={AuroraColors.primary} />
              </TouchableOpacity>
              <IconSymbol name="hexagon.fill" size={26} color={AuroraColors.primary} />
              <ThemedText type="h3">Ozemlje</ThemedText>
            </View>
          </View>

          <View style={styles.tileBadge}>
            <StatBlock
              stats={[
                { value: formatArea(mojaPovrsina), label: 'vaše ozemlje' },
              ]}
            />
            <View style={styles.colorDotRow}>
              <View style={[styles.colorDot, { backgroundColor: barvaSled }]} />
              <ThemedText type="caption" variant="muted">vaša barva</ThemedText>
            </View>
          </View>

          <View style={styles.segmentedWrap}>
            <SegmentedControl
              segments={[
                { key: 'posamezniki', label: 'Posamezniki' },
                { key: 'skupine', label: 'Skupine' },
              ]}
              value={pogledOzemlja}
              onChange={(key) => preklopiPogledOzemlja(key as 'posamezniki' | 'skupine')}
            />
          </View>
        </View>

        {pogledOzemlja === 'skupine' ? (
          <TerritoryMap
            latitude={latitude}
            longitude={longitude}
            colors={Colors.dark}
            trailColor={barvaSled}
            territories={teritorijiSkupin.map((t) => ({
              user_id: t.group_id,
              username: t.name,
              display_name: null,
              trail_color: t.color,
              area_m2: t.area_m2,
              geojson: t.geojson,
            }))}
            highlightIds={mojeSkupineId}
            mode="group"
            onBoundsChanged={naloziOzemljaVOkviru}
          />
        ) : (
          <TerritoryMap
            latitude={latitude}
            longitude={longitude}
            colors={Colors.dark}
            trailColor={barvaSled}
            territories={teritoriji}
            highlightIds={uporabnikId ? [uporabnikId] : []}
            mode="individual"
            onBoundsChanged={naloziOzemljaVOkviru}
          />
        )}
      </ThemedView>
    );
  }

  // ══════════════════════════════════════════════════════════
  // ── MIROVANJE + TEK POGLED ──
  // ══════════════════════════════════════════════════════════
  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, Shadows.card, { paddingTop: insets.top + Spacing.sm }]}>
        <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.headerTint]} />
        <View style={styles.headerContent}>
          <View style={styles.headerTitleRow}>
            <IconSymbol name="figure.run" size={28} color={AuroraColors.primary} />
            <ThemedText type="h3">Run Tracker</ThemedText>
          </View>
        </View>

        {nacin === 'running' && (
          <Animated.View style={[styles.statsBar, Shadows.glowPrimary, statsBarAnimatedStyle]}>
            <StatBlock
              stats={[
                { value: razdalja.toFixed(2), label: 'km' },
                { value: oblikujTrajanje(trajanje), label: 'čas' },
                { value: tempo, label: 'tempo/km' },
              ]}
            />
          </Animated.View>
        )}

        {nacin === 'running' && (
          <View
            style={[
              styles.loopHint,
              zankaPripravljena ? styles.loopHintReady : styles.loopHintWaiting,
            ]}>
            <IconSymbol
              name={zankaPripravljena ? 'checkmark.circle.fill' : 'link'}
              size={14}
              color={zankaPripravljena ? AuroraColors.onPrimary : AuroraColors.textMuted}
            />
            <ThemedText
              type="caption"
              lightColor={zankaPripravljena ? AuroraColors.onPrimary : undefined}
              darkColor={zankaPripravljena ? AuroraColors.onPrimary : undefined}
              variant={zankaPripravljena ? undefined : 'muted'}>
              {zankaPripravljena
                ? 'Zanka sklenjena – ustavite za zaseg ozemlja!'
                : 'Tecite nazaj proti začetku, da sklenete zanko'}
            </ThemedText>
          </View>
        )}
      </View>

      <RunningMap
        latitude={latitude}
        longitude={longitude}
        colors={Colors.dark}
        route={pot}
        isRunning={nacin === 'running'}
        trailColor={barvaSled}
      />

      <View
        style={[
          styles.controlPanel,
          {
            // Floating tab bar sits on top of content rather than reserving its
            // own layout space — clear it so Start/Stop never sit underneath it.
            paddingBottom: TAB_BAR_HEIGHT + insets.bottom + Spacing.lg,
          },
        ]}>
        <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFillObject} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.headerTint]} />
        {nacin === 'idle' ? (
          <>
            <TouchableOpacity
              onPress={() => setDuhTek((v) => !v)}
              style={[styles.ghostToggle, duhTek ? styles.ghostToggleActive : styles.ghostToggleInactive]}>
              <IconSymbol
                name="ghost.fill"
                size={16}
                color={duhTek ? AuroraColors.onPrimary : AuroraColors.textMuted}
              />
              <ThemedText
                type="caption"
                lightColor={duhTek ? AuroraColors.onPrimary : undefined}
                darkColor={duhTek ? AuroraColors.onPrimary : undefined}
                variant={duhTek ? undefined : 'muted'}>
                {duhTek ? 'Ghost tek — žrtve ne bodo obveščene' : 'Ghost tek'}
              </ThemedText>
            </TouchableOpacity>
            <View style={styles.buttonRow}>
              <GradientButton
                label="Začni tek"
                icon="play.fill"
                onPress={zacniTek}
                variant="primary"
                style={{ flex: 1 }}
              />
              <GradientButton
                label="Tekmuj"
                icon="hexagon.fill"
                onPress={obdelajTekmovanje}
                variant="outline"
              />
            </View>
          </>
        ) : (
          <View style={styles.buttonRow}>
            <GradientButton
              label={pavzirano ? 'Nadaljuj' : 'Premor'}
              icon={pavzirano ? 'play.fill' : 'pause.fill'}
              onPress={pavzirano ? nadaljujTek : prekiniTek}
              variant="primary"
              disabled={shranjevanje}
              style={{ flex: 1 }}
            />
            <GradientButton
              label={shranjevanje ? 'Shranjevanje...' : 'Ustavi & shrani'}
              icon="stop.fill"
              onPress={ustaviTek}
              variant="danger"
              disabled={shranjevanje}
              style={{ flex: 1 }}
            />
          </View>
        )}
      </View>

      <PostRunModal
        visible={prikaziModalObjave}
        run={shranjenTek}
        territoryResult={zadnjiRezultatOzemlja}
        coinsEarned={zasluzeniKovanci}
        onClose={() => {
          setPrikaziModalObjave(false);
          setShranjenTek(null);
          setZadnjiRezultatOzemlja(null);
          setZasluzeniKovanci(0);
        }}
        onPost={() => {}}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.md,
  },
  header: {
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: AuroraColors.border,
  },
  headerTint: {
    backgroundColor: AuroraColors.surface,
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
  segmentedWrap: {
    marginTop: Spacing.sm,
  },
  statsBar: {
    borderRadius: 16,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    marginTop: Spacing.sm,
    backgroundColor: AuroraColors.surfaceSolid,
    borderWidth: 1,
    borderColor: AuroraColors.primary,
  },
  loopHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderRadius: 9999,
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm,
    marginTop: Spacing.sm,
  },
  loopHintReady: {
    backgroundColor: AuroraColors.primary,
  },
  loopHintWaiting: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: AuroraColors.border,
  },
  tileBadge: {
    borderRadius: 16,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    marginTop: Spacing.sm,
    backgroundColor: AuroraColors.surfaceSolid,
  },
  colorDotRow: {
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  colorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginBottom: 4,
  },
  controlPanel: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderTopColor: AuroraColors.border,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  ghostToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderRadius: 9999,
    paddingVertical: 10,
    marginBottom: Spacing.sm,
  },
  ghostToggleActive: {
    backgroundColor: AuroraColors.textMuted,
  },
  ghostToggleInactive: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: AuroraColors.border,
  },
});
