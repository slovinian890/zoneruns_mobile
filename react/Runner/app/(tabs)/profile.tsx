import { StyleSheet, View, TouchableOpacity, Alert, ScrollView, Animated } from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useAmbientVariant } from '@/components/ambient-background';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/glass-card';
import { Input } from '@/components/ui/input';
import { ScreenHeader } from '@/components/ui/screen-header';
import { StatBlock } from '@/components/ui/stat-block';
import { TAB_BAR_HEIGHT } from '@/components/ui/floating-tab-bar';
import { AuroraColors, Spacing } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useFocusEffect, useRouter } from 'expo-router';
import { getCurrentProfile, updateProfile, uploadAvatar } from '@/services/profileService';
import { getCurrentUserStats } from '@/services/statsService';
import { signOut } from '@/services/authService';
import { UserStats, MyHero } from '@/services/supabase';
import { TRAIL_COLORS, getTrailColor, setTrailColor as shraniBarvoSledi, DEFAULT_TRAIL_COLOR } from '@/services/trailColorService';
import { getMyTerritoryStats } from '@/services/territoryService';
import { getMyHeroes } from '@/services/heroesService';
import { HeroSprite } from '@/components/hero-sprite';

export default function ProfileScreen() {
  useAmbientVariant('default');
  const insets = useSafeAreaInsets();
  const [statistika, setStatistika] = useState<UserStats | null>(null);
  const [uporabniskoIme, setUporabniskoIme] = useState('');
  const [prikaznoIme, setPrikaznoIme] = useState('');
  const [opis, setOpis] = useState('');
  const [lokacija, setLokacija] = useState('');
  const [slikaProfilaUrl, setSlikaProfilaUrl] = useState<string | null>(null);
  const [nalaganje, setNalaganje] = useState(true);
  const [shranjevanje, setShranjevanje] = useState(false);
  const [izbranaBarvaSled, setIzbranaBarvaSled] = useState(DEFAULT_TRAIL_COLOR);
  const [steviloPolj, setSteviloPolj] = useState(0);
  const [aktivniJunak, setAktivniJunak] = useState<MyHero | null>(null);
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
      getMyTerritoryStats().then((s) => setSteviloPolj(s.hexCount));
      getMyHeroes().then((junaki) => setAktivniJunak(junaki.find((j) => j.is_active) ?? null));
    }, [])
  );

  const naloziProfil = async () => {
    try {
      const rezultat = await getCurrentProfile();
      if (rezultat.success && rezultat.profile) {
        setUporabniskoIme(rezultat.profile.username);
        setPrikaznoIme(rezultat.profile.display_name || '');
        setOpis(rezultat.profile.bio || '');
        setLokacija(rezultat.profile.location || '');
        setSlikaProfilaUrl(rezultat.profile.avatar_url);

        // The server is the source of truth for trail color (visible to
        // others on their territory) – sync the local cache if it differs.
        if (rezultat.profile.trail_color) {
          setIzbranaBarvaSled(rezultat.profile.trail_color);
          shraniBarvoSledi(rezultat.profile.trail_color);
        }
      }
    } catch (napaka) {
      console.error('Error loading profile:', napaka);
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
      console.error('Error loading stats:', napaka);
    }
  };

  // Pick an image from the gallery, upload it to the server, and update the profile image URL
  const izberSliko = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please allow access to your photo library to add a profile picture.');
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
          Alert.alert('Success', 'Profile picture updated!');
        } else {
          Alert.alert('Error', rezultatNalozitve.error || 'Failed to upload image');
        }
        setShranjevanje(false);
      }
    } catch (napaka) {
      console.error('Error picking image:', napaka);
      Alert.alert('Error', 'Failed to pick image');
      setShranjevanje(false);
    }
  };

  const posnamiSliko = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please allow camera access to take a picture.');
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
          Alert.alert('Success', 'Profile picture updated!');
        } else {
          Alert.alert('Error', rezultatNalozitve.error || 'Failed to upload image');
        }
        setShranjevanje(false);
      }
    } catch (napaka) {
      console.error('Error taking picture:', napaka);
      Alert.alert('Error', 'Failed to take picture');
      setShranjevanje(false);
    }
  };

  const prikaziIzbirnikSlik = () => {
    Alert.alert(
      'Profile picture',
      'Choose an option',
      [
        { text: 'Camera', onPress: posnamiSliko },
        { text: 'Gallery', onPress: izberSliko },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const shraniProfil = async () => {
    if (!uporabniskoIme.trim()) {
      Alert.alert('Error', 'Username cannot be empty');
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
      Alert.alert('Success', 'Profile updated!');
    } else {
      Alert.alert('Error', rezultat.error || 'Failed to update profile');
    }
  };

  const obdelajOdjavo = async () => {
    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
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
          <ThemedText type="body" variant="secondary">Loading...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader title="Profile" />

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + Spacing.lg }}
        showsVerticalScrollIndicator={false}>
        <View style={styles.profileSection}>
          <View style={styles.avatarRow}>
            <TouchableOpacity onPress={prikaziIzbirnikSlik} style={styles.imageContainer} activeOpacity={0.7} disabled={shranjevanje}>
              <Animated.View
                style={[
                  styles.breathingRing,
                  {
                    backgroundColor: AuroraColors.primarySoft,
                    transform: [{ scale: dihalniPulz }],
                  }
                ]}
              />
              {slikaProfilaUrl ? (
                <Image source={{ uri: slikaProfilaUrl }} style={styles.profileImage} />
              ) : (
                <View style={styles.profileImagePlaceholder}>
                  <IconSymbol name="person.fill" size={48} color={AuroraColors.primary} />
                </View>
              )}
              <View style={styles.editBadge}>
                <IconSymbol name="camera.fill" size={16} color={AuroraColors.onPrimary} />
              </View>
            </TouchableOpacity>

            {aktivniJunak && (
              <TouchableOpacity
                onPress={() => usmerjevalnik.push('/heroes')}
                style={styles.heroContainer}
                activeOpacity={0.7}>
                <View style={styles.heroCircle}>
                  <HeroSprite slug={aktivniJunak.slug} tier={aktivniJunak.tier ?? 1} size={76} />
                </View>
                <ThemedText type="caption" variant="muted" numberOfLines={1} style={styles.heroLabel}>
                  {aktivniJunak.name}
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.inputContainer}>
            <ThemedText type="bodyBold" style={styles.label}>Username</ThemedText>
            <Input value={uporabniskoIme} onChangeText={setUporabniskoIme} placeholder="Enter username" editable={!shranjevanje} />
          </View>

          <View style={styles.inputContainer}>
            <ThemedText type="bodyBold" style={styles.label}>Display name</ThemedText>
            <Input value={prikaznoIme} onChangeText={setPrikaznoIme} placeholder="Enter display name" editable={!shranjevanje} />
          </View>

          <View style={styles.inputContainer}>
            <ThemedText type="bodyBold" style={styles.label}>Bio</ThemedText>
            <Input value={opis} onChangeText={setOpis} placeholder="Tell us about yourself" multiline editable={!shranjevanje} />
          </View>

          <View style={styles.inputContainer}>
            <View style={styles.labelWithIcon}>
              <IconSymbol name="location.fill" size={16} color={AuroraColors.textMuted} />
              <ThemedText type="bodyBold" style={styles.label}>Location</ThemedText>
            </View>
            <Input
              value={lokacija}
              onChangeText={setLokacija}
              placeholder="Enter your location (e.g. Ljubljana, Slovenia)"
              editable={!shranjevanje}
            />
          </View>

          <Button
            label={shranjevanje ? 'Saving...' : 'Save profile'}
            onPress={shraniProfil}
            disabled={shranjevanje}
            loading={shranjevanje}
            style={styles.saveButton}
          />
        </View>

        {/* ── Trail color picker ── */}
        <View style={styles.trailColorSection}>
          <View style={styles.trailColorHeader}>
            <IconSymbol name="paintbrush.fill" size={18} color={AuroraColors.primary} />
            <ThemedText type="h3" style={{ marginLeft: Spacing.xs }}>Trail color</ThemedText>
          </View>
          <ThemedText type="bodySmall" variant="muted" style={{ marginBottom: Spacing.md }}>
            Choose the color of your running trail on the map
          </ThemedText>
          <View style={styles.colorGrid}>
            {TRAIL_COLORS.map((bs) => (
              <TouchableOpacity
                key={bs.hex}
                activeOpacity={0.7}
                onPress={() => {
                  setIzbranaBarvaSled(bs.hex);
                  shraniBarvoSledi(bs.hex);
                  updateProfile({ trail_color: bs.hex });
                }}
                style={[
                  styles.colorSwatch,
                  { backgroundColor: bs.hex },
                  izbranaBarvaSled === bs.hex && styles.colorSwatchSelected,
                ]}
              >
                {izbranaBarvaSled === bs.hex && (
                  <IconSymbol name="checkmark" size={16} color={AuroraColors.text} />
                )}
              </TouchableOpacity>
            ))}
          </View>
          {/* Trail preview */}
          <View style={styles.trailPreview}>
            <View style={[styles.trailPreviewDot, { backgroundColor: AuroraColors.success }]} />
            <View style={[styles.trailPreviewLine, { backgroundColor: izbranaBarvaSled }]} />
            <View style={[styles.trailPreviewDot, { backgroundColor: AuroraColors.danger }]} />
          </View>
          <ThemedText type="caption" variant="muted" style={{ textAlign: 'center' }}>
            {TRAIL_COLORS.find((bs) => bs.hex === izbranaBarvaSled)?.name ?? 'Custom'}
          </ThemedText>
        </View>

        <View style={styles.statsSection}>
          <ThemedText type="h3" style={styles.sectionTitle}>Your stats</ThemedText>
          <GlassCard style={styles.statsCard}>
            <StatBlock
              stats={[
                { value: String(statistika?.total_runs ?? 0), label: 'Total runs' },
                { value: statistika?.total_distance_km?.toFixed(1) ?? '0.0', label: 'Distance (km)' },
              ]}
            />
            <View style={styles.statsRowGap} />
            <StatBlock
              stats={[
                { value: String(statistika?.current_streak ?? 0), label: 'Current streak' },
                { value: statistika?.best_pace ?? '--', label: 'Best pace' },
              ]}
            />
          </GlassCard>

          <GlassCard style={styles.territoryCardWrap}>
            <View style={styles.territoryCard}>
              <IconSymbol name="hexagon.fill" size={22} color={AuroraColors.primary} />
              <View style={{ flex: 1 }}>
                <ThemedText type="h3" variant="primary">{steviloPolj.toLocaleString()}</ThemedText>
                <ThemedText type="bodySmall" variant="muted">Tiles captured</ThemedText>
              </View>
            </View>
          </GlassCard>

          <GlassCard onPress={() => usmerjevalnik.push('/badges')} style={styles.territoryCardWrap}>
            <View style={styles.territoryCard}>
              <IconSymbol name="trophy.fill" size={22} color={AuroraColors.primary} />
              <View style={{ flex: 1 }}>
                <ThemedText type="h3" variant="primary">Achievements</ThemedText>
                <ThemedText type="bodySmall" variant="muted">{statistika?.coins ?? 0} coins · unlock badges</ThemedText>
              </View>
              <IconSymbol name="chevron.right" size={18} color={AuroraColors.textFaint} />
            </View>
          </GlassCard>

          <GlassCard onPress={() => usmerjevalnik.push('/heroes')} style={styles.territoryCardWrap}>
            <View style={styles.territoryCard}>
              <View style={styles.heroCardPreview}>
                {aktivniJunak ? (
                  <HeroSprite slug={aktivniJunak.slug} tier={aktivniJunak.tier ?? 1} size={28} animated={false} />
                ) : (
                  <IconSymbol name="star.fill" size={22} color={AuroraColors.primary} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText type="h3" variant="primary">Heroes</ThemedText>
                <ThemedText type="bodySmall" variant="muted">Unlock and upgrade your heroes</ThemedText>
              </View>
              <IconSymbol name="chevron.right" size={18} color={AuroraColors.textFaint} />
            </View>
          </GlassCard>

          <GlassCard onPress={() => usmerjevalnik.push('/leaderboard')} style={styles.territoryCardWrap}>
            <View style={styles.territoryCard}>
              <IconSymbol name="chart.line.uptrend.xyaxis" size={22} color={AuroraColors.primary} />
              <View style={{ flex: 1 }}>
                <ThemedText type="h3" variant="primary">Leaderboard</ThemedText>
                <ThemedText type="bodySmall" variant="muted">Compare yourself with other runners</ThemedText>
              </View>
              <IconSymbol name="chevron.right" size={18} color={AuroraColors.textFaint} />
            </View>
          </GlassCard>

          <GlassCard onPress={() => usmerjevalnik.push('/groups')} style={styles.territoryCardWrap}>
            <View style={styles.territoryCard}>
              <IconSymbol name="person.2.fill" size={22} color={AuroraColors.primary} />
              <View style={{ flex: 1 }}>
                <ThemedText type="h3" variant="primary">Groups</ThemedText>
                <ThemedText type="bodySmall" variant="muted">Compete as a team with friends</ThemedText>
              </View>
              <IconSymbol name="chevron.right" size={18} color={AuroraColors.textFaint} />
            </View>
          </GlassCard>

          <TouchableOpacity style={styles.logoutButton} onPress={obdelajOdjavo} activeOpacity={0.7}>
            <IconSymbol name="arrow.right.square.fill" size={20} color={AuroraColors.danger} />
            <ThemedText type="bodyBold" lightColor={AuroraColors.danger} darkColor={AuroraColors.danger}>
              Sign out
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
    backgroundColor: 'transparent',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: Spacing.md,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    marginBottom: Spacing.md,
  },
  imageContainer: {
    position: 'relative',
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroContainer: {
    alignItems: 'center',
    gap: 4,
    width: 96,
  },
  heroCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AuroraColors.surfaceSolid,
    borderWidth: 2,
    borderColor: AuroraColors.primary,
    overflow: 'hidden',
  },
  heroLabel: {
    maxWidth: 96,
  },
  heroCardPreview: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breathingRing: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
  },
  profileImage: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 2,
    borderColor: AuroraColors.primary,
  },
  profileImagePlaceholder: {
    width: 110,
    height: 110,
    borderRadius: 55,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: AuroraColors.primary,
    backgroundColor: AuroraColors.surfaceSolid,
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
    borderColor: AuroraColors.bg,
    backgroundColor: AuroraColors.primary,
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
  saveButton: {
    marginTop: Spacing.sm,
    width: '100%',
  },
  statsSection: {
    marginTop: Spacing.md,
  },
  sectionTitle: {
    marginBottom: Spacing.md,
  },
  statsCard: {
    marginBottom: Spacing.md,
  },
  statsRowGap: {
    height: Spacing.md,
  },
  territoryCardWrap: {
    marginBottom: Spacing.md,
  },
  territoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: 14,
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: AuroraColors.danger,
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
  colorSwatchSelected: {
    borderWidth: 3,
    borderColor: AuroraColors.text,
    transform: [{ scale: 1.15 }],
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
