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
import * as Haptics from 'expo-haptics';
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
import HexBattleMap from '@/components/hex-battle-map';
import HexActionModal from '@/components/hex-action-modal';
import BountyAmountModal from '@/components/bounty-amount-modal';
import { createRun, secondsToInterval, calculatePace } from '@/services/runsService';
import { updateUserStatsAfterRun, checkAndAwardAchievements, getCurrentUserStats } from '@/services/statsService';
import { getCurrentUser } from '@/services/authService';
import { Run, RouteData, HexCell, GroupTerritoryFeature, ClaimTerritoryResult, MyActiveGroup } from '@/services/supabase';
import { getGroupTerritoriesInBounds, getMyGroups, getMyActiveGroup } from '@/services/groupsService';
import PostRunModal from '@/components/post-run-modal';
import { getTrailColor, DEFAULT_TRAIL_COLOR } from '@/services/trailColorService';
import { Colors } from '@/constants/theme';
import {
  getHexesInBounds,
  claimTerritoryFromRun,
  getMyTerritoryStats,
  isLoopReady,
  formatArea,
  fortifyHex,
  placeBounty,
  cancelMyBounty,
  hexCellKey,
  latLngToHexCell,
  isHexAlly,
  HexCellId,
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
import { useFocusEffect, useRouter } from 'expo-router';

// GPS fixes worse than this (meters) are dropped instead of being drawn into
// the trail or counted toward distance / loop closure — a bad single fix
// otherwise shows up as a spike in the route and can throw off both.
const NAJSLABSA_SPREJEMLJIVA_NATANCNOST_M = 30;

// ── Haversine formula for calculating distance (km) between two GPS points ──
// Uses Earth's radius (6371 km) and trigonometric functions for an accurate
// distance calculation across the sphere's surface
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

function sporociloZaNapakoPolja(reason?: string): string {
  switch (reason) {
    case 'not_owner':
      return "This hex isn't yours.";
    case 'max_level':
      return 'This hex is already fully fortified.';
    case 'insufficient_coins':
      return "You don't have enough coins.";
    default:
      return 'Something went wrong.';
  }
}

function sporociloZaNapakoNagrade(reason?: string): string {
  switch (reason) {
    case 'invalid_target':
      return 'You can only place a bounty on hexes claimed by opponents.';
    case 'insufficient_coins':
      return "You don't have enough coins.";
    case 'amount_too_small':
      return 'The amount is too small for the number of hexes selected.';
    default:
      return 'Something went wrong.';
  }
}

// ── View modes ──
type Nacin = 'idle' | 'running' | 'compete';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const usmerjevalnik = useRouter();

  // ── GPS & permissions ──
  const [lokacija, setLokacija] = useState<Location.LocationObject | null>(null);
  const [sporocilNapake, setSporocilNapake] = useState<string | null>(null);
  const [nalaganje, setNalaganje] = useState(true);

  // ── Mode ──
  const [nacin, setNacin] = useState<Nacin>('idle');
  useAmbientVariant(nacin === 'running' ? 'active' : 'default');

  // ── Run state ──
  const [razdalja, setRazdalja] = useState(0);
  const [trajanje, setTrajanje] = useState(0);
  const [zacetniCas, setZacetniCas] = useState<number | null>(null);
  const [pot, setPot] = useState<Array<{ latitude: number; longitude: number }>>([]);
  const [shranjevanje, setShranjevanje] = useState(false);
  const [pavzirano, setPavzirano] = useState(false);
  // Count of unique hex cells the GPS trail has already crossed this run —
  // just a live "feel" during the run, not the actual capture (that happens
  // only in ustaviTek via claim_territory_from_run on a closed loop).
  const [steviloPrecrtanihPolj, setSteviloPrecrtanihPolj] = useState(0);
  // Ghost run: chosen before starting, applies to the whole run that follows —
  // doesn't send an "under attack" notification to victims of stolen territory
  // (see claim_territory_from_run); the run itself and the capture still work the same.
  const [duhTek, setDuhTek] = useState(false);
  // Whether Ghost Run has already been used today (see migrations/
  // 019_ghost_run_daily_limit.sql) — refreshed on focus. Starts false
  // (optimistic) so the toggle isn't wrongly disabled before the fetch resolves.
  const [duhTekZeUporabljenDanes, setDuhTekZeUporabljenDanes] = useState(false);

  // ── Refs ──
  const narocninaLokacije = useRef<Location.LocationSubscription | null>(null);
  const casovnikRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const zadnjaLokacijaRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const mirovanjeNarocnina = useRef<Location.LocationSubscription | null>(null);
  // Mirrors `razdalja` for the live-run notification's 1s interval tick,
  // which otherwise would only ever see the state as of effect setup.
  const razdaljaRef = useRef(0);
  // Set of "col,row" hex keys crossed so far this run (see hexCellKey) —
  // a ref because it's mutated on every GPS tick and read inside the
  // notification's 1s interval without needing either to re-render on its
  // own. steviloPrecrtanihPoljRef mirrors its size for that same interval,
  // same pattern as razdaljaRef/trajanjeRef below.
  const precrtanaPoljaRef = useRef<Set<string>>(new Set());
  const steviloPrecrtanihPoljRef = useRef(0);
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

  // ── Post-run modal ──
  const [prikaziModalObjave, setPrikaziModalObjave] = useState(false);
  const [shranjenTek, setShranjenTek] = useState<Run | null>(null);
  const [zadnjiRezultatOzemlja, setZadnjiRezultatOzemlja] = useState<ClaimTerritoryResult | null>(null);
  const [zasluzeniKovanci, setZasluzeniKovanci] = useState(0);

  // ── Trail color ──
  const [barvaSled, setBarvaSled] = useState<string>(DEFAULT_TRAIL_COLOR);

  // ── Competition state ──
  const [hexCelice, setHexCelice] = useState<HexCell[]>([]);
  const [teritorijiSkupin, setTeritorijiSkupin] = useState<GroupTerritoryFeature[]>([]);
  const [mojaPovrsina, setMojaPovrsina] = useState(0);
  const [uporabnikId, setUporabnikId] = useState<string>('');
  const [pogledOzemlja, setPogledOzemlja] = useState<'posamezniki' | 'skupine'>('posamezniki');
  const [mojeSkupineId, setMojeSkupineId] = useState<string[]>([]);
  // The clan (if any) your runs currently claim/heal hexes for — see
  // set_active_group / migrations/017_clan_hex_warfare.sql. Null = solo.
  const [mojKlan, setMojKlan] = useState<MyActiveGroup | null>(null);
  const zadnjiOkvirRef = useRef<{ minLat: number; maxLat: number; minLng: number; maxLng: number } | null>(null);

  // ── Fortify & bounty on the competition map ──
  const [mojiKovanci, setMojiKovanci] = useState(0);
  const [nacinIzbire, setNacinIzbire] = useState(false);
  const [izbranaPoljaNagrade, setIzbranaPoljaNagrade] = useState<HexCellId[]>([]);
  const [aktivnoPolje, setAktivnoPolje] = useState<HexCell | null>(null);
  const [prikaziModalPolja, setPrikaziModalPolja] = useState(false);
  const [prikaziModalNagrade, setPrikaziModalNagrade] = useState(false);
  const [obdelavaPolja, setObdelavaPolja] = useState(false);

  // ── Load user data & trail color on focus ──
  useFocusEffect(
    useCallback(() => {
      getTrailColor().then(setBarvaSled);
      getCurrentUser().then((u) => {
        if (u) setUporabnikId(u.id);
      });
      getMyActiveGroup().then(setMojKlan);
      getCurrentUserStats().then((rezultat) => {
        const danes = new Date().toISOString().split('T')[0];
        setDuhTekZeUporabljenDanes(!!rezultat.success && rezultat.stats?.last_ghost_run_date === danes);
      });
    }, []),
  );

  // ── Breathing animation for the active timer ──
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

  // ── Continuous location tracking while idle ──
  // Requests permissions, checks services, and starts watching GPS position
  useEffect(() => {
    let preklicano = false;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setSporocilNapake('Location access permission was denied');
          setNalaganje(false);
          return;
        }

        const omogoceno = await Location.hasServicesEnabledAsync();
        if (!omogoceno) {
          setSporocilNapake('Please enable location services in your device settings');
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
          setSporocilNapake('Error getting your location — check that GPS is turned on');
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

  // ── Timer + live GPS tracking during a run ──
  // When the run starts, stops idle tracking and starts location tracking
  // via the background task (services/locationTask), which keeps sending
  // points even when the screen is locked or the app is backgrounded — the
  // phone usually isn't unlocked in hand the whole run. If background
  // tracking fails to start for any reason (e.g. permission denied), it
  // falls back to regular foreground tracking so the run still works.
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
        hexCount: steviloPrecrtanihPoljRef.current,
      });
    }, 1000);

    // Show the notification immediately (don't wait for the timer's first
    // tick) so the lock-screen UI appears as soon as the run starts.
    showLiveRunNotification({ distanceLabel: '0.00', durationLabel: '0:00', paceLabel: '0:00', hexCount: 0 });
    const stopActionNarocnina = addStopRunActionListener(() => ustaviTekRef.current());
    const pauseActionNarocnina = addPauseRunActionListener(() => prekiniTekRef.current());
    const resumeActionNarocnina = addResumeRunActionListener(() => nadaljujTekRef.current());

    mirovanjeNarocnina.current?.remove();
    mirovanjeNarocnina.current = null;

    // A new hex cell was just crossed for the first time this run — update
    // the count and immediately (don't wait for the next 1s tick) flash the
    // lock screen + a light haptic, so the sense of progress comes through
    // even without looking at the phone. The next regular tick within ~1s
    // overwrites it back to the normal display anyway, so no separate
    // revert timer is needed.
    const oznaciPoljeKotPrecrtano = (lat: number, lng: number) => {
      const kljucPolja = hexCellKey(latLngToHexCell(lat, lng));
      if (precrtanaPoljaRef.current.has(kljucPolja)) return;
      precrtanaPoljaRef.current.add(kljucPolja);
      const novoStevilo = precrtanaPoljaRef.current.size;
      steviloPrecrtanihPoljRef.current = novoStevilo;
      setSteviloPrecrtanihPolj(novoStevilo);

      const jeMejnik = novoStevilo > 0 && novoStevilo % 10 === 0;
      if (jeMejnik) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }

      showLiveRunNotification(
        {
          distanceLabel: razdaljaRef.current.toFixed(2),
          durationLabel: oblikujTrajanje(trajanjeRef.current),
          paceLabel: oblikujTempo(razdaljaRef.current, trajanjeRef.current),
          hexCount: novoStevilo,
        },
        { justCaptured: true },
      );
    };

    const obdelajNovoLokacijo = (novaLok: Location.LocationObject) => {
      if (!aktiven || pavziranoRef.current) return;
      const { latitude, longitude, accuracy } = novaLok.coords;
      if (accuracy != null && accuracy > NAJSLABSA_SPREJEMLJIVA_NATANCNOST_M) return;

      setLokacija(novaLok);

      // Trusted point: the run's first point, or a segment small enough that
      // it isn't a GPS jump — same criterion used for counting distance below,
      // so one wild jump doesn't "cross" a hex far from the actual route.
      let zanesljivaTocka = !zadnjaLokacijaRef.current;

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
          zanesljivaTocka = true;
        }
      }

      if (zanesljivaTocka) oznaciPoljeKotPrecrtano(latitude, longitude);

      zadnjaLokacijaRef.current = { latitude, longitude };
      setPot((prej) => [...prej, { latitude, longitude }]);
    };

    setBackgroundLocationListener((lokacije) => lokacije.forEach(obdelajNovoLokacijo));
    startBackgroundLocationTracking().then((uspeh) => {
      if (!uspeh && aktiven) {
        // Failed to start (e.g. permission denied) – continue in the foreground at least.
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

  // ── Start run ──
  const zacniTek = useCallback(() => {
    setZacetniCas(Date.now());
    setRazdalja(0);
    razdaljaRef.current = 0;
    setTrajanje(0);
    trajanjeRef.current = 0;
    setPot([]);
    precrtanaPoljaRef.current = new Set();
    steviloPrecrtanihPoljRef.current = 0;
    setSteviloPrecrtanihPolj(0);
    if (lokacija) {
      const { latitude, longitude } = lokacija.coords;
      zadnjaLokacijaRef.current = { latitude, longitude };
      setPot([{ latitude, longitude }]);
    }
    setNacin('running');
  }, [lokacija]);

  // ── Show territory-claim result after a run ──
  // zahtevanGhost is whether the player had Ghost Run toggled on for this
  // run (passed in rather than closed over, since Ghost Run only actually
  // applied if rezultat.ghost_active also came back true — see
  // migrations/019_ghost_run_daily_limit.sql).
  const prikaziRezultatOzemlja = useCallback((rezultat: ClaimTerritoryResult, zahtevanGhost: boolean) => {
    if (rezultat.success) {
      const ukradeno = rezultat.stolen ?? [];
      const skupajUkradeno = ukradeno.reduce((v, s) => v + s.area_m2, 0);
      let sporocilo = `Claimed ${formatArea(rezultat.claimed_area_m2 ?? 0)} of territory!`;
      if (ukradeno.length > 0) {
        const skupajObmocij = ukradeno.reduce((v, s) => v + (s.zones_lost ?? 0), 0);
        sporocilo += `\nOf that, ${formatArea(skupajUkradeno)} (${skupajObmocij} ${zoneWord(skupajObmocij)}) cleared from ${
          ukradeno.length === 1 ? 'an opponent' : `${ukradeno.length} opponents`
        } — now unclaimed.`;
      }
      if (rezultat.bounty_earned) {
        sporocilo += `\n+${rezultat.bounty_earned} bounty coins for hexes cleared! 🎯`;
      }
      if (rezultat.night_bonus) {
        sporocilo += `\n🌙 Night run bonus — new cells captured at +2 levels!`;
      }
      if (zahtevanGhost && !rezultat.ghost_active) {
        sporocilo += `\n👻 Ghost run was already used today — this steal was visible to your victims.`;
      }
      Alert.alert('Territory claimed! 🏴', sporocilo);
    } else if (rezultat.reason === 'loop_not_closed') {
      // Silent – the run wasn't a loop, no reason to warn on every run
    } else if (rezultat.reason === 'daily_limit_reached') {
      Alert.alert('You already claimed territory today', 'Territory can only be claimed once a day. Try again tomorrow.');
    }
  }, []);

  // ── Stop run & save ──
  // Checks minimum duration, calculates pace and calories,
  // prepares route data, and saves the run to the database
  const ustaviTek = useCallback(async () => {
    setNacin('idle');

    if (trajanje < 5) {
      Alert.alert('Run too short', 'Run for at least a few seconds to save it.');
      setRazdalja(0); setTrajanje(0); setPot([]); setZacetniCas(null);
      zadnjaLokacijaRef.current = null;
      pavziranoRef.current = false;
      pavzaZacetekRef.current = null;
      setPavzirano(false);
      setDuhTek(false);
      precrtanaPoljaRef.current = new Set();
      steviloPrecrtanihPoljRef.current = 0;
      setSteviloPrecrtanihPolj(0);
      return;
    }

    setShranjevanje(true);

    try {
      const uporabnik = await getCurrentUser();
      if (!uporabnik) {
        Alert.alert('Error', 'Please sign in to save your run');
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

      // Runs in parallel with saving the run below — no API key (uses the
      // device's already-granted location), so it can silently fail with no consequences.
      const krajZasegaPromise = getPlaceLabel(podatkiPoti.startLocation ?? null);

      const zdaj = new Date();
      const casTekaOblikovan = `${zdaj.getHours().toString().padStart(2, '0')}:${zdaj.getMinutes().toString().padStart(2, '0')}:${zdaj.getSeconds().toString().padStart(2, '0')}`;

      const rezultat = await createRun({
        title: `Run – ${zdaj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`,
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
              Alert.alert('Achievement unlocked! 🏆', noveDosezki.map((d) => d.title).join(', '));
            }
          }

          // Try to claim territory if the route is a closed loop
          const rezultatOzemlja = await claimTerritoryFromRun(rezultat.run.id, await krajZasegaPromise);
          prikaziRezultatOzemlja(rezultatOzemlja, duhTek);
          if (rezultatOzemlja.ghost_active) setDuhTekZeUporabljenDanes(true);

          // If we stole territory from someone, send a push "under attack"
          // notification to the victims (best-effort – the attack_notifications
          // row already exists in the DB regardless of whether this call succeeds).
          if (rezultatOzemlja.success && (rezultatOzemlja.stolen?.length ?? 0) > 0) {
            void notifyAttackVictims(rezultat.run.id);
          }

          setZadnjiRezultatOzemlja(rezultatOzemlja);
          setZasluzeniKovanci(coinsForDistance(rezultat.run.distance_km));
          setShranjenTek(rezultat.run);
          setPrikaziModalObjave(true);
        }

        if (rezultat.queued) {
          Alert.alert('Saved offline', "Your run will sync once you're back online.");
        }

        setRazdalja(0); setTrajanje(0); setPot([]); setZacetniCas(null);
        zadnjaLokacijaRef.current = null;
        pavziranoRef.current = false;
        pavzaZacetekRef.current = null;
        setPavzirano(false);
        setDuhTek(false);
        precrtanaPoljaRef.current = new Set();
        steviloPrecrtanihPoljRef.current = 0;
        setSteviloPrecrtanihPolj(0);
      } else {
        Alert.alert('Error', rezultat.error || 'Failed to save run');
      }
    } catch (napaka) {
      console.error('Error stopping run:', napaka);
      Alert.alert('Error', 'Something went wrong while saving your run.');
    } finally {
      setShranjevanje(false);
    }
  }, [trajanje, razdalja, pot, barvaSled, duhTek, prikaziRezultatOzemlja]);

  // ── Pause & resume run ──
  // Pausing only stops the timer/GPS processing (via pavziranoRef) — background
  // location tracking keeps running, so the background task doesn't get
  // started/stopped twice. On resume, we shift zacetniCasRef forward by the
  // pause duration so the duration doesn't "jump", and reset the last location
  // so the first GPS fix after resuming doesn't count as covered distance.
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
        hexCount: steviloPrecrtanihPoljRef.current,
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
      hexCount: steviloPrecrtanihPoljRef.current,
    });
  }, []);

  useEffect(() => {
    ustaviTekRef.current = ustaviTek;
    prekiniTekRef.current = prekiniTek;
    nadaljujTekRef.current = nadaljujTek;
  }, [ustaviTek, prekiniTek, nadaljujTek]);

  // ── Load territories for the current map view ──
  // Remembers the last bounds so preklopiPogledOzemlja can reload data for the
  // new mode (solo/groups) immediately, without waiting for the user to pan
  // the map again.
  const naloziOzemljaVOkviru = useCallback(
    async (minLat: number, maxLat: number, minLng: number, maxLng: number) => {
      zadnjiOkvirRef.current = { minLat, maxLat, minLng, maxLng };
      if (pogledOzemlja === 'skupine') {
        const podatki = await getGroupTerritoriesInBounds(minLat, minLng, maxLat, maxLng);
        setTeritorijiSkupin(podatki);
      } else {
        const podatki = await getHexesInBounds(minLat, minLng, maxLat, maxLng);
        setHexCelice(podatki);
      }
    },
    [pogledOzemlja],
  );

  // Reload hexes for the current bounds — called after fortify/bounty, since
  // the level/bounty on the map change without the map being panned.
  const osveziHexCelice = useCallback(async () => {
    const okvir = zadnjiOkvirRef.current;
    if (!okvir) return;
    const podatki = await getHexesInBounds(okvir.minLat, okvir.minLng, okvir.maxLat, okvir.maxLng);
    setHexCelice(podatki);
  }, []);

  const osveziMojeKovance = useCallback(async () => {
    const rezultat = await getCurrentUserStats();
    if (rezultat.success && rezultat.stats) setMojiKovanci(rezultat.stats.coins ?? 0);
  }, []);

  // ── Toggle between "solo" and "groups" view on the territory map ──
  const preklopiPogledOzemlja = useCallback(
    (novPogled: 'posamezniki' | 'skupine') => {
      setPogledOzemlja(novPogled);
      const okvir = zadnjiOkvirRef.current;
      if (!okvir) return;
      if (novPogled === 'skupine') {
        getGroupTerritoriesInBounds(okvir.minLat, okvir.minLng, okvir.maxLat, okvir.maxLng).then(setTeritorijiSkupin);
      } else {
        getHexesInBounds(okvir.minLat, okvir.minLng, okvir.maxLat, okvir.maxLng).then(setHexCelice);
      }
    },
    [],
  );

  // ── Enter competition mode ──
  const obdelajTekmovanje = useCallback(async () => {
    setNacin('compete');
    setPogledOzemlja('posamezniki');
    setNacinIzbire(false);
    setIzbranaPoljaNagrade([]);

    const [{ areaM2 }, rezultatSkupin] = await Promise.all([getMyTerritoryStats(), getMyGroups()]);
    setMojaPovrsina(areaM2);
    setMojeSkupineId(rezultatSkupin.success ? (rezultatSkupin.groups ?? []).map((s) => s.id) : []);
    void osveziMojeKovance();

    if (lokacija) {
      const { latitude: la, longitude: lo } = lokacija.coords;
      const zamik = 0.01; // ~1km bounds on entry, until the map reports its exact view
      const okvir = { minLat: la - zamik, maxLat: la + zamik, minLng: lo - zamik, maxLng: lo + zamik };
      // Fetches hexes directly rather than going through naloziOzemljaVOkviru —
      // that callback closes over whatever pogledOzemlja *was* on the last
      // render, which can still be 'skupine' here (the setPogledOzemlja above
      // hasn't committed yet), so it would briefly fetch group territories
      // into the wrong state slot instead of the hexes just claimed by the
      // run the player likely just finished.
      zadnjiOkvirRef.current = okvir;
      const podatki = await getHexesInBounds(okvir.minLat, okvir.minLng, okvir.maxLat, okvir.maxLng);
      setHexCelice(podatki);
    }
  }, [lokacija, osveziMojeKovance]);

  // ── Hex tap on the battle map ──
  const obdelajDotikPolja = useCallback(
    (celica: HexCell) => {
      const jeSovraznik = !!celica.userId && !isHexAlly(celica.userId, celica.ownerGroupId, uporabnikId, mojKlan?.group_id ?? null);
      if (nacinIzbire && jeSovraznik) {
        setIzbranaPoljaNagrade((prej) => {
          const key = hexCellKey({ col: celica.hexCol, row: celica.hexRow });
          const obstaja = prej.some((h) => hexCellKey(h) === key);
          if (obstaja) return prej.filter((h) => hexCellKey(h) !== key);
          if (prej.length >= 20) return prej;
          return [...prej, { col: celica.hexCol, row: celica.hexRow }];
        });
        return;
      }
      setAktivnoPolje(celica);
      setPrikaziModalPolja(true);
    },
    [nacinIzbire, uporabnikId, mojKlan],
  );

  const preklopiNacinIzbire = useCallback(() => {
    setNacinIzbire((prej) => {
      if (prej) setIzbranaPoljaNagrade([]);
      return !prej;
    });
  }, []);

  const obdelajUtrditev = useCallback(async () => {
    if (!aktivnoPolje) return;
    setObdelavaPolja(true);
    const rezultat = await fortifyHex(aktivnoPolje.hexCol, aktivnoPolje.hexRow);
    setObdelavaPolja(false);
    if (rezultat.success) {
      setPrikaziModalPolja(false);
      setAktivnoPolje(null);
      Alert.alert('Hex fortified! 🛡️', `Defense level now ${rezultat.new_level}/5 (−${rezultat.cost} coins).`);
      await Promise.all([osveziHexCelice(), osveziMojeKovance()]);
    } else {
      Alert.alert('Fortify failed', sporociloZaNapakoPolja(rezultat.reason));
    }
  }, [aktivnoPolje, osveziHexCelice, osveziMojeKovance]);

  const obdelajPreklicNagrade = useCallback(async () => {
    if (!aktivnoPolje) return;
    setObdelavaPolja(true);
    const rezultat = await cancelMyBounty(aktivnoPolje.hexCol, aktivnoPolje.hexRow);
    setObdelavaPolja(false);
    if (rezultat.success) {
      setPrikaziModalPolja(false);
      setAktivnoPolje(null);
      Alert.alert('Bounty canceled', `Refunded ${rezultat.refunded} coins.`);
      await Promise.all([osveziHexCelice(), osveziMojeKovance()]);
    } else {
      Alert.alert('Error', 'Failed to cancel bounty.');
    }
  }, [aktivnoPolje, osveziHexCelice, osveziMojeKovance]);

  const obdelajZacetekNagrade = useCallback(() => {
    if (!aktivnoPolje) return;
    setIzbranaPoljaNagrade([{ col: aktivnoPolje.hexCol, row: aktivnoPolje.hexRow }]);
    setPrikaziModalPolja(false);
    setPrikaziModalNagrade(true);
  }, [aktivnoPolje]);

  const obdelajPotrditevNagrade = useCallback(
    async (znesek: number) => {
      setObdelavaPolja(true);
      const rezultat = await placeBounty(izbranaPoljaNagrade, znesek);
      setObdelavaPolja(false);
      if (rezultat.success) {
        setPrikaziModalNagrade(false);
        setIzbranaPoljaNagrade([]);
        setNacinIzbire(false);
        Alert.alert(
          'Bounty placed! 🎯',
          `${rezultat.per_hex_amount} coins on each of ${rezultat.hex_count} hexes (${rezultat.total_charged} total).`,
        );
        await Promise.all([osveziHexCelice(), osveziMojeKovance()]);
      } else {
        Alert.alert('Bounty failed', sporociloZaNapakoNagrade(rezultat.reason));
      }
    },
    [izbranaPoljaNagrade, osveziHexCelice, osveziMojeKovance],
  );

  // ── Formatters ──
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

  // ── Loading / error states ──
  if (nalaganje) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" color={AuroraColors.primary} />
          <ThemedText type="body" variant="secondary" style={{ marginTop: Spacing.md }}>
            Getting your location...
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
  // ── COMPETITION VIEW ──
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
              <ThemedText type="h3">Territory</ThemedText>
            </View>
          </View>

          <View style={styles.tileBadge}>
            <StatBlock
              stats={[
                { value: formatArea(mojaPovrsina), label: 'your territory' },
                ...(pogledOzemlja === 'posamezniki' ? [{ value: String(mojiKovanci), label: 'coins' }] : []),
              ]}
            />
            <View style={styles.colorDotRow}>
              <View style={[styles.colorDot, { backgroundColor: barvaSled }]} />
              <ThemedText type="caption" variant="muted">your color</ThemedText>
            </View>
            {!!mojKlan && (
              <TouchableOpacity onPress={() => usmerjevalnik.push('/groups')} style={styles.clanRow} activeOpacity={0.7}>
                <View style={[styles.clanDot, { backgroundColor: mojKlan.color }]} />
                <ThemedText type="caption" variant="muted">running for {mojKlan.name}</ThemedText>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.segmentedWrap}>
            <SegmentedControl
              segments={[
                { key: 'posamezniki', label: 'Solo' },
                { key: 'skupine', label: 'Groups' },
              ]}
              value={pogledOzemlja}
              onChange={(key) => preklopiPogledOzemlja(key as 'posamezniki' | 'skupine')}
            />
          </View>

          {pogledOzemlja === 'posamezniki' && (
            <TouchableOpacity
              onPress={preklopiNacinIzbire}
              style={[styles.ghostToggle, nacinIzbire ? styles.ghostToggleActive : styles.ghostToggleInactive, { marginTop: Spacing.sm, marginBottom: 0 }]}>
              <IconSymbol name="bounty.fill" size={14} color={nacinIzbire ? AuroraColors.onPrimary : AuroraColors.textMuted} />
              <ThemedText
                type="caption"
                lightColor={nacinIzbire ? AuroraColors.onPrimary : undefined}
                darkColor={nacinIzbire ? AuroraColors.onPrimary : undefined}
                variant={nacinIzbire ? undefined : 'muted'}>
                {nacinIzbire ? `Selecting hexes for bounty (${izbranaPoljaNagrade.length})` : 'Select hexes for bounty'}
              </ThemedText>
            </TouchableOpacity>
          )}
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
          <HexBattleMap
            latitude={latitude}
            longitude={longitude}
            colors={Colors.dark}
            myUserId={uporabnikId}
            myGroupId={mojKlan?.group_id ?? null}
            cells={hexCelice}
            selected={izbranaPoljaNagrade}
            onBoundsChanged={naloziOzemljaVOkviru}
            onHexTap={obdelajDotikPolja}
          />
        )}

        {pogledOzemlja === 'posamezniki' && nacinIzbire && izbranaPoljaNagrade.length > 0 && (
          <View style={[styles.selectionBar, { paddingBottom: insets.bottom + Spacing.md }]}>
            <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFillObject} />
            <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, styles.headerTint]} />
            <ThemedText type="bodyBold">{izbranaPoljaNagrade.length} hexes selected</ThemedText>
            <GradientButton
              label="Set bounty"
              icon="bounty.fill"
              onPress={() => setPrikaziModalNagrade(true)}
              variant="primary"
            />
          </View>
        )}

        <HexActionModal
          visible={prikaziModalPolja}
          cell={aktivnoPolje}
          myUserId={uporabnikId}
          myGroupId={mojKlan?.group_id ?? null}
          myCoins={mojiKovanci}
          busy={obdelavaPolja}
          onClose={() => { setPrikaziModalPolja(false); setAktivnoPolje(null); }}
          onFortify={obdelajUtrditev}
          onStartBounty={obdelajZacetekNagrade}
          onCancelBounty={obdelajPreklicNagrade}
        />

        <BountyAmountModal
          visible={prikaziModalNagrade}
          hexes={izbranaPoljaNagrade}
          myCoins={mojiKovanci}
          busy={obdelavaPolja}
          onClose={() => setPrikaziModalNagrade(false)}
          onConfirm={obdelajPotrditevNagrade}
        />
      </ThemedView>
    );
  }

  // ══════════════════════════════════════════════════════════
  // ── IDLE + RUN VIEW ──
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
                { value: oblikujTrajanje(trajanje), label: 'time' },
                { value: tempo, label: 'pace/km' },
                { value: String(steviloPrecrtanihPolj), label: 'hexes' },
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
                ? 'Loop closed — stop to claim territory!'
                : 'Run back toward your start to close the loop'}
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
            {!!mojKlan && (
              <TouchableOpacity onPress={() => usmerjevalnik.push('/groups')} style={styles.clanRunningForRow} activeOpacity={0.7}>
                <View style={[styles.clanDot, { backgroundColor: mojKlan.color }]} />
                <ThemedText type="caption" variant="muted">Running for {mojKlan.name} — tap to switch</ThemedText>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => setDuhTek((v) => !v)}
              disabled={duhTekZeUporabljenDanes}
              style={[
                styles.ghostToggle,
                duhTek ? styles.ghostToggleActive : styles.ghostToggleInactive,
                duhTekZeUporabljenDanes && styles.ghostToggleDisabled,
              ]}>
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
                {duhTekZeUporabljenDanes
                  ? 'Ghost run already used today'
                  : duhTek ? "Ghost run — victims won't be notified" : 'Ghost run'}
              </ThemedText>
            </TouchableOpacity>
            <View style={styles.buttonRow}>
              <GradientButton
                label="Start run"
                icon="play.fill"
                onPress={zacniTek}
                variant="primary"
                style={{ flex: 1 }}
              />
              <GradientButton
                label="Compete"
                icon="hexagon.fill"
                onPress={obdelajTekmovanje}
                variant="outline"
              />
            </View>
          </>
        ) : (
          <View style={styles.buttonRow}>
            <GradientButton
              label={pavzirano ? 'Resume' : 'Pause'}
              icon={pavzirano ? 'play.fill' : 'pause.fill'}
              onPress={pavzirano ? nadaljujTek : prekiniTek}
              variant="primary"
              disabled={shranjevanje}
              style={{ flex: 1 }}
            />
            <GradientButton
              label={shranjevanje ? 'Saving...' : 'Stop & save'}
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
  clanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.sm,
  },
  clanDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  clanRunningForRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
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
  ghostToggleDisabled: {
    opacity: 0.5,
  },
  selectionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderTopColor: AuroraColors.border,
  },
});
