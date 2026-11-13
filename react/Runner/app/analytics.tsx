import { StyleSheet, View, ScrollView, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { useState, useCallback, useMemo, useRef } from 'react';
import { Image } from 'expo-image';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { AmbientGlow } from '@/components/ambient-glow';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuroraColors, Colors, Spacing, BorderRadius } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter, useFocusEffect } from 'expo-router';
import { getUserRuns, intervalToSeconds } from '@/services/runsService';
import { createPost, uploadPostImage } from '@/services/socialService';
import { Run } from '@/services/supabase';

// ── Koledarja aktivnosti (GitHub-ov slog): trenutni mesec + celo leto ──
// Teden začne v ponedeljek, tako kot povsod drugod v tej aplikaciji.
const DAN_HEADER = ['P', 'T', 'S', 'Č', 'P', 'S', 'N'];
const DAN_OZNAKE_LETO: (string | null)[] = ['Pon', null, 'Sre', null, 'Pet', null, null];
const TEDNOV_NAZAJ = 53;
const DNEVI_V_TEDNU = 7;
const LETO_CELICA = 11;
const LETO_CELICA_ZAZOR = 3;
const LETO_OZNAKA_SIRINA = 22;

// 5-stopenjska lestvica intenzivnosti, zgrajena iz obstoječih zelenih
// odtenkov Grove palete — isti "hex + alpha" vzorec kot GradientRings v
// constants/theme.ts, ne novih barv.
const BARVE_TOPLOTE = [
  AuroraColors.surface,
  AuroraColors.forestGreen + '66',
  AuroraColors.forestGreen,
  AuroraColors.leafGreen + 'AA',
  AuroraColors.leafGreen,
];
// Besedilo številke dneva mora biti berljivo na vsaki stopnji ozadja.
const BESEDILO_TOPLOTE = [undefined, AuroraColors.text, AuroraColors.text, AuroraColors.onPrimary, AuroraColors.onPrimary];

interface Dan {
  dan: number;
  kljuc: string;
  steviloTekov: number;
}

interface DanLeto {
  kljuc: string;
  steviloTekov: number;
}

const stopnjaBarve = (stevilo: number): number => {
  if (stevilo <= 0) return 0;
  if (stevilo === 1) return 1;
  if (stevilo === 2) return 2;
  if (stevilo === 3) return 3;
  return 4;
};

