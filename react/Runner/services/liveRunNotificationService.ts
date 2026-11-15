/**
 * Live run lock-screen controls — a real media-session notification that
 * shows while a run is being tracked, on the lock screen itself, the same
 * surface Spotify uses for its Now Playing card. It mirrors the in-app
 * stats (distance/time/pace/hex tiles crossed) and exposes Play/Pause
 * (pause/resume the run) and Stop (stop & save) controls without needing to
 * unlock the phone. Crossing into a new hex tile flashes a one-off
 * celebratory title (see `buildTitle`) instead of the usual stats.
 *
 * Two completely separate native paths, chosen per-platform:
 *
 * - Android: react-native-track-player (MediaStyle notification). Its JS
 *   entry touches the native module at *import time* on any non-Android
 *   platform (`new NativeEventEmitter(TrackPlayer)`), which crashes on
 *   iOS before the Platform check below even runs — so the library is
 *   never `require`d outside this Android branch (see also index.js, which
 *   guards the module's own static import the same way).
 * - iOS: a small local native module (`modules/live-run-now-playing`,
 *   Swift) wrapping MPNowPlayingInfoCenter/MPRemoteCommandCenter directly.
 *   react-native-track-player doesn't support iOS under the New
 *   Architecture (newArchEnabled is on for this app) — confirmed still true
 *   at the latest published version (4.1.2) as of writing; even its
 *   Android side needed the native patch in
 *   patches/react-native-track-player+4.1.2.patch to work under New
 *   Architecture, so patching its iOS internals blind (unverifiable from
 *   this Windows dev machine, no Xcode) was judged riskier than a small
 *   purpose-built module.
 *
 * Both paths use the same trick: a silent, looping "track"/audio buffer is
 * kept "playing" the whole run just to hold a live media session open —
 * only the metadata (title/artist) is what the user actually sees/hears
 * (nothing, since it's silent). Pressing the system Play/Pause/Stop button
 * controls the *run* (via the listeners below), not just the silent audio.
 */
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

const IS_ANDROID = Platform.OS === 'android';
const IS_IOS = Platform.OS === 'ios';

/** Lazy + Android-only so the native module is never touched on iOS. */
function trackPlayerModule(): typeof import('react-native-track-player') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- must stay lazy, not a static import
  return require('react-native-track-player');
}

type LiveRunNowPlayingEvents = {
  onRemotePlay: () => void;
  onRemotePause: () => void;
  onRemoteStop: () => void;
};

// Hand-written rather than extending expo-modules-core's NativeModule<T>: that
// generic is erased in its public .d.ts (the alias body references the bare
// `EventsMap` instead of the `TEventsMap` type param), so `addListener` below
// would otherwise type as untyped/non-existent regardless of what's passed.
type LiveRunNowPlayingModule = {
  activate(): Promise<void>;
  updateNowPlaying(title: string, artist: string, paused: boolean): Promise<void>;
  setPaused(paused: boolean): Promise<void>;
  deactivate(): Promise<void>;
  addListener<EventName extends keyof LiveRunNowPlayingEvents>(
    eventName: EventName,
    listener: LiveRunNowPlayingEvents[EventName],
  ): { remove: () => void };
};

/** Lazily resolved + memoized; `null` on Android or if the native module isn't linked. */
let iosModule: LiveRunNowPlayingModule | null | undefined;
function nowPlayingModule(): LiveRunNowPlayingModule | null {
  if (iosModule === undefined) {
    iosModule = IS_IOS
      ? requireOptionalNativeModule<LiveRunNowPlayingModule>('LiveRunNowPlaying')
      : null;
  }
  return iosModule;
}

let iosListenersReady = false;
/** Forwards the native module's remote-command events into the same listener sets Android uses. */
function ensureIosListeners(mod: LiveRunNowPlayingModule) {
  if (iosListenersReady) return;
  iosListenersReady = true;
  mod.addListener('onRemotePlay', () => resumeListeners.forEach((cb) => cb()));
  mod.addListener('onRemotePause', () => pauseListeners.forEach((cb) => cb()));
  mod.addListener('onRemoteStop', () => stopListeners.forEach((cb) => cb()));
}

const SILENT_TRACK_ID = 'zoneruns-live-run';

type Listener = () => void;
const stopListeners = new Set<Listener>();
const pauseListeners = new Set<Listener>();
const resumeListeners = new Set<Listener>();

function addListener(set: Set<Listener>, cb: Listener) {
  set.add(cb);
  return { remove: () => set.delete(cb) };
}

/** Fires when the user presses the lock-screen/notification "Stop" control. */
export function addStopRunActionListener(onStop: Listener) {
  return addListener(stopListeners, onStop);
}

/** Fires when the user presses the lock-screen/notification "Pause" control. */
export function addPauseRunActionListener(onPause: Listener) {
  return addListener(pauseListeners, onPause);
}

/** Fires when the user presses the lock-screen/notification "Play/Resume" control. */
export function addResumeRunActionListener(onResume: Listener) {
  return addListener(resumeListeners, onResume);
}

let setupDone = false;
let trackLoaded = false;

/**
 * One-time player + media-session setup. Exported as the registered
 * playback service too (see index.js) so Android can re-run it to restore
 * the remote-control listeners if it ever has to cold-start the headless JS
 * task for this player (e.g. after the app process died while the run's
 * foreground service was still alive).
 */
