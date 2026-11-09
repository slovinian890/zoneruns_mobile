/**
 * "Under attack" notifications — push + realtime.
 *
 * Layered on top of the attack_notifications table (see
 * supabase/migrations/009_attack_notifications.sql), which is the source
 * of truth: a row is written transactionally inside claim_territory_from_run
 * the moment a run steals territory, independent of anything in this file.
 *
 * Two delivery paths read that same row:
 *  - Realtime (subscribeToAttackNotifications) — instant, but only while
 *    the victim's app is open and connected. Needs no setup.
 *  - Push (registerForAttackPushNotifications + the send-attack-push Edge
 *    Function) — reaches a closed/backgrounded app, but needs FCM
 *    (Android) / APNs (iOS) credentials configured in EAS before Expo can
 *    actually deliver anything.
 */
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, AttackNotification } from './supabase';
import { getCurrentUser } from './authService';

const ATTACK_CHANNEL_ID = 'attacks';

/**
 * Foreground notifications are muted visually (the app shows its own
 * banner instead, via the realtime subscription below) but still play a
 * sound — the OS banner/list only matters when the app isn't frontmost,
 * which this handler doesn't affect.
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ATTACK_CHANNEL_ID, {
    name: 'Napadi na ozemlje',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#D9603B',
    sound: 'default',
  });
}

/**
 * Request permission, grab an Expo push token, and upsert it. Safe to call
 * on every app start — cheap no-op if already registered, and silently
 * gives up (returns null) if permission is denied or the device/emulator
 * can't produce a token, rather than throwing.
 */
export async function registerForAttackPushNotifications(userId: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  try {
    await ensureAndroidChannel();

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let status = existingStatus;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const tokenResponse = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const token = tokenResponse.data;

    await supabase
      .from('push_tokens')
      .upsert({ user_id: userId, token, platform: Platform.OS, updated_at: new Date().toISOString() }, { onConflict: 'token' });

    return token;
  } catch (e) {
    console.warn('registerForAttackPushNotifications exception:', e);
    return null;
  }
}

/** Fire-and-forget: ask the Edge Function to push every victim of this run. */
export async function notifyAttackVictims(runId: string): Promise<void> {
  try {
    await supabase.functions.invoke('send-attack-push', { body: { run_id: runId } });
  } catch (e) {
    console.warn('notifyAttackVictims exception:', e);
  }
}

/** Subscribe to new attacks against the current user, while the app is open. */
export function subscribeToAttackNotifications(
  userId: string,
  onAttack: (row: AttackNotification) => void,
): RealtimeChannel {
  return supabase
    .channel(`attack_notifications:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'attack_notifications', filter: `victim_id=eq.${userId}` },
      (payload) => onAttack(payload.new as AttackNotification),
    )
    .subscribe();
}

export function unsubscribeFromAttackNotifications(channel: RealtimeChannel): void {
  supabase.removeChannel(channel);
}

/** Recent attacks against the current user (e.g. to replay any missed while offline). */
export async function getRecentAttackNotifications(limit: number = 20): Promise<AttackNotification[]> {
  try {
    const user = await getCurrentUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('attack_notifications')
      .select('*')
      .eq('victim_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return [];
    return data ?? [];
  } catch {
    return [];
  }
}

export async function markAttackNotificationsRead(): Promise<void> {
  try {
    const user = await getCurrentUser();
    if (!user) return;

    await supabase
      .from('attack_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('victim_id', user.id)
      .is('read_at', null);
  } catch (e) {
    console.warn('markAttackNotificationsRead exception:', e);
  }
}

/** Fires when the user taps a push notification (app was backgrounded/killed). */
export function addAttackNotificationResponseListener(onTap: () => void): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as { type?: string } | undefined;
    if (data?.type === 'attack') onTap();
  });
}

/**
 * Best-effort reverse geocode of where a loop closed, for "near X" in the
 * attack message. Uses the device's native geocoder (no API key, already
 * covered by the location permission this app already asks for) — so it
 * can fail quietly (no network, no Play services on some emulators) and
 * the message just drops the place clause.
 */
export async function getPlaceLabel(coord?: { latitude: number; longitude: number } | null): Promise<string | null> {
  if (!coord) return null;
  try {
    const results = await Location.reverseGeocodeAsync(coord);
    const r = results[0];
    if (!r) return null;
    // A leading digit usually means `name` is just a street number, not a
    // landmark — fall back to the street/district/city in that case.
    const candidate = r.name && !/^\d/.test(r.name) ? r.name : null;
    return candidate ?? r.street ?? r.district ?? r.city ?? null;
  } catch (e) {
    console.warn('getPlaceLabel exception:', e);
    return null;
  }
}

/**
 * Slovenian noun case for "zone(s)" — matches supabase/functions/send-attack-push.
 * Correct for 1-19 (the realistic range); compound numbers like 21/22 would
 * need the last-digit rule too, not worth it for how this game plays out.
 */
export function zoneWord(n: number): string {
  if (n === 1) return 'območje';
  if (n === 2) return 'območji';
  if (n === 3 || n === 4) return 'območja';
  return 'območij';
}

export function formatAttackMessage(row: AttackNotification): string {
  const name = row.attacker_display_name || row.attacker_username || 'Nekdo';
  const n = row.zones_lost ?? 1;
  const placeClause = row.place_label ? ` blizu ${row.place_label}` : '';
  return `${name} vam je pravkar vzel ${n} ${zoneWord(n)}${placeClause}!`;
}
