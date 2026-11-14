import { StyleSheet, View, ScrollView, TextInput, TouchableOpacity, Modal, Alert } from 'react-native';
import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuroraColors, Colors, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { HexTerritoryPreview } from '@/components/hex-territory-preview';
import { StatBlock } from '@/components/ui/stat-block';
import { createPost } from '@/services/socialService';
import { ClaimTerritoryResult, Run } from '@/services/supabase';
import { intervalToSeconds } from '@/services/runsService';
import { formatArea } from '@/services/territoryService';
import { besedaZaKovance } from '@/services/coinsService';

interface PostRunModalProps {
  visible: boolean;
  run: Run | null;
  territoryResult: ClaimTerritoryResult | null;
  coinsEarned?: number;
  onClose: () => void;
  onPost: () => void;
}

export default function PostRunModal({
  visible,
  run,
  territoryResult,
  coinsEarned,
  onClose,
  onPost,
}: PostRunModalProps) {
  const barvnaShema = useColorScheme();
  const barve = Colors[barvnaShema ?? 'light'];
  const usmerjevalnik = useRouter();
  const [opis, setOpis] = useState('');
  const [objavljanje, setObjavljanje] = useState(false);
  const [deljenje, setDeljenje] = useState(false);
  const kartcaRef = useRef<ViewShot>(null);

  // Post the run to the Feed – sends the run data together with the caption to the server
  const obdelajObjavo = async () => {
    if (!run) return;

    if (!opis.trim()) {
      Alert.alert('Error', 'Please add a caption');
      return;
    }

    setObjavljanje(true);

    const rezultat = await createPost({
      type: 'run',
      title: run.title || `Run on ${new Date(run.run_date).toLocaleDateString()}`,
      content: opis.trim(),
      run_id: run.id,
    });

    if (rezultat.success) {
      setOpis('');
      onPost();
      onClose();
      Alert.alert('Success', 'Run posted to feed!');
    } else {
      Alert.alert('Error', rezultat.error || 'Failed to post run');
    }
    setObjavljanje(false);
  };

  // Capture the summary card as an image and share it via the system sheet
  // (Instagram Stories offers it automatically among targets for images).
  const deliKartico = async () => {
    if (!kartcaRef.current?.capture) return;
    setDeljenje(true);
    try {
      const uri = await kartcaRef.current.capture();
      const naVoljo = await Sharing.isAvailableAsync();
      if (!naVoljo) {
        Alert.alert('Not available', 'Sharing is not supported on this device');
        return;
      }
      await Sharing.shareAsync(uri);
    } catch (napaka) {
      console.error('Error sharing card:', napaka);
      Alert.alert('Error', 'Failed to share image');
    } finally {
      setDeljenje(false);
    }
  };

  if (!run) return null;

  const oblikujTrajanje = (interval: string | null): string => {
    if (!interval) return '0:00';
    const sekunde = intervalToSeconds(interval);
    const minute = Math.floor(sekunde / 60);
    const sek = sekunde % 60;
    return `${minute}:${sek.toString().padStart(2, '0')}`;
  };

  const imaPot = (run.route_data?.coordinates?.length ?? 0) > 1;
  const ozemljeZaseženo = !!territoryResult?.success;
  const ukradenoSkupaj = (territoryResult?.stolen ?? []).reduce((v, s) => v + s.area_m2, 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <ThemedView style={[styles.modal, { backgroundColor: barvnaShema === 'dark' ? barve.card : '#FFFFFF' }]}>
          {/* Header */}
          <View style={[styles.header, { backgroundColor: barve.primary }]}>
            <ThemedText style={styles.headerTitle}>Post your run</ThemedText>
            <TouchableOpacity onPress={onClose}>
              <IconSymbol name="xmark" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {/* Summary card — captured for sharing (Instagram Stories etc.) */}
            <View style={styles.shareCardHeaderRow}>
              <ThemedText type="bodyBold">Run summary</ThemedText>
              <View style={styles.shareCardHeaderActions}>
                {imaPot && (
                  <TouchableOpacity
                    onPress={() => {
                      onClose();
                      usmerjevalnik.push(`/replay?runId=${run.id}`);
                    }}
                    style={styles.shareIconButton}
                    activeOpacity={0.7}>
                    <IconSymbol name="play.fill" size={14} color={AuroraColors.primary} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={deliKartico}
                  disabled={deljenje}
                  style={[styles.shareIconButton, deljenje && { opacity: 0.6 }]}
                  activeOpacity={0.7}>
                  <IconSymbol name="square.and.arrow.up" size={16} color={AuroraColors.primary} />
                </TouchableOpacity>
              </View>
            </View>

            <ViewShot ref={kartcaRef} options={{ format: 'png', quality: 0.95 }} style={styles.shareCardWrap}>
              <View style={styles.shareCard}>
                <ThemedText type="caption" variant="muted" style={styles.shareCardDate}>
                  {(run.title || '').toUpperCase()}
                </ThemedText>

                {imaPot && (
                  <View style={styles.shareCardMap}>
                    <HexTerritoryPreview
                      route={run.route_data!}
                      trailColor={run.route_data?.trailColor}
                      seed={run.id}
                      height={280}
                      claimed={ozemljeZaseženo}
                    />
                  </View>
                )}

                <View style={styles.heroStat}>
                  <ThemedText type="h1" style={styles.heroValue}>{run.distance_km.toFixed(2)}</ThemedText>
                  <ThemedText type="caption" variant="muted" style={styles.heroLabel}>KILOMETERS</ThemedText>
                </View>

                <StatBlock
                  stats={[
                    { value: oblikujTrajanje(run.duration), label: 'time' },
                    { value: run.pace ?? '0:00', label: 'pace/km' },
                  ]}
                />

                {!!coinsEarned && (
                  <View style={styles.coinsRow}>
                    <IconSymbol name="coins.fill" size={16} color={AuroraColors.accentAmber} />
                    <ThemedText type="bodyBold" lightColor={AuroraColors.accentAmber} darkColor={AuroraColors.accentAmber}>
                      +{coinsEarned} {besedaZaKovance(coinsEarned)}
                    </ThemedText>
                  </View>
                )}

                {ozemljeZaseženo ? (
                  <View style={styles.zoneStatsWrap}>
                    <StatBlock
                      stats={[
                        {
                          value: formatArea(territoryResult!.claimed_area_m2 ?? 0),
                          label: ukradenoSkupaj > 0 ? 'gained' : 'territory gained',
                        },
                        ...(ukradenoSkupaj > 0 ? [{ value: formatArea(ukradenoSkupaj), label: 'cleared' }] : []),
                        ...(territoryResult!.weakened_count
                          ? [{ value: String(territoryResult!.weakened_count), label: 'weakened' }]
                          : []),
                      ]}
                    />
                    {!!territoryResult!.bounty_earned && (
                      <View style={styles.coinsRow}>
                        <IconSymbol name="bounty.fill" size={16} color={AuroraColors.accentAmber} />
                        <ThemedText type="bodyBold" lightColor={AuroraColors.accentAmber} darkColor={AuroraColors.accentAmber}>
                          +{territoryResult!.bounty_earned} {besedaZaKovance(territoryResult!.bounty_earned)} from bounty
                        </ThemedText>
                      </View>
                    )}
                  </View>
                ) : (
                  <ThemedText type="caption" variant="muted" style={styles.noZoneHint}>
                    {territoryResult?.reason === 'daily_limit_reached'
                      ? 'You can only claim territory once a day — try again tomorrow'
                      : !territoryResult || territoryResult.reason === 'loop_not_closed'
                        ? 'Close the loop back to the start to claim territory'
                        : 'Territory claim failed'}
                  </ThemedText>
                )}

                <View style={styles.brandingRow}>
                  <IconSymbol name="hexagon.fill" size={12} color={AuroraColors.primary} />
                  <ThemedText type="caption" variant="muted">ZoneRuns</ThemedText>
                </View>
              </View>
            </ViewShot>

            {/* Caption input */}
            <View style={styles.inputContainer}>
              <ThemedText style={styles.label}>What's on your mind?</ThemedText>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: barve.background,
                    borderColor: barve.primary,
                    color: barve.text,
                  },
                ]}
                value={opis}
                onChangeText={setOpis}
                placeholder="Share your running experience..."
                placeholderTextColor={barve.icon}
                multiline
                numberOfLines={4}
                maxLength={280}
              />
              <ThemedText style={styles.charCount}>{opis.length}/280</ThemedText>
            </View>

            {/* Post to Feed */}
            <TouchableOpacity
              style={[styles.postButton, { backgroundColor: barve.primary }, objavljanje && { opacity: 0.6 }]}
              onPress={obdelajObjavo}
              disabled={objavljanje}>
              <ThemedText style={styles.postButtonText}>
                {objavljanje ? 'Posting...' : 'Post to Feed'}
              </ThemedText>
            </TouchableOpacity>

            {/* Skip */}
            <TouchableOpacity style={styles.skipButton} onPress={onClose}>
              <ThemedText style={[styles.skipButtonText, { color: barve.icon }]}>Skip</ThemedText>
            </TouchableOpacity>
          </ScrollView>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  scrollArea: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  shareCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  shareCardHeaderActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  shareIconButton: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: AuroraColors.border,
    backgroundColor: AuroraColors.surfaceSolid,
  },
  shareCardWrap: {
    marginBottom: Spacing.md,
  },
  shareCard: {
    backgroundColor: AuroraColors.bgElevated,
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    borderColor: AuroraColors.border,
    padding: Spacing.lg,
  },
  shareCardDate: {
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: Spacing.sm,
  },
  shareCardMap: {
    borderRadius: BorderRadius.card,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  heroStat: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  heroValue: {
    fontSize: 56,
    letterSpacing: -1,
    textAlign: 'center',
  },
  heroLabel: {
    letterSpacing: 2,
    marginTop: -4,
  },
  coinsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: Spacing.md,
  },
  zoneStatsWrap: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AuroraColors.border,
  },
  noZoneHint: {
    textAlign: 'center',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: AuroraColors.border,
  },
  brandingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: Spacing.lg,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 2,
    borderRadius: BorderRadius.card,
    padding: 16,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    opacity: 0.6,
    textAlign: 'right',
    marginTop: 4,
  },
  postButton: {
    paddingVertical: 16,
    borderRadius: BorderRadius.card,
    alignItems: 'center',
    marginBottom: 12,
  },
  postButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  skipButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipButtonText: {
    fontSize: 14,
  },
});
