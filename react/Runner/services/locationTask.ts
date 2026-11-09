/**
 * Background GPS task – keeps recording a run's route while the app is
 * backgrounded or the screen is locked (phone in a pocket/armband).
 *
 * `TaskManager.defineTask` must run at module scope, before anything else,
 * so Android/iOS can wake the task even when the app wasn't in the
 * foreground. It's imported once from the root layout for that reason —
 * importing it lazily from inside a screen would register it too late for
 * background-launched callbacks.
 */
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

export const LOCATION_TASK_NAME = 'zoneruns-background-location';

type LocationListener = (locations: Location.LocationObject[]) => void;

let listener: LocationListener | null = null;

/** The active run screen calls this to receive points as they arrive. */
export function setBackgroundLocationListener(fn: LocationListener | null) {
  listener = fn;
}

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.warn('Napaka pri sledenju lokaciji v ozadju:', error.message);
    return;
  }
  const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
  if (locations?.length) listener?.(locations);
});

export async function startBackgroundLocationTracking(): Promise<boolean> {
  try {
    const already = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (already) return true;

    // Best-effort: on Android 11+ this routes the user to system settings
    // rather than an in-app dialog, and may not resolve "granted" even when
    // the foreground-service start below still works. Never block on it.
    await Location.requestBackgroundPermissionsAsync().catch(() => null);

    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 1500,
      distanceInterval: 2,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'ZoneRuns teče',
        notificationBody: 'Sledenje vaši poti teka …',
      },
    });
    return true;
  } catch (e) {
    console.warn('startBackgroundLocationTracking exception:', e);
    return false;
  }
}

export async function stopBackgroundLocationTracking(): Promise<void> {
  try {
    const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    if (started) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch (e) {
    console.warn('stopBackgroundLocationTracking exception:', e);
  }
}
