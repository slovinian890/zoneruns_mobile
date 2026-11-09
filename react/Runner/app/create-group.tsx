import { StyleSheet, View, TextInput, TouchableOpacity, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius, AuroraColors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter } from 'expo-router';
import { createGroup } from '@/services/groupsService';
import { TRAIL_COLORS } from '@/services/trailColorService';

export default function CreateGroupScreen() {
  const barvnaShema = useColorScheme();
  const barve = Colors[barvnaShema ?? 'light'];
  const usmerjevalnik = useRouter();

  const [ime, setIme] = useState('');
  const [opis, setOpis] = useState('');
  const [barvaSkupine, setBarvaSkupine] = useState(TRAIL_COLORS[1].hex); // Ocean Blue default
  const [javna, setJavna] = useState(true);
  const [ustvarjanje, setUstvarjanje] = useState(false);

  const obdelajUstvarjanje = async () => {
    if (!ime.trim()) {
      Alert.alert('Manjka ime', 'Vnesite ime skupine');
      return;
    }

    setUstvarjanje(true);
    const rezultat = await createGroup(ime.trim(), opis.trim() || null, barvaSkupine, javna);
    setUstvarjanje(false);

    if (rezultat.success && rezultat.group) {
      usmerjevalnik.replace({ pathname: '/group-detail', params: { groupId: rezultat.group.id } });
    } else {
      Alert.alert('Napaka', rezultat.error || 'Ustvarjanje skupine ni uspelo');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { backgroundColor: barvnaShema === 'dark' ? barve.card : barve.backgroundSecondary, borderBottomWidth: 1, borderBottomColor: barve.border }]}>
        <TouchableOpacity onPress={() => usmerjevalnik.back()} style={styles.backButtonIcon}>
          <IconSymbol name="chevron.left" size={24} color={barve.text} />
        </TouchableOpacity>
        <ThemedText type="h3">Nova skupina</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <ThemedText type="bodyBold" style={styles.label}>Ime skupine</ThemedText>
        <TextInput
          style={[styles.input, { backgroundColor: barvnaShema === 'dark' ? barve.card : barve.background, borderColor: barve.border, color: barve.text }]}
          value={ime}
          onChangeText={setIme}
          placeholder="npr. Jutranji tekači"
          placeholderTextColor={barve.textMuted}
          maxLength={50}
        />

        <ThemedText type="bodyBold" style={styles.label}>Opis (neobvezno)</ThemedText>
        <TextInput
          style={[styles.input, styles.textArea, { backgroundColor: barvnaShema === 'dark' ? barve.card : barve.background, borderColor: barve.border, color: barve.text }]}
          value={opis}
          onChangeText={setOpis}
          placeholder="O čem je ta skupina?"
          placeholderTextColor={barve.textMuted}
          multiline
          maxLength={200}
        />

        <ThemedText type="bodyBold" style={styles.label}>Barva skupine</ThemedText>
        <View style={styles.colorGrid}>
          {TRAIL_COLORS.map((bs) => (
            <TouchableOpacity
              key={bs.hex}
              activeOpacity={0.7}
              onPress={() => setBarvaSkupine(bs.hex)}
              style={[
                styles.colorSwatch,
                { backgroundColor: bs.hex },
                barvaSkupine === bs.hex && {
                  borderWidth: 3,
                  borderColor: barvnaShema === 'dark' ? AuroraColors.text : AuroraColors.background,
                  transform: [{ scale: 1.15 }],
                },
              ]}>
              {barvaSkupine === bs.hex && <IconSymbol name="checkmark" size={16} color={AuroraColors.text} />}
            </TouchableOpacity>
          ))}
        </View>

        <ThemedText type="bodyBold" style={styles.label}>Zasebnost</ThemedText>
        <View style={styles.visibilityRow}>
          <TouchableOpacity
            style={[
              styles.visibilityOption,
              { borderWidth: 1, borderColor: javna ? barve.primary : barve.border, backgroundColor: javna ? barve.primary : barve.background },
            ]}
            onPress={() => setJavna(true)}
            activeOpacity={0.7}>
            <IconSymbol name="magnifyingglass" size={16} color={javna ? AuroraColors.onPrimary : barve.text} />
            <ThemedText type="bodyBold" lightColor={javna ? AuroraColors.onPrimary : barve.text} darkColor={javna ? AuroraColors.onPrimary : barve.text}>
              Javna
            </ThemedText>
            <ThemedText type="caption" lightColor={javna ? AuroraColors.onPrimary : barve.textMuted} darkColor={javna ? AuroraColors.onPrimary : barve.textMuted} style={{ textAlign: 'center' }}>
              Vsak jo lahko najde in se pridruži
            </ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.visibilityOption,
              { borderWidth: 1, borderColor: !javna ? barve.primary : barve.border, backgroundColor: !javna ? barve.primary : barve.background },
            ]}
            onPress={() => setJavna(false)}
            activeOpacity={0.7}>
            <IconSymbol name="lock.fill" size={16} color={!javna ? AuroraColors.onPrimary : barve.text} />
            <ThemedText type="bodyBold" lightColor={!javna ? AuroraColors.onPrimary : barve.text} darkColor={!javna ? AuroraColors.onPrimary : barve.text}>
              Zasebna
            </ThemedText>
            <ThemedText type="caption" lightColor={!javna ? AuroraColors.onPrimary : barve.textMuted} darkColor={!javna ? AuroraColors.onPrimary : barve.textMuted} style={{ textAlign: 'center' }}>
              Pridružitev samo s kodo
            </ThemedText>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.createButton, { backgroundColor: barve.primary, opacity: ustvarjanje ? 0.6 : 1 }]}
          onPress={obdelajUstvarjanje}
          disabled={ustvarjanje}
          activeOpacity={0.7}>
          {ustvarjanje ? (
            <ActivityIndicator color={AuroraColors.onPrimary} />
          ) : (
            <ThemedText type="bodyBold" lightColor={AuroraColors.onPrimary} darkColor={AuroraColors.onPrimary}>
              Ustvari skupino
            </ThemedText>
          )}
        </TouchableOpacity>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 60,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButtonIcon: { padding: 4 },
  content: { flex: 1, padding: Spacing.md },
  label: { marginTop: Spacing.md, marginBottom: Spacing.sm },
  input: { borderWidth: 1, borderRadius: BorderRadius.card, paddingVertical: Spacing.md, paddingHorizontal: Spacing.md, fontSize: 16 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  colorSwatch: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  visibilityRow: { flexDirection: 'row', gap: Spacing.sm },
  visibilityOption: { flex: 1, borderRadius: BorderRadius.card, padding: Spacing.md, alignItems: 'center', gap: 4 },
  createButton: { marginTop: Spacing.xl, marginBottom: Spacing.xl, paddingVertical: Spacing.md, borderRadius: BorderRadius.card, alignItems: 'center' },
});
