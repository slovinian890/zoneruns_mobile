import { StyleSheet, View, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import { Image } from 'expo-image';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius, CleanPaceColors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { getProfileById } from '@/services/profileService';
import { getUserStats } from '@/services/statsService';
import { followUser, unfollowUser, isFollowing, getFollowerCount, getFollowingCount } from '@/services/socialService';
import { Profile, UserStats } from '@/services/supabase';

export default function UserProfileScreen() {
  const barvnaShema = useColorScheme();
  const barve = Colors[barvnaShema ?? 'light'];
  const usmerjevalnik = useRouter();
  const { userId: uporabnikId } = useLocalSearchParams<{ userId: string }>();
  
  const [profil, setProfil] = useState<Profile | null>(null);
  const [statistika, setStatistika] = useState<UserStats | null>(null);
  const [nalaganje, setNalaganje] = useState(true);
  const [sledinUporabniku, setSledinUporabniku] = useState(false);
  const [steviloSledilcev, setSteviloSledilcev] = useState(0);
  const [steviloSledim, setSteviloSledim] = useState(0);
  const [nalaganjeDejanja, setNalaganjeDejanja] = useState(false);

  useEffect(() => {
    if (uporabnikId) {
      naloziPodatkeProfila();
    }
  }, [uporabnikId]);

  // Naloži vse podatke profila vzporedno – profil, statistiko, stanje sledenja in števce
  const naloziPodatkeProfila = async () => {
    if (!uporabnikId) return;
    
    try {
      setNalaganje(true);
      const [rezultatProfila, rezultatStatistike, sledenje, stSledilcev, stSledim] = await Promise.all([
        getProfileById(uporabnikId),
        getUserStats(uporabnikId),
        isFollowing(uporabnikId),
        getFollowerCount(uporabnikId),
        getFollowingCount(uporabnikId),
      ]);

      if (rezultatProfila.success && rezultatProfila.profile) {
        setProfil(rezultatProfila.profile);
      }

      if (rezultatStatistike.success && rezultatStatistike.stats) {
        setStatistika(rezultatStatistike.stats);
      }

      setSledinUporabniku(sledenje);
      setSteviloSledilcev(stSledilcev);
      setSteviloSledim(stSledim);
    } catch (napaka) {
      console.error('Napaka pri nalaganju profila:', napaka);
      Alert.alert('Napaka', 'Nalaganje profila ni uspelo');
    } finally {
      setNalaganje(false);
    }
  };

  const preklopiSledenje = async () => {
    if (!uporabnikId) return;
    
    setNalaganjeDejanja(true);
    const rezultat = sledinUporabniku ? await unfollowUser(uporabnikId) : await followUser(uporabnikId);
    setNalaganjeDejanja(false);

    if (rezultat.success) {
      setSledinUporabniku(!sledinUporabniku);
      setSteviloSledilcev(prej => sledinUporabniku ? prej - 1 : prej + 1);
    } else {
      Alert.alert('Napaka', rezultat.error || 'Posodobitev stanja sledenja ni uspela');
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

  if (!profil) {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.errorContainer}>
          <ThemedText type="body" variant="secondary">Profil ni najden</ThemedText>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: barve.primary }]}
            onPress={() => usmerjevalnik.back()}
            activeOpacity={0.7}>
            <ThemedText type="bodyBold" lightColor={CleanPaceColors.offWhite} darkColor={CleanPaceColors.offWhite}>
              Nazaj
            </ThemedText>
          </TouchableOpacity>
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
        <TouchableOpacity onPress={() => usmerjevalnik.back()} style={styles.backButtonIcon}>
          <IconSymbol name="chevron.left" size={24} color={barve.text} />
        </TouchableOpacity>
        <ThemedText type="h3">Profil</ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profileSection}>
          {/* Profilna slika */}
          <View style={styles.imageContainer}>
            {profil.avatar_url ? (
              <Image source={{ uri: profil.avatar_url }} style={styles.profileImage} />
            ) : (
              <View style={[styles.profileImagePlaceholder, { backgroundColor: barve.backgroundSecondary }]}>
                <IconSymbol name="person.fill" size={48} color={barve.primary} />
              </View>
            )}
          </View>

          {/* Podatki uporabnika */}
          <ThemedText type="h2" style={styles.displayName}>
            {profil.display_name || profil.username}
          </ThemedText>
          <ThemedText type="body" variant="muted" style={styles.username}>
            @{profil.username}
          </ThemedText>

          {/* Lokacija */}
          {profil.location && (
            <View style={styles.locationContainer}>
              <IconSymbol name="location.fill" size={16} color={barve.icon} />
              <ThemedText type="body" variant="muted" style={styles.locationText}>
                {profil.location}
              </ThemedText>
            </View>
          )}

          {/* Opis */}
          {profil.bio && (
            <ThemedText type="body" style={styles.bio}>
              {profil.bio}
            </ThemedText>
          )}

          {/* Statistika sledenja */}
          <View style={styles.followStats}>
            <View style={styles.followStatItem}>
              <ThemedText type="h3" variant="primary">{steviloSledim}</ThemedText>
              <ThemedText type="bodySmall" variant="muted">Sledim</ThemedText>
            </View>
            <View style={[styles.statDivider, { backgroundColor: barve.border }]} />
            <View style={styles.followStatItem}>
              <ThemedText type="h3" variant="primary">{steviloSledilcev}</ThemedText>
              <ThemedText type="bodySmall" variant="muted">Sledilcev</ThemedText>
            </View>
          </View>

          {/* Gumb za sledenje */}
          <TouchableOpacity
            style={[
              styles.followButton,
              {
                backgroundColor: sledinUporabniku ? barve.backgroundSecondary : barve.primary,
                borderWidth: 1,
                borderColor: sledinUporabniku ? barve.border : barve.primary,
              },
              nalaganjeDejanja && { opacity: 0.6 }
            ]}
            onPress={preklopiSledenje}
            activeOpacity={0.7}
            disabled={nalaganjeDejanja}>
            <ThemedText
              type="bodyBold"
              lightColor={sledinUporabniku ? barve.text : CleanPaceColors.offWhite}
              darkColor={sledinUporabniku ? barve.text : CleanPaceColors.offWhite}>
              {nalaganjeDejanja ? 'Nalaganje...' : sledinUporabniku ? 'Sledim' : 'Sledi'}
            </ThemedText>
          </TouchableOpacity>
        </View>

        {/* Sekcija statistike */}
        <View style={styles.statsSection}>
          <ThemedText type="h3" style={styles.sectionTitle}>Statistika</ThemedText>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  backButtonIcon: {
    padding: Spacing.xs,
  },
  backButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.card,
    marginTop: Spacing.md,
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
    marginBottom: Spacing.md,
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
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
  displayName: {
    marginBottom: Spacing.xs,
  },
  username: {
    marginBottom: Spacing.sm,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  locationText: {
    fontSize: 14,
  },
  bio: {
    textAlign: 'center',
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  followStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    marginBottom: Spacing.md,
  },
  followStatItem: {
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 30,
  },
  followButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.card,
    minWidth: 150,
    alignItems: 'center',
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
});
