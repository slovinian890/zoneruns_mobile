import { StyleSheet, View, ScrollView, TextInput, TouchableOpacity, Modal, Alert } from 'react-native';
import { useRef, useState } from 'react';
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

interface PostRunModalProps {
  visible: boolean;
  run: Run | null;
  territoryResult: ClaimTerritoryResult | null;
  onClose: () => void;
  onPost: () => void;
}

export default function PostRunModal({
  visible,
  run,
  territoryResult,
  onClose,
  onPost,
}: PostRunModalProps) {
  const barvnaShema = useColorScheme();
  const barve = Colors[barvnaShema ?? 'light'];
  const [opis, setOpis] = useState('');
  const [objavljanje, setObjavljanje] = useState(false);
  const [deljenje, setDeljenje] = useState(false);
  const kartcaRef = useRef<ViewShot>(null);

  // Objavi tek na Feed – pošlje podatke o teku skupaj z opisom na strežnik
  const obdelajObjavo = async () => {
    if (!run) return;

    if (!opis.trim()) {
      Alert.alert('Napaka', 'Prosimo, dodajte opis');
      return;
    }

    setObjavljanje(true);

    const rezultat = await createPost({
      type: 'run',
      title: run.title || `Tek dne ${new Date(run.run_date).toLocaleDateString()}`,
      content: opis.trim(),
      run_id: run.id,
    });

    if (rezultat.success) {
      setOpis('');
      onPost();
      onClose();
      Alert.alert('Uspeh', 'Tek objavljen na feed!');
    } else {
      Alert.alert('Napaka', rezultat.error || 'Objava teka ni uspela');
    }
    setObjavljanje(false);
  };

  // Zajemi kartico povzetka kot sliko in jo deli prek sistemskega menija
  // (Instagram Stories jo med cilji ponudi samodejno za slike).
  const deliKartico = async () => {
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
      console.error('Napaka pri deljenju kartice:', napaka);
      Alert.alert('Napaka', 'Deljenje slike ni uspelo');
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
          {/* Glava */}
          <View style={[styles.header, { backgroundColor: barve.primary }]}>
            <ThemedText style={styles.headerTitle}>Objavi svoj tek</ThemedText>
            <TouchableOpacity onPress={onClose}>
              <IconSymbol name="xmark" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {/* Kartica povzetka — zajeta za deljenje (Instagram Stories ipd.) */}
            <View style={styles.shareCardHeaderRow}>
              <ThemedText type="bodyBold">Povzetek teka</ThemedText>
              <TouchableOpacity
                onPress={deliKartico}
                disabled={deljenje}
                style={[styles.shareIconButton, deljenje && { opacity: 0.6 }]}
                activeOpacity={0.7}>
                <IconSymbol name="square.and.arrow.up" size={16} color={AuroraColors.primary} />
              </TouchableOpacity>
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
                    />
                  </View>
                )}

                <View style={styles.heroStat}>
                  <ThemedText type="h1" style={styles.heroValue}>{run.distance_km.toFixed(2)}</ThemedText>
                  <ThemedText type="caption" variant="muted" style={styles.heroLabel}>KILOMETROV</ThemedText>
                </View>

                <StatBlock
                  stats={[
                    { value: oblikujTrajanje(run.duration), label: 'čas' },
                    { value: run.pace ?? '0:00', label: 'tempo/km' },
                  ]}
                />

                {ozemljeZaseženo ? (
                  <View style={styles.zoneStatsWrap}>
                    <StatBlock
                      stats={
                        ukradenoSkupaj > 0
                          ? [
                              { value: formatArea(territoryResult!.claimed_area_m2 ?? 0), label: 'pridobljeno' },
                              { value: formatArea(ukradenoSkupaj), label: 'ukradeno' },
                            ]
                          : [{ value: formatArea(territoryResult!.claimed_area_m2 ?? 0), label: 'ozemlje pridobljeno' }]
                      }
                    />
                  </View>
                ) : (
                  <ThemedText type="caption" variant="muted" style={styles.noZoneHint}>
                    {!territoryResult || territoryResult.reason === 'loop_not_closed'
                      ? 'Sklenite zanko nazaj do začetka, da zasežete ozemlje'
                      : 'Zaseg ozemlja ni uspel'}
                  </ThemedText>
                )}

                <View style={styles.brandingRow}>
                  <IconSymbol name="hexagon.fill" size={12} color={AuroraColors.primary} />
                  <ThemedText type="caption" variant="muted">ZoneRuns</ThemedText>
                </View>
              </View>
            </ViewShot>

            {/* Vnos opisa */}
            <View style={styles.inputContainer}>
              <ThemedText style={styles.label}>Kaj vam je na misli?</ThemedText>
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
                placeholder="Delite svojo tekalno izkušnjo..."
                placeholderTextColor={barve.icon}
                multiline
                numberOfLines={4}
                maxLength={280}
              />
              <ThemedText style={styles.charCount}>{opis.length}/280</ThemedText>
            </View>

            {/* Objavi na Feed */}
            <TouchableOpacity
              style={[styles.postButton, { backgroundColor: barve.primary }, objavljanje && { opacity: 0.6 }]}
              onPress={obdelajObjavo}
              disabled={objavljanje}>
              <ThemedText style={styles.postButtonText}>
                {objavljanje ? 'Objavljanje...' : 'Objavi na Feed'}
              </ThemedText>
            </TouchableOpacity>

            {/* Preskoči */}
            <TouchableOpacity style={styles.skipButton} onPress={onClose}>
              <ThemedText style={[styles.skipButtonText, { color: barve.icon }]}>Preskoči</ThemedText>
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
  content: {
    padding: 20,
  },
  shareCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
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