async function ensureSetup(): Promise<void> {
  if (!IS_ANDROID || setupDone) return;
  setupDone = true;

  try {
    const { default: TrackPlayer, AppKilledPlaybackBehavior, Capability, Event } = trackPlayerModule();

    // autoUpdateMetadata (RNTP default: true) re-syncs the OS now-playing
    // display from the track's own metadata whenever playback state changes
    // (e.g. pressing Pause), clobbering the live-stats overlay below with
    // the track's original add()-time title/artist. Off, since this
    // overlay is the only thing that should ever drive the display.
    await TrackPlayer.setupPlayer({ autoUpdateMetadata: false });
    await TrackPlayer.updateOptions({
      capabilities: [Capability.Play, Capability.Pause, Capability.Stop],
      compactCapabilities: [Capability.Play, Capability.Pause, Capability.Stop],
      notificationCapabilities: [Capability.Play, Capability.Pause, Capability.Stop],
      android: {
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
      },
    });

    TrackPlayer.addEventListener(Event.RemotePlay, () => {
      TrackPlayer.play().catch(() => {});
      resumeListeners.forEach((cb) => cb());
    });
    TrackPlayer.addEventListener(Event.RemotePause, () => {
      TrackPlayer.pause().catch(() => {});
      pauseListeners.forEach((cb) => cb());
    });
    TrackPlayer.addEventListener(Event.RemoteStop, () => {
      stopListeners.forEach((cb) => cb());
    });
  } catch (e) {
    setupDone = false; // allow retry on the next run start
    console.warn('ensureSetup exception:', e);
  }
}

/** Registered as the TrackPlayer playback service in index.js. */
export const lockScreenPlaybackService = ensureSetup;

export type LiveRunStats = {
  distanceLabel: string;
  durationLabel: string;
  paceLabel: string;
  /** Unique hex tiles the GPS trail has crossed into so far this run. */
  hexCount: number;
};

/**
 * Picks the lock-screen title for the given stats/moment. `justCaptured` is
 * only ever passed for the single notification update fired the instant a
 * new hex is crossed (see index.tsx) — the regular 1s ticker overwrites it
 * right back to the normal title within a second either way, so this reads
 * as a brief celebratory flash without needing its own revert timer.
 */
function buildTitle(stats: LiveRunStats, opts?: { paused?: boolean; justCaptured?: boolean }): string {
  if (opts?.justCaptured) {
    return stats.hexCount > 0 && stats.hexCount % 10 === 0
      ? `🔥 ${stats.hexCount} hexes captured! Insane!`
      : `🆕 New hex! (${stats.hexCount} total)`;
  }
  if (opts?.paused) return `⏸ Paused · ${stats.hexCount} hexes`;
  return `🔶 ${stats.hexCount} hexes · ⏱ ${stats.durationLabel}`;
}

/** Posts (or updates in place) the ongoing live-run media notification. */
export async function showLiveRunNotification(
  stats: LiveRunStats,
  opts?: { paused?: boolean; justCaptured?: boolean },
): Promise<void> {
  if (IS_ANDROID) {
    try {
      await ensureSetup();
      const { default: TrackPlayer, RepeatMode } = trackPlayerModule();

      if (!trackLoaded) {
        trackLoaded = true;
        await TrackPlayer.add({
          id: SILENT_TRACK_ID,
          // Silent loop that only exists to keep the media session alive —
          // the metadata below is the actual user-facing content.
          url: require('../assets/audio/silence.wav'),
          artwork: require('../assets/images/icon.png'),
          title: 'ZoneRuns',
          artist: 'Run in progress',
          isLiveStream: true,
        });
        await TrackPlayer.setRepeatMode(RepeatMode.Track);
        await TrackPlayer.play();
      }

      // Lightweight metadata overlay — unlike updateMetadataForTrack(), this
      // doesn't replace the underlying player item, so it doesn't trigger a
      // brief reload/buffering transition on every tick.
      await TrackPlayer.updateNowPlayingMetadata({
        title: buildTitle(stats, opts),
        artist: `${stats.distanceLabel} km   ·   ${stats.paceLabel} min/km`,
        isLiveStream: true,
      });
    } catch (e) {
      console.warn('showLiveRunNotification exception:', e);
    }
    return;
  }

  try {
    const mod = nowPlayingModule();
    if (!mod) return;

    ensureIosListeners(mod);
    await mod.activate();
    await mod.updateNowPlaying(
      buildTitle(stats, opts),
      `${stats.distanceLabel} km   ·   ${stats.paceLabel} min/km`,
      !!opts?.paused,
    );
  } catch (e) {
    console.warn('showLiveRunNotification (iOS) exception:', e);
  }
}

/** Keeps the lock-screen Play/Pause icon in sync when pause/resume happens from in-app UI. */
export async function setLiveRunPlaybackState(paused: boolean): Promise<void> {
  if (IS_ANDROID) {
    try {
      if (!trackLoaded) return;
      const { default: TrackPlayer } = trackPlayerModule();
      await (paused ? TrackPlayer.pause() : TrackPlayer.play());
    } catch (e) {
      console.warn('setLiveRunPlaybackState exception:', e);
    }
    return;
  }

  try {
    await nowPlayingModule()?.setPaused(paused);
  } catch (e) {
    console.warn('setLiveRunPlaybackState (iOS) exception:', e);
  }
}

export async function dismissLiveRunNotification(): Promise<void> {
  if (IS_ANDROID) {
    try {
      trackLoaded = false;
      const { default: TrackPlayer } = trackPlayerModule();
      await TrackPlayer.reset();
    } catch (e) {
      console.warn('dismissLiveRunNotification exception:', e);
    }
    return;
  }

  try {
    await nowPlayingModule()?.deactivate();
  } catch (e) {
    console.warn('dismissLiveRunNotification (iOS) exception:', e);
  }
}
