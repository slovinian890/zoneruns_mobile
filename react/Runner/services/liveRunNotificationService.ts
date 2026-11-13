/**
 * Live run lock-screen controls — a real media-session notification (Android
 * MediaStyle, iOS Now Playing Center once this project has an ios/ project)
 * that shows while a run is being tracked, on the lock screen itself, the
 * same surface Spotify uses for its Now Playing card. It mirrors the in-app
 * stats (distance/time/pace) and exposes Play/Pause (pause/resume the run)
 * and Stop (stop & save) controls without needing to unlock the phone.
 *
 * react-native-track-player is built for audio apps, so a silent looping
 * track is kept "playing" the whole run just to hold a live media session
 * open — only its metadata (title/artist/artwork) is what the user actually
 * sees; the track itself is never meant to be heard. Pressing the system
 * Play/Pause button pauses/resumes the *run* (via the listeners below), not
 * just the silent audio.
 */
import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  Event,
  RepeatMode,
} from 'react-native-track-player';

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
  if (setupDone) return;
  setupDone = true;

  try {
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
};

/** Posts (or updates in place) the ongoing live-run media notification. */
export async function showLiveRunNotification(
  stats: LiveRunStats,
  opts?: { paused?: boolean },
): Promise<void> {
  try {
    await ensureSetup();

    if (!trackLoaded) {
      trackLoaded = true;
      await TrackPlayer.add({
        id: SILENT_TRACK_ID,
        // Silent loop that only exists to keep the media session alive —
        // the metadata below is the actual user-facing content.
        url: require('../assets/audio/silence.wav'),
        artwork: require('../assets/images/icon.png'),
        title: 'ZoneRuns',
        artist: 'Tek v teku',
        isLiveStream: true,
      });
      await TrackPlayer.setRepeatMode(RepeatMode.Track);
      await TrackPlayer.play();
    }

    // Lightweight metadata overlay — unlike updateMetadataForTrack(), this
    // doesn't replace the underlying player item, so it doesn't trigger a
    // brief reload/buffering transition on every tick.
    await TrackPlayer.updateNowPlayingMetadata({
      title: opts?.paused
        ? `Tek v premoru · ${stats.distanceLabel} km`
        : `Tek teče · ${stats.distanceLabel} km`,
      artist: `${stats.durationLabel}   ·   ${stats.paceLabel} min/km`,
      isLiveStream: true,
    });
  } catch (e) {
    console.warn('showLiveRunNotification exception:', e);
  }
}

/** Keeps the lock-screen Play/Pause icon in sync when pause/resume happens from in-app UI. */
export async function setLiveRunPlaybackState(paused: boolean): Promise<void> {
  try {
    if (!trackLoaded) return;
    await (paused ? TrackPlayer.pause() : TrackPlayer.play());
  } catch (e) {
    console.warn('setLiveRunPlaybackState exception:', e);
  }
}

export async function dismissLiveRunNotification(): Promise<void> {
  try {
    trackLoaded = false;
    await TrackPlayer.reset();
  } catch (e) {
    console.warn('dismissLiveRunNotification exception:', e);
  }
}
