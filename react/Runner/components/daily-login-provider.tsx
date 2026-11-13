/**
 * Daily login coin bonus — mounted once at the app root (inside AuthGuard,
 * so a session already exists). Claims the reward once per cold start via
 * claim_daily_login() (see services/coinsService.ts), which itself only
 * pays out once per calendar day server-side — so re-mounting (Fast
 * Refresh, navigating back into the tree) never double-claims, and neither
 * does a second device open the same day.
 */
import { useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassCard } from '@/components/ui/glass-card';
import { ThemedText } from '@/components/themed-text';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { AuroraColors, Spacing } from '@/constants/theme';
import { supabase } from '@/services/supabase';
import { claimDailyLogin, besedaZaKovance } from '@/services/coinsService';

const AUTO_DISMISS_MS = 5000;

interface Reward {
  coins: number;
  streak: number;
}

export function DailyLoginProvider({ children }: PropsWithChildren) {
  const [reward, setReward] = useState<Reward | null>(null);
  const claimedForUserRef = useRef<string | null>(null);

  const claimFor = useCallback(async (userId: string) => {
    if (claimedForUserRef.current === userId) return;
    claimedForUserRef.current = userId;
    const result = await claimDailyLogin();
    if (result.success && result.coins_awarded) {
      setReward({ coins: result.coins_awarded, streak: result.streak ?? 1 });
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id;
      if (uid) claimFor(uid);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id;
      if (uid) claimFor(uid);
      else claimedForUserRef.current = null;
    });

    return () => authListener.subscription.unsubscribe();
  }, [claimFor]);

  const dismiss = useCallback(() => setReward(null), []);

  return (
    <>
      {children}
      {reward && <DailyLoginBanner reward={reward} onDismiss={dismiss} />}
    </>
  );
}

function DailyLoginBanner({ reward, onDismiss }: { reward: Reward; onDismiss: () => void }) {
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
    // Intentionally once per mount (banner only ever shows once per cold start).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * -24 }],
  }));

  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + Spacing.sm }, animatedStyle]}>
      <GlassCard onPress={onDismiss} padding={Spacing.sm + 2}>
        <View style={styles.row}>
          <View style={styles.iconBadge}>
            <IconSymbol name="coins.fill" size={18} color={AuroraColors.accentAmber} />
          </View>
          <View style={styles.textCol}>
            <ThemedText type="bodyBold" style={{ color: AuroraColors.accentAmber }}>
              +{reward.coins} {besedaZaKovance(reward.coins)}
            </ThemedText>
            <ThemedText type="bodySmall" variant="secondary">
              Dnevna nagrada · {reward.streak}. dan zapored
            </ThemedText>
          </View>
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
    backgroundColor: AuroraColors.accentAmber + '26', // ~15% opacity, same convention as theme.ts's '80' suffix
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
});
