import { StyleSheet, View, TextInput, TouchableOpacity, Alert, ScrollView, Animated } from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius, CleanPaceColors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useFocusEffect, useRouter } from 'expo-router';
import { getCurrentProfile, updateProfile, uploadAvatar } from '@/services/profileService';
import { getCurrentUserStats } from '@/services/statsService';
import { signOut } from '@/services/authService';
import { Profile, UserStats } from '@/services/supabase';
import { TRAIL_COLORS, getTrailColor, setTrailColor as shraniBarvoSledi, DEFAULT_TRAIL_COLOR } from '@/services/trailColorService';

export default function ProfileScreen() {
  const barvnaShema = useColorScheme();
  const barve = Colors[barvnaShema ?? 'light'];
  const [profil, setProfil] = useState<Profile | null>(null);
  const [statistika, setStatistika] = useState<UserStats | null>(null);
  const [uporabniskoIme, setUporabniskoIme] = useState('');
  const [prikaznoIme, setPrikaznoIme] = useState('');
  const [opis, setOpis] = useState('');
  const [lokacija, setLokacija] = useState('');
  const [slikaProfilaUrl, setSlikaProfilaUrl] = useState<string | null>(null);
  const [nalaganje, setNalaganje] = useState(true);
  const [shranjevanje, setShranjevanje] = useState(false);
  const [izbranaBarvaSled, setIzbranaBarvaSled] = useState(DEFAULT_TRAIL_COLOR);
  const usmerjevalnik = useRouter();
  
  // Animacija dihanja za profilno sliko
  const dihalniPulz = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(dihalniPulz, {
          toValue: 1.03,
          duration: 2500,
          useNativeDriver: true,
        }),
        Animated.timing(dihalniPulz, {
          toValue: 1,
          duration: 2500,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  useFocusEffect(
    useCallback(() => {
      naloziProfil();
      naloziStatistiko();
      getTrailColor().then(setIzbranaBarvaSled);
    }, [])
  );

  const naloziProfil = async () => {
    try {
      const rezultat = await getCurrentProfile();
      if (rezultat.success && rezultat.profile) {
        setProfil(rezultat.profile);
        setUporabniskoIme(rezultat.profile.username);
        setPrikaznoIme(rezultat.profile.display_name || '');
        setOpis(rezultat.profile.bio || '');
        setLokacija(rezultat.profile.location || '');
        setSlikaProfilaUrl(rezultat.profile.avatar_url);
      }
    } catch (napaka) {
      console.error('Napaka pri nalaganju profila:', napaka);
    } finally {
      setNalaganje(false);
    }
  };

  const naloziStatistiko = async () => {
    try {
      const rezultat = await getCurrentUserStats();
      if (rezultat.success && rezultat.stats) {
        setStatistika(rezultat.stats);
      }
    } catch (napaka) {
      console.error('Napaka pri nalaganju statistike:', napaka);
    }
  };

  // Izberi sliko iz galerije, naloži jo na strežnik in posodobi URL profilne slike
  const izberSliko = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Potrebno dovoljenje', 'Prosimo, dovolite dostop do galerije za dodajanje profilne slike.');
        return;
      }

      const rezultat = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!rezultat.canceled && rezultat.assets[0]) {
        setShranjevanje(true);
        const rezultatNalozitve = await uploadAvatar(rezultat.assets[0].uri);
        if (rezultatNalozitve.success && rezultatNalozitve.url) {
          setSlikaProfilaUrl(rezultatNalozitve.url);
          Alert.alert('Uspeh', 'Profilna slika posodobljena!');
        } else {
          Alert.alert('Napaka', rezultatNalozitve.error || 'Nalaganje slike ni uspelo');
        }
        setShranjevanje(false);
      }
    } catch (napaka) {
      Alert.alert('Napaka', 'Izbira slike ni uspela');
      setShranjevanje(false);
    }
  };

  const posnamiSliko = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Potrebno dovoljenje', 'Prosimo, dovolite dostop do kamere za slikanje.');
        return;
      }

      const rezultat = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!rezultat.canceled && rezultat.assets[0]) {
        setShranjevanje(true);
        const rezultatNalozitve = await uploadAvatar(rezultat.assets[0].uri);
        if (rezultatNalozitve.success && rezultatNalozitve.url) {
          setSlikaProfilaUrl(rezultatNalozitve.url);
          Alert.alert('Uspeh', 'Profilna slika posodobljena!');
        } else {
          Alert.alert('Napaka', rezultatNalozitve.error || 'Nalaganje slike ni uspelo');
        }
        setShranjevanje(false);
      }
    } catch (napaka) {
      Alert.alert('Napaka', 'Slikanje ni uspelo');
      setShranjevanje(false);
    }
  };

  const prikaziIzbirnikSlik = () => {
    Alert.alert(
      'Profilna slika',
      'Izberite možnost',
      [
        { text: 'Kamera', onPress: posnamiSliko },
        { text: 'Galerija', onPress: izberSliko },
        { text: 'Prekliči', style: 'cancel' },
      ]
    );
  };

  const shraniProfil = async () => {
    if (!uporabniskoIme.trim()) {
      Alert.alert('Napaka', 'Uporabniško ime ne sme biti prazno');
      return;
    }

    setShranjevanje(true);
    const rezultat = await updateProfile({
      username: uporabniskoIme.trim(),
      display_name: prikaznoIme.trim() || null,
      bio: opis.trim() || null,
      location: lokacija.trim() || null,
    });
    setShranjevanje(false);

    if (rezultat.success) {
      setProfil(rezultat.profile!);
      Alert.alert('Uspeh', 'Profil posodobljen!');
    } else {
      Alert.alert('Napaka', rezultat.error || 'Posodabljanje profila ni uspelo');
    }
  };

  const obdelajOdjavo = async () => {
    Alert.alert(
      'Odjava',
      'Ali se res želite odjaviti?',
      [
        { text: 'Prekliči', style: 'cancel' },
        {
          text: 'Odjava',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            usmerjevalnik.replace('/signin');
          },
        },
      ]
    );
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
      <View style={[styles.header, { 
        backgroundColor: barvnaShema === 'dark' ? barve.card : barve.backgroundSecondary,
        borderBottomWidth: 1,
        borderBottomColor: barve.border,
      }]}>
        <ThemedText type="h3">Profil</ThemedText>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profileSection}>
          <TouchableOpacity onPress={prikaziIzbirnikSlik} style={styles.imageContainer} activeOpacity={0.7} disabled={shranjevanje}>
            <Animated.View 
              style={[
                styles.breathingRing,
                {
                  backgroundColor: CleanPaceColors.frostBlue,
                  transform: [{ scale: dihalniPulz }],
                }
              ]} 
            />
            {slikaProfilaUrl ? (
              <Image source={{ uri: slikaProfilaUrl }} style={styles.profileImage} />
            ) : (
              <View style={[styles.profileImagePlaceholder, { backgroundColor: barve.backgroundSecondary }]}>
                <IconSymbol name="person.fill" size={48} color={barve.primary} />
              </View>
            )}
            <View style={[styles.editBadge, { 
              backgroundColor: barve.primary,
              borderColor: barvnaShema === 'dark' ? barve.card : barve.background,
            }]}>
              <IconSymbol name="camera.fill" size={16} color={CleanPaceColors.offWhite} />
            </View>
          </TouchableOpacity>

          <View style={styles.inputContainer}>
            <ThemedText type="bodyBold" style={styles.label}>Uporabniško ime</ThemedText>
            <TextInput
              style={[styles.input, { 
                backgroundColor: barvnaShema === 'dark' ? barve.card : barve.background,
                borderColor: barve.border,
                color: barve.text,
              }]}
              value={uporabniskoIme}
              onChangeText={setUporabniskoIme}
              placeholder="Vnesite uporabniško ime"
              placeholderTextColor={barve.textMuted}
              editable={!shranjevanje}
            />
          </View>

          <View style={styles.inputContainer}>
            <ThemedText type="bodyBold" style={styles.label}>Prikazno ime</ThemedText>
            <TextInput
              style={[styles.input, { 
                backgroundColor: barvnaShema === 'dark' ? barve.card : barve.background,
                borderColor: barve.border,
                color: barve.text,
              }]}
              value={prikaznoIme}
              onChangeText={setPrikaznoIme}
              placeholder="Vnesite prikazno ime"
              placeholderTextColor={barve.textMuted}
              editable={!shranjevanje}
            />
          </View>

          <View style={styles.inputContainer}>
            <ThemedText type="bodyBold" style={styles.label}>Opis</ThemedText>
            <TextInput
              style={[styles.input, styles.bioInput, { 
                backgroundColor: barvnaShema === 'dark' ? barve.card : barve.background,
                borderColor: barve.border,
                color: barve.text,
              }]}
              value={opis}
              onChangeText={setOpis}
              placeholder="Povejte nam o sebi"
              placeholderTextColor={barve.textMuted}
              multiline
              numberOfLines={3}
              editable={!shranjevanje}
            />
          </View>

          <View style={styles.inputContainer}>
            <View style={styles.labelWithIcon}>
              <IconSymbol name="location.fill" size={16} color={barve.icon} />
              <ThemedText type="bodyBold" style={styles.label}>Lokacija</ThemedText>
            </View>
            <TextInput
              style={[styles.input, { 
                backgroundColor: barvnaShema === 'dark' ? barve.card : barve.background,
                borderColor: barve.border,
                color: barve.text,
              }]}
              value={lokacija}
              onChangeText={setLokacija}
              placeholder="Vnesite svojo lokacijo (npr. Ljubljana, Slovenija)"
              placeholderTextColor={barve.textMuted}
              editable={!shranjevanje}
            />
          </View>

          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: barve.primary }, shranjevanje && { opacity: 0.6 }]}
            onPress={shraniProfil}
            activeOpacity={0.7}
            disabled={shranjevanje}>
            <ThemedText type="bodyBold" lightColor={CleanPaceColors.offWhite} darkColor={CleanPaceColors.offWhite}>
              {shranjevanje ? 'Shranjevanje...' : 'Shrani profil'}
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* ── Izbirnik barve sledi ── */}
        <View style={styles.trailColorSection}>
          <View style={styles.trailColorHeader}>
            <IconSymbol name="paintbrush.fill" size={18} color={barve.primary} />
            <ThemedText type="h3" style={{ marginLeft: Spacing.xs }}>Barva sledi</ThemedText>
          </View>
          <ThemedText type="bodySmall" variant="muted" style={{ marginBottom: Spacing.md }}>
            Izberite barvo vaše tekalne sledi na zemljevidu
          </ThemedText>
          <View style={styles.colorGrid}>
            {TRAIL_COLORS.map((bs) => (
              <TouchableOpacity
                key={bs.hex}
                activeOpacity={0.7}
                onPress={() => {
                  setIzbranaBarvaSled(bs.hex);
                  shraniBarvoSledi(bs.hex);
                }}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: bs.hex },
                  izbranaBarvaSled === bs.hex && {
                    borderWidth: 3,
                    borderColor: barvnaShema === 'dark' ? CleanPaceColors.offWhite : CleanPaceColors.charcoal,
                    transform: [{ scale: 1.15 }],
                  },
                ]}
              >
                {izbranaBarvaSled === bs.hex && (
                  <IconSymbol name="checkmark" size={16} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            ))}
          </View>
          {/* Predogled sledi */}
          <View style={styles.trailPreview}>
            <View style={[styles.trailPreviewDot, { backgroundColor: '#4CAF50' }]} />
            <View style={[styles.trailPreviewLine, { backgroundColor: izbranaBarvaSled }]} />
            <View style={[styles.trailPreviewDot, { backgroundColor: '#F44336' }]} />
          </View>
          <ThemedText type="caption" variant="muted" style={{ textAlign: 'center' }}>
            {TRAIL_COLORS.find((bs) => bs.hex === izbranaBarvaSled)?.name ?? 'Po meri'}
          </ThemedText>
        </View>

        <View style={styles.statsSection}>
          <ThemedText type="h3" style={styles.sectionTitle}>Vaša statistika</ThemedText>
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { 
              backgroundColor: barvnaShema === 'dark' ? barve.card : barve.backgroundSecondary,
              borderWidth: 1,
              borderColor: barve.border,
            }]}>
              <ThemedText type="h2" variant="primary">{statistika?.total_runs ?? 0}</ThemedText>
              <ThemedText type="bodySmall" variant="muted">Skupaj tekov</ThemedText>
            </View>
            <View style={[styles.statCard, { 
              backgroundColor: barvnaShema === 'dark' ? barve.card : barve.backgroundSecondary,
              borderWidth: 1,
              borderColor: barve.border,
            }]}>
              <ThemedText type="h2" variant="primary">{statistika?.total_distance_km?.toFixed(1) ?? '0.0'}</ThemedText>
              <ThemedText type="bodySmall" variant="muted">Skupna razdalja (km)</ThemedText>
            </View>
          </View>
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { 
              backgroundColor: barvnaShema === 'dark' ? barve.card : barve.backgroundSecondary,
              borderWidth: 1,
              borderColor: barve.border,
            }]}>
              <ThemedText type="h2" variant="primary">{statistika?.current_streak ?? 0}</ThemedText>
              <ThemedText type="bodySmall" variant="muted">Trenutni niz</ThemedText>
            </View>
            <View style={[styles.statCard, { 
              backgroundColor: barvnaShema === 'dark' ? barve.card : barve.backgroundSecondary,
              borderWidth: 1,
              borderColor: barve.border,
            }]}>
              <ThemedText type="h2" variant="primary">{statistika?.best_pace ?? '--'}</ThemedText>
              <ThemedText type="bodySmall" variant="muted">Najboljši tempo</ThemedText>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.logoutButton, { 
              borderColor: barve.border,
              borderWidth: 1,
            }]}
            onPress={obdelajOdjavo}
            activeOpacity={0.7}>
            <IconSymbol name="arrow.right.square.fill" size={20} color={barve.primary} />
            <ThemedText type="bodyBold" variant="primary">
              Odjava
            </ThemedText>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  header: {
    paddingTop: 60,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  content: {
    flex: 1,
    padding: Spacing.md,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  imageContainer: {
    position: 'relative',
    marginBottom: Spacing.md,
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breathingRing: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    opacity: 0.2,
  },
  profileImage: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: CleanPaceColors.offWhite,
  },
  profileImagePlaceholder: {
    width: 110,
    height: 110,
    borderRadius: 55,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: CleanPaceColors.offWhite,
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
  },
  inputContainer: {
    width: '100%',
    marginBottom: Spacing.md,
  },
  label: {
    marginBottom: Spacing.sm,
  },
  labelWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.card,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
  },
  bioInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  saveButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.card,
    marginTop: Spacing.sm,
  },
  statsSection: {
    marginTop: Spacing.md,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  statCard: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.card,
    alignItems: 'center',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.card,
    marginTop: Spacing.md,
  },
  trailColorSection: {
    marginBottom: Spacing.lg,
    paddingTop: Spacing.md,
  },
  trailColorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  colorSwatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trailPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.xl,
  },
  trailPreviewDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  trailPreviewLine: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    marginHorizontal: 4,
  },
});
