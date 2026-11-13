/**
 * Capture replay — a short animated reveal of a run's real captured
 * polygon (reuses HexTerritoryPreview, now drawing the actual shape, not
 * the old made-up hex clusters) with a share button on the same
 * ViewShot + expo-sharing path already proven in post-run-modal.tsx.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { GlassCard } from '@/components/ui/glass-card';
import { StatBlock } from '@/components/ui/stat-block';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { HexTerritoryPreview } from '@/components/hex-territory-preview';
import { AuroraColors, Spacing } from '@/constants/theme';
import { getRun, intervalToSeconds } from '@/services/runsService';
import { isLoopReady } from '@/services/territoryService';
import { Run } from '@/services/supabase';

export default function ReplayScreen() {
  const { runId } = useLocalSearchParams<{ runId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [run, setRun] = useState<Run | null>(null);
  const [nalaganje, setNalaganje] = useState(true);
  const [deljenje, setDeljenje] = useState(false);
  const kartcaRef = useRef<ViewShot>(null);

  const reveal = useSharedValue(0);
  const statsOpacity = useSharedValue(0);

  useEffect(() => {
    if (!runId) return;
    getRun(runId).then(({ run: r }) => {
      setRun(r ?? null);
      setNalaganje(false);
    });
  }, [runId]);

  useEffect(() => {
    if (!run) return;
    reveal.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
    statsOpacity.value = withDelay(500, withTiming(1, { duration: 400 }));
    // Runs once per loaded run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  const mapStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ scale: 0.92 + reveal.value * 0.08 }],
  }));
  const statsStyle = useAnimatedStyle(() => ({ opacity: statsOpacity.value }));

  const deli = async () => {
    if (!kartcaRef.current?.capture) return;
    setDeljenje(true);
    try {
      const uri = await kartcaRef.current.capture();
      const naVoljo = await Sharing.isAvailableAsync();
      if (!naVoljo) {
        Alert.alert('Ni na voljo', 'Deljenje ni podprto na tej napravi');
        return;
      }
      await Sharing.shareAsync(uri);
    } catch (napaka) {
      console.error('Napaka pri deljenju replaya:', napaka);
      Alert.alert('Napaka', 'Deljenje ni uspelo');
    } finally {
      setDeljenje(false);
    }
  };

  const oblikujTrajanje = (interval: string | null): string => {
    if (!interval) return '0:00';
    const sekunde = intervalToSeconds(interval);
    const minute = Math.floor(sekunde / 60);
    const sek = sekunde % 60;
    return `${minute}:${sek.toString().padStart(2, '0')}`;
  };

  const coords = run?.route_data?.coordinates ?? [];
  const claimed = coords.length > 0 ? isLoopReady(coords) : false;

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader title="Replay" onBack={() => router.back()} />

      {nalaganje ? (
        <View style={styles.loadingContainer}>
          <ThemedText type="body" variant="secondary">
            Nalaganje...
          </ThemedText>
        </View>
      ) : !run || coords.length < 2 ? (
        <View style={styles.loadingContainer}>
          <ThemedText type="body" variant="secondary">
            Ta tek nima shranjene poti za replay.
          </ThemedText>
        </View>
      ) : (
        <View style={[styles.content, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <ViewShot ref={kartcaRef} options={{ format: 'png', quality: 0.95 }} style={styles.cardWrap}>
            <GlassCard style={styles.card}>
              <ThemedText type="caption" variant="muted" style={styles.title}>
                {(run.title || 'TEK').toUpperCase()}
              </ThemedText>

              <Animated.View style={[styles.mapWrap, mapStyle]}>
                <HexTerritoryPreview
                  route={run.route_data!}
                  trailColor={run.route_data?.trailColor}
                  seed={run.id}
                  height={320}
                  claimed={claimed}
                />
              </Animated.View>

              <Animated.View style={statsStyle}>
                <StatBlock
                  stats={[
                    { value: run.distance_km.toFixed(2), label: 'km' },
                    { value: oblikujTrajanje(run.duration), label: 'čas' },
                    { value: run.pace ?? '0:00', label: 'tempo/km' },
                  ]}
                />
              </Animated.View>

              <View style={styles.brandingRow}>
                <IconSymbol name="hexagon.fill" size={12} color={AuroraColors.primary} />
                <ThemedText type="caption" variant="muted">
                  ZoneRuns
                </ThemedText>
              </View>
            </GlassCard>
          </ViewShot>

          <TouchableOpacity
            style={[styles.shareButton, deljenje && { opacity: 0.6 }]}
            onPress={deli}
            disabled={deljenje}>
            <IconSymbol name="square.and.arrow.up" size={18} color={AuroraColors.onPrimary} />
            <ThemedText type="bodyBold" lightColor={AuroraColors.onPrimary} darkColor={AuroraColors.onPrimary}>
              {deljenje ? 'Pripravljam...' : 'Deli replay'}
            </ThemedText>
          </TouchableOpacity>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
    justifyContent: 'center',
  },
  cardWrap: {
    marginBottom: Spacing.lg,
  },
  card: {
    padding: Spacing.lg,
  },
  title: {
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  mapWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  brandingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: Spacing.lg,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: AuroraColors.primary,
  },
});