// Lokalni YYYY-MM-DD (brez toISOString, ki bi zamaknil datum na UTC)
const kljucDatuma = (d: Date): string => {
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const steviloTekovBesedilo = (n: number): string =>
  n === 1 ? 'tek' : n === 2 ? 'teka' : n === 3 || n === 4 ? 'teki' : 'tekov';

export default function AnalyticsScreen() {
  const barvnaShema = useColorScheme();
  const barve = Colors[barvnaShema ?? 'light'];
  const jeTema = barvnaShema === 'dark';
  const usmerjevalnik = useRouter();
  const kartaBarve = { backgroundColor: jeTema ? barve.card : barve.background, borderWidth: 1, borderColor: barve.border } as const;

  const [teki, setTeki] = useState<Run[]>([]);
  const [nalaganje, setNalaganje] = useState(true);

  const [izvazanje, setIzvazanje] = useState(false);
  const [deliModalVidna, setDeliModalVidna] = useState(false);
  const [zajetaSlikaUri, setZajetaSlikaUri] = useState<string | null>(null);
  const [opisDeljenja, setOpisDeljenja] = useState('');
  const [objavljanje, setObjavljanje] = useState(false);
  const zajemRef = useRef<ViewShot>(null);
  const letniDrsnikRef = useRef<ScrollView>(null);

  // Ponovno naloži ob vsakem fokusu, da se "najdaljši tek/čas" takoj
  // posodobita, ko se vrneš sem po novem teku, ki podre dosedanji rekord.
  useFocusEffect(
    useCallback(() => {
      naloziTeke();
    }, [])
  );

  const naloziTeke = async () => {
    try {
      const rezultat = await getUserRuns(undefined, { limit: 1000 });
      setTeki(rezultat.data);
    } catch (napaka) {
      console.error('Napaka pri nalaganju analitike:', napaka);
    } finally {
      setNalaganje(false);
    }
  };

  const steviloPoDnevih = useMemo(() => {
    const zemljevid = new Map<string, number>();
    teki.forEach((t) => {
      zemljevid.set(t.run_date, (zemljevid.get(t.run_date) ?? 0) + 1);
    });
    return zemljevid;
  }, [teki]);

  const danes = useMemo(() => new Date(), []);
  const imeMeseca = useMemo(() => {
    const ime = danes.toLocaleDateString('sl-SI', { month: 'long', year: 'numeric' });
    return ime.charAt(0).toUpperCase() + ime.slice(1);
  }, [danes]);

  const { najdaljsiTekKm, najdaljsiCasSek } = useMemo(() => {
    let km = 0;
    let sek = 0;
    teki.forEach((t) => {
      if (t.distance_km > km) km = t.distance_km;
      const trajanje = intervalToSeconds(t.duration);
      if (trajanje > sek) sek = trajanje;
    });
    return { najdaljsiTekKm: km, najdaljsiCasSek: sek };
  }, [teki]);

  // ── Koledar trenutnega meseca ──
  // Prazne celice pred 1. in po zadnjem dnevu, da je vsaka vrstica poln teden.
  const mesecneVrstice = useMemo(() => {
    const leto = danes.getFullYear();
    const mesecIdx = danes.getMonth();
    const prviDanMeseca = new Date(leto, mesecIdx, 1);
    const steviloDni = new Date(leto, mesecIdx + 1, 0).getDate();

    const zacetniDanTedna = prviDanMeseca.getDay(); // 0=Ned..6=Sob
    const vodilniZamik = zacetniDanTedna === 0 ? 6 : zacetniDanTedna - 1;

    const celice: (Dan | null)[] = [];
    for (let i = 0; i < vodilniZamik; i++) celice.push(null);
    for (let dan = 1; dan <= steviloDni; dan++) {
      const kljuc = kljucDatuma(new Date(leto, mesecIdx, dan));
      celice.push({ dan, kljuc, steviloTekov: steviloPoDnevih.get(kljuc) ?? 0 });
    }
    while (celice.length % 7 !== 0) celice.push(null);

    const vrstice: (Dan | null)[][] = [];
    for (let i = 0; i < celice.length; i += 7) vrstice.push(celice.slice(i, i + 7));
    return vrstice;
  }, [danes, steviloPoDnevih]);

  const { stevilTekovMesec, kmMesec } = useMemo(() => {
    const predpona = kljucDatuma(danes).slice(0, 7); // "YYYY-MM"
    let stevilo = 0;
    let km = 0;
    teki.forEach((t) => {
      if (t.run_date.startsWith(predpona)) {
        stevilo++;
        km += t.distance_km || 0;
      }
    });
    return { stevilTekovMesec: stevilo, kmMesec: km };
  }, [teki, danes]);

  // ── Letni koledar (GitHub-ov slog, zadnjih 53 tednov) ──
  const tedniLeto = useMemo(() => {
    const danesL = new Date();
    danesL.setHours(0, 0, 0, 0);
    const danVTednu = danesL.getDay();
    const zamikDoPonedeljka = danVTednu === 0 ? 6 : danVTednu - 1;
    const zacetekTegaTedna = new Date(danesL);
    zacetekTegaTedna.setDate(danesL.getDate() - zamikDoPonedeljka);

    const prviPonedeljek = new Date(zacetekTegaTedna);
    prviPonedeljek.setDate(zacetekTegaTedna.getDate() - (TEDNOV_NAZAJ - 1) * 7);

    const seznamTednov: { prviDan: Date; dnevi: DanLeto[] }[] = [];
    for (let t = 0; t < TEDNOV_NAZAJ; t++) {
      const dnevi: DanLeto[] = [];
      let prviDanTedna: Date | null = null;
      for (let d = 0; d < DNEVI_V_TEDNU; d++) {
        const datum = new Date(prviPonedeljek);
        datum.setDate(prviPonedeljek.getDate() + t * 7 + d);
        if (d === 0) prviDanTedna = datum;
        const kljuc = kljucDatuma(datum);
        dnevi.push({ kljuc, steviloTekov: steviloPoDnevih.get(kljuc) ?? 0 });
      }
      seznamTednov.push({ prviDan: prviDanTedna!, dnevi });
    }
    return seznamTednov;
  }, [steviloPoDnevih]);

  const mesecneOznakeLeto = useMemo(() => {
    let zadnjiMesec = -1;
    return tedniLeto.map(({ prviDan }) => {
      const mesec = prviDan.getMonth();
      if (mesec === zadnjiMesec) return null;
      zadnjiMesec = mesec;
      return prviDan.toLocaleDateString('sl-SI', { month: 'short' }).replace('.', '');
    });
  }, [tedniLeto]);

  const steviloTekovLeto = useMemo(
    () => tedniLeto.reduce((v, teden) => v + teden.dnevi.reduce((vv, d) => vv + d.steviloTekov, 0), 0),
    [tedniLeto]
  );

  const oblikujCas = (sekunde: number): string => {
    const ure = Math.floor(sekunde / 3600);
    const minute = Math.floor((sekunde % 3600) / 60);
    const sek = sekunde % 60;
    if (ure > 0) return `${ure}:${minute.toString().padStart(2, '0')}:${sek.toString().padStart(2, '0')}`;
    return `${minute}:${sek.toString().padStart(2, '0')}`;
  };

  // ── Izvoz trenutnega meseca kot slika (deli ali objavi na Feed) ──
  const izvoziMesec = async () => {
    if (!zajemRef.current?.capture) return;
    try {
      setIzvazanje(true);
      const uri = await zajemRef.current.capture();
      setZajetaSlikaUri(uri);
      setOpisDeljenja(''); // brez privzetega besedila — uporabnik napiše svoje
      setDeliModalVidna(true);
    } catch (napaka) {
      console.error('Napaka pri izvozu:', napaka);
      Alert.alert('Napaka', 'Izvoz slike ni uspel');
    } finally {
      setIzvazanje(false);
    }
  };

  const deliNativno = async () => {
    if (!zajetaSlikaUri) return;
    const naVoljo = await Sharing.isAvailableAsync();
    if (!naVoljo) {
      Alert.alert('Ni na voljo', 'Deljenje ni podprto na tej napravi');
      return;
    }
    await Sharing.shareAsync(zajetaSlikaUri);
  };

  const objaviVFeed = async () => {
    if (!zajetaSlikaUri) return;
    setObjavljanje(true);
    try {
      const nalozitev = await uploadPostImage(zajetaSlikaUri);
      if (!nalozitev.success || !nalozitev.url) {
        Alert.alert('Napaka', nalozitev.error || 'Nalaganje slike ni uspelo');
        return;
      }
      const rezultat = await createPost({
        type: 'photo',
        title: `Mesečni pregled – ${imeMeseca}`,
        content: opisDeljenja.trim() || undefined,
        image_url: nalozitev.url,
      });
      if (rezultat.success) {
        setDeliModalVidna(false);
        setZajetaSlikaUri(null);
        Alert.alert('Uspeh', 'Pregled objavljen na feed!');
      } else {
        Alert.alert('Napaka', rezultat.error || 'Objava ni uspela');
      }
    } finally {
      setObjavljanje(false);
    }
  };

  if (nalaganje) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ThemedText type="body" variant="secondary">Nalaganje...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <AmbientGlow />
      <View
        style={[
          styles.header,
          { backgroundColor: jeTema ? barve.card : barve.backgroundSecondary, borderBottomWidth: 1, borderBottomColor: barve.border },
        ]}>
        <TouchableOpacity onPress={() => usmerjevalnik.back()} style={styles.backButtonIcon}>
          <IconSymbol name="chevron.left" size={24} color={barve.text} />
        </TouchableOpacity>
        <ThemedText type="h3">Analitika</ThemedText>
        <View style={styles.backButtonIcon} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Najdaljši tek & najdaljši čas — skupaj zgoraj, posodobita se ob vsakem fokusu */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, kartaBarve]}>
            <IconSymbol name="arrow.up.right" size={20} color={barve.primary} />
            <ThemedText type="h2" variant="primary" style={styles.statCardValue}>{najdaljsiTekKm.toFixed(2)} km</ThemedText>
            <ThemedText type="caption" variant="muted">Najdaljši tek</ThemedText>
          </View>
          <View style={[styles.statCard, kartaBarve]}>
            <IconSymbol name="stopwatch" size={20} color={barve.primary} />
            <ThemedText type="h2" variant="primary" style={styles.statCardValue}>{oblikujCas(najdaljsiCasSek)}</ThemedText>
            <ThemedText type="caption" variant="muted">Najdaljši čas teka</ThemedText>
          </View>
        </View>

        {/* Koledar trenutnega meseca — zajet za izvoz/deljenje v Feed */}
        <ViewShot ref={zajemRef} options={{ format: 'png', quality: 0.95 }}>
          <View style={[styles.card, kartaBarve]}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <ThemedText type="h3">{imeMeseca}</ThemedText>
                <ThemedText type="caption" variant="muted">
                  {stevilTekovMesec} {steviloTekovBesedilo(stevilTekovMesec)} · {kmMesec.toFixed(1)} km
                </ThemedText>
              </View>
              <TouchableOpacity
                onPress={izvoziMesec}
                disabled={izvazanje}
                style={[styles.exportButton, { backgroundColor: jeTema ? barve.background : barve.backgroundSecondary, borderWidth: 1, borderColor: barve.border }]}
                activeOpacity={0.7}>
                <IconSymbol name="square.and.arrow.up" size={16} color={barve.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.monthShrinkWrap}>
              <View style={styles.weekHeaderRow}>
                {DAN_HEADER.map((crka, i) => (
                  <View key={i} style={styles.monthCellWrap}>
                    <ThemedText type="caption" variant="muted" style={styles.weekHeaderText}>{crka}</ThemedText>
                  </View>
                ))}
              </View>

              {mesecneVrstice.map((vrstica, vi) => (
                <View key={vi} style={styles.monthGridRow}>
                  {vrstica.map((celica, ci) => {
                    if (!celica) return <View key={ci} style={styles.monthCellWrap} />;
                    const stopnja = stopnjaBarve(celica.steviloTekov);
                    const besedilnaBarva = BESEDILO_TOPLOTE[stopnja];
                    return (
                      <View key={ci} style={styles.monthCellWrap}>
                        <View style={[styles.monthCell, { backgroundColor: BARVE_TOPLOTE[stopnja], borderColor: barve.border }]}>
                          {besedilnaBarva ? (
                            <ThemedText type="caption" style={[styles.monthCellText, { color: besedilnaBarva }]}>{celica.dan}</ThemedText>
                          ) : (
                            <ThemedText type="caption" variant="muted" style={styles.monthCellText}>{celica.dan}</ThemedText>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>

            <View style={styles.legendRow}>
              <ThemedText type="caption" variant="muted">Manj</ThemedText>
              {BARVE_TOPLOTE.map((b, i) => (
                <View key={i} style={[styles.legendCell, { backgroundColor: b, borderColor: barve.border }]} />
              ))}
              <ThemedText type="caption" variant="muted">Več</ThemedText>
            </View>

            <View style={styles.brandingRow}>
              <IconSymbol name="hexagon.fill" size={12} color={barve.primary} />
              <ThemedText type="caption" variant="muted">ZoneRuns</ThemedText>
            </View>
          </View>
        </ViewShot>

        {/* Letni koledar aktivnosti — GitHub-ov slog, zadnjih 53 tednov */}
        <View style={[styles.card, kartaBarve, styles.yearCard]}>
          <ThemedText type="bodyBold" style={styles.yearCardTitle}>
            {steviloTekovLeto} {steviloTekovBesedilo(steviloTekovLeto)} v zadnjem letu
          </ThemedText>

          <ScrollView
            ref={letniDrsnikRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            onContentSizeChange={() => letniDrsnikRef.current?.scrollToEnd({ animated: false })}>
            <View>
              <View style={[styles.letoGridLine, { gap: LETO_CELICA_ZAZOR }]}>
                <View style={{ width: LETO_OZNAKA_SIRINA }} />
                {tedniLeto.map((teden, i) => (
                  <View key={teden.prviDan.toISOString()} style={styles.letoWeekLabelCell}>
                    {mesecneOznakeLeto[i] ? (
                      <ThemedText type="caption" variant="muted" style={styles.letoMonthLabelText}>
                        {mesecneOznakeLeto[i]}
                      </ThemedText>
                    ) : null}
                  </View>
                ))}
              </View>

              <View style={[styles.letoGridLine, { gap: LETO_CELICA_ZAZOR }]}>
                <View style={[styles.letoDayLabelsCol, { gap: LETO_CELICA_ZAZOR }]}>
                  {DAN_OZNAKE_LETO.map((oznaka, i) => (
                    <View key={i} style={styles.letoDayLabelCell}>
                      {oznaka ? (
                        <ThemedText type="caption" variant="muted" style={styles.letoDayLabelText}>{oznaka}</ThemedText>
                      ) : null}
                    </View>
                  ))}
                </View>
                {tedniLeto.map((teden) => (
                  <View key={teden.prviDan.toISOString()} style={[styles.letoWeekColumn, { gap: LETO_CELICA_ZAZOR }]}>
                    {teden.dnevi.map((dan) => (
                      <View
                        key={dan.kljuc}
                        style={[
                          styles.letoDayCell,
                          { backgroundColor: BARVE_TOPLOTE[stopnjaBarve(dan.steviloTekov)], borderColor: barve.border },
                        ]}
                      />
                    ))}
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>

          <View style={styles.legendRow}>
            <ThemedText type="caption" variant="muted">Manj</ThemedText>
            {BARVE_TOPLOTE.map((b, i) => (
              <View key={i} style={[styles.legendCell, { backgroundColor: b, borderColor: barve.border }]} />
            ))}
            <ThemedText type="caption" variant="muted">Več</ThemedText>
          </View>
        </View>
      </ScrollView>

      <Modal visible={deliModalVidna} transparent animationType="slide" onRequestClose={() => setDeliModalVidna(false)}>
        <View style={styles.overlay}>
          <ThemedView style={[styles.modal, { backgroundColor: jeTema ? barve.card : '#FFFFFF' }]}>
            <View style={[styles.modalHeader, { backgroundColor: barve.primary }]}>
              <ThemedText type="bodyBold" lightColor={AuroraColors.onPrimary} darkColor={AuroraColors.onPrimary}>Izvozi pregled</ThemedText>
              <TouchableOpacity onPress={() => setDeliModalVidna(false)}>
                <IconSymbol name="xmark" size={22} color={AuroraColors.onPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalContent}>
              {zajetaSlikaUri && <Image source={{ uri: zajetaSlikaUri }} style={styles.previewImage} contentFit="contain" />}

              <TextInput
                style={[styles.captionInput, { backgroundColor: barve.background, borderColor: barve.border, color: barve.text }]}
                value={opisDeljenja}
                onChangeText={setOpisDeljenja}
                placeholder="Opis objave..."
                placeholderTextColor={barve.textMuted}
                multiline
                maxLength={280}
              />

              <TouchableOpacity
                style={[styles.primaryActionButton, { backgroundColor: barve.primary }, objavljanje && { opacity: 0.6 }]}
                onPress={objaviVFeed}
                disabled={objavljanje}
                activeOpacity={0.7}>
                <IconSymbol name="newspaper.fill" size={18} color={AuroraColors.onPrimary} />
                <ThemedText type="bodyBold" lightColor={AuroraColors.onPrimary} darkColor={AuroraColors.onPrimary}>
                  {objavljanje ? 'Objavljanje...' : 'Objavi v Feed'}
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.secondaryActionButton, { borderColor: barve.border }]}
                onPress={deliNativno}
                activeOpacity={0.7}>
                <IconSymbol name="square.and.arrow.up" size={18} color={barve.primary} />
                <ThemedText type="bodyBold" variant="primary">Deli / Shrani</ThemedText>
              </TouchableOpacity>
            </View>
          </ThemedView>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    paddingTop: 60,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButtonIcon: { padding: 4, width: 32 },
  content: { flex: 1, padding: Spacing.md },

  statsRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.md },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    padding: Spacing.md,
    borderRadius: BorderRadius.card,
  },
  statCardValue: { letterSpacing: -0.5 },

  card: { padding: Spacing.md, borderRadius: BorderRadius.card, marginBottom: Spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.md },
  exportButton: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Koledar trenutnega meseca je zavit v ta omejen-širinski ovoj, da je
  // manjši in bolj kompakten kot prej (celice so flex:1 znotraj njega).
  monthShrinkWrap: { maxWidth: 260, width: '100%', alignSelf: 'center' },
  weekHeaderRow: { flexDirection: 'row', gap: 5, marginBottom: 5 },
  monthGridRow: { flexDirection: 'row', gap: 5, marginBottom: 5 },
  monthCellWrap: { flex: 1 },
  weekHeaderText: { textAlign: 'center' },
  monthCell: {
    aspectRatio: 1,
    borderRadius: BorderRadius.small,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  monthCellText: { fontSize: 11, fontWeight: '600' },

  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: Spacing.sm,
  },
  legendCell: { width: 10, height: 10, borderRadius: 2, borderWidth: 1 },
  brandingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: Spacing.md,
  },

  // Letni koledar (GitHub-ov slog)
  yearCard: { marginBottom: Spacing.xl },
  yearCardTitle: { marginBottom: Spacing.md },
  letoGridLine: { flexDirection: 'row', alignItems: 'flex-start' },
  letoDayLabelsCol: { flexDirection: 'column', width: LETO_OZNAKA_SIRINA },
  letoDayLabelCell: { height: LETO_CELICA, justifyContent: 'center' },
  letoDayLabelText: { fontSize: 10, lineHeight: 11 },
  letoWeekLabelCell: { width: LETO_CELICA, height: 14, justifyContent: 'flex-end' },
  letoMonthLabelText: { fontSize: 10, lineHeight: 11 },
  letoWeekColumn: { flexDirection: 'column' },
  letoDayCell: { width: LETO_CELICA, height: LETO_CELICA, borderRadius: 2, borderWidth: 1 },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalContent: { padding: Spacing.md },
  previewImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: BorderRadius.card,
    marginBottom: Spacing.md,
  },
  captionInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.card,
    padding: Spacing.sm,
    fontSize: 15,
    minHeight: 70,
    textAlignVertical: 'top',
    marginBottom: Spacing.md,
  },
  primaryActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.card,
    marginBottom: Spacing.sm,
  },
  secondaryActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.card,
    borderWidth: 1,
    marginBottom: Spacing.xl,
  },
});
