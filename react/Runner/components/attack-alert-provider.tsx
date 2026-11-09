/**
 * Global "under attack" banner — mounted once at the app root (inside
 * AuthGuard, so a session already exists). Owns both delivery paths:
 * the realtime subscription that drives this in-app banner (instant,
 * no setup needed) and push-token registration so the same event can
 * also reach a backgrounded app once Expo push is actually wired up
 * (see services/notificationsService.ts's header comment).
 */
import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { GlassCard } from '@/components/ui/glass-card';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { AuroraColors, Spacing } from '@/constants/theme';
import { supabase, AttackNotification } from '@/services/supabase';
import {
  configureNotificationHandler,
  registerForAttackPushNotifications,
  subscribeToAttackNotifications,
  unsubscribeFromAttackNotifications,
  addAttackNotificationResponseListener,
  formatAttackMessage,
} from '@/services/notificationsService';

const AUTO_DISMISS_MS = 6000;

export function AttackAlertProvider({ children }: PropsWithChildren) {
  const [queue, setQueue] = useState<AttackNotification[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const userIdRef = useRef<string | null>(null);
  const router = useRouter();

  const enqueue = useCallback((row: AttackNotification) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    setQueue((q) => [...q, row]);
  }, []);

  const goToCompete = useCallback(() => {
    router.push('/(tabs)');
  }, [router]);

  useEffect(() => {
    configureNotificationHandler();

    const teardown = () => {
      if (channelRef.current) {
        unsubscribeFromAttackNotifications(channelRef.current);
        channelRef.current = null;
      }
    };

    const setupForUser = (userId: string) => {
      registerForAttackPushNotifications(userId);
      channelRef.current = subscribeToAttackNotifications(userId, enqueue);
    };

    // Dedup against onAuthStateChange firing an immediate INITIAL_SESSION
    // event (same id getSession() below already handled) and against
    // routine TOKEN_REFRESHED events (same id, shouldn't re-subscribe).
    const applySession = (userId: string | null) => {
      if (userId === userIdRef.current) return;
      userIdRef.current = userId;
      teardown();
      if (userId) setupForUser(userId);
    };

    supabase.auth.getSession().then(({ data }) => applySession(data.session?.user?.id ?? null));

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session?.user?.id ?? null);
    });

    const tapSub = addAttackNotificationResponseListener(goToCompete);

    return () => {
      teardown();
      tapSub.remove();
      authListener.subscription.unsubscribe();
    };
  }, [enqueue, goToCompete]);

  const dismissTop = useCallback(() => {
    setQueue((q) => q.slice(1));
  }, []);

  const current = queue[0];

  return (
    <>
      {children}
      {current && (
        <AttackBanner
          key={current.id}
          notification={current}
          onDismiss={dismissTop}
          onPress={() => {
            dismissTop();
            goToCompete();
          }}
        />
      )}
    </>
  );
}

function AttackBanner({
  notification,
  onDismiss,
  onPress,
}: {
  notification: AttackNotification;
  onDismiss: () => void;
  onPress: () => void;
}) {
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });

    const timer = setTimeout(() => {
      progress.value = withTiming(0, { duration: 220, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(onDismiss)();
      });
    }, AUTO_DISMISS_MS);

    return () => clearTimeout(timer);
    // Intentionally once per mount (banner is re-keyed per notification id by the parent).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * -24 }],
  }));

  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + Spacing.sm }, animatedStyle]}>
      <GlassCard onPress={onPress} padding={Spacing.sm + 2}>
        <View style={styles.row}>
          <View style={styles.iconBadge}>
            <IconSymbol name="exclamationmark.triangle.fill" size={18} color={AuroraColors.danger} />
          </View>
          <View style={styles.textCol}>
            <ThemedText type="bodyBold" style={{ color: AuroraColors.danger }}>
              Pod napadom!
            </ThemedText>
            <ThemedText type="bodySmall" variant="secondary">
              {formatAttackMessage(notification)}
            </ThemedText>
          </View>
          <Pressable onPress={onDismiss} hitSlop={10}>
            <IconSymbol name="xmark" size={16} color={AuroraColors.textMuted} />
          </Pressable>
        </View>
      </GlassCard>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    zIndex: 999,
    elevation: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(217, 96, 59, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
});
