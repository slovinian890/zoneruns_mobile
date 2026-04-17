import { StyleSheet, View, TextInput, TouchableOpacity, Modal, Alert } from 'react-native';
import { useState } from 'react';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { createPost } from '@/services/socialService';
import { Run } from '@/services/supabase';
import { intervalToSeconds } from '@/services/runsService';

interface PostRunModalProps {
  visible: boolean;
  run: Run | null;
  onClose: () => void;
  onPost: () => void;
}

export default function PostRunModal({
  visible,
  run,
  onClose,
  onPost,
}: PostRunModalProps) {
  const barvnaShema = useColorScheme();
  const barve = Colors[barvnaShema ?? 'light'];
  const [opis, setOpis] = useState('');
  const [objavljanje, setObjavljanje] = useState(false);

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

  if (!run) return null;

  const oblikujTrajanje = (interval: string | null): string => {
    if (!interval) return '0:00';
    const sekunde = intervalToSeconds(interval);
    const minute = Math.floor(sekunde / 60);
    const sek = sekunde % 60;
    return `${minute}:${sek.toString().padStart(2, '0')}`;
  };

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

          <View style={styles.content}>
            {/* Povzetek teka */}
            <View style={[styles.runSummary, { backgroundColor: barve.primary + '10' }]}>
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>Razdalja:</ThemedText>
                <ThemedText style={[styles.summaryValue, { color: barve.primary }]}>
                  {run.distance_km.toFixed(2)} km
                </ThemedText>
              </View>
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>Trajanje:</ThemedText>
                <ThemedText style={[styles.summaryValue, { color: barve.primary }]}>
                  {oblikujTrajanje(run.duration)}
                </ThemedText>
              </View>
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryLabel}>Tempo:</ThemedText>
                <ThemedText style={[styles.summaryValue, { color: barve.primary }]}>
                  {run.pace ?? '0:00'} /km
                </ThemedText>
              </View>
            </View>

            {/* Info: ozemlja se samodejno posodobi */}
            <View style={[styles.infoBox, { backgroundColor: barve.primary + '08', borderColor: barve.primary + '20' }]}>
              <IconSymbol name="hexagon.fill" size={18} color={barve.primary} />
              <ThemedText type="caption" variant="muted" style={{ flex: 1 }}>
                Vaše ozemeljske ploščice se samodejno posodobijo iz vaših tekov. Pritisnite Tekmuj za ogled zemljevida!
              </ThemedText>
            </View>

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
          </View>
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
  runSummary: {
    padding: 16,
    borderRadius: BorderRadius.card,
    marginBottom: Spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    opacity: 0.7,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    borderRadius: BorderRadius.card,
    borderWidth: 1,
    marginBottom: Spacing.md,
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
