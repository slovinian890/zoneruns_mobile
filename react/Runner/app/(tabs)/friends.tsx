import { StyleSheet, View, TextInput, TouchableOpacity, Alert, FlatList, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import { Image } from 'expo-image';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors, Spacing, BorderRadius, CleanPaceColors } from '@/constants/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useFocusEffect, useRouter } from 'expo-router';
import { 
  getFollowing, 
  getFollowers,
  unfollowUser, 
  followUser,
  getFollowerCount,
  getFollowingCount,
} from '@/services/socialService';
import { searchProfiles } from '@/services/profileService';
import { getCurrentUser } from '@/services/authService';
import { Profile } from '@/services/supabase';

type TipZavihka = 'following' | 'followers' | 'search';

export default function FriendsScreen() {
  const barvnaShema = useColorScheme();
  const barve = Colors[barvnaShema ?? 'light'];
  const usmerjevalnik = useRouter();
  const [sledim, setSledim] = useState<Profile[]>([]);
  const [sledilci, setSledilci] = useState<Profile[]>([]);
  const [rezultatiIskanja, setRezultatiIskanja] = useState<Profile[]>([]);
  const [iskalniNiz, setIskalniNiz] = useState('');
  const [aktivniZavihek, setAktivniZavihek] = useState<TipZavihka>('following');
  const [nalaganje, setNalaganje] = useState(true);
  const [osvezevanje, setOsvezevanje] = useState(false);
  const [trenutniUporabnikId, setTrenutniUporabnikId] = useState<string | null>(null);
  const [steviloSledim, setSteviloSledim] = useState(0);
  const [steviloSledilcev, setSteviloSledilcev] = useState(0);

  useFocusEffect(
    useCallback(() => {
      naloziPodatke();
    }, [])
  );

  const naloziPodatke = async () => {
    try {
      const uporabnik = await getCurrentUser();
      if (uporabnik) {
        setTrenutniUporabnikId(uporabnik.id);
        
        const [rezultatSledim, rezultatSledilci, stSledilcev, stSledim] = await Promise.all([
          getFollowing(uporabnik.id),
          getFollowers(uporabnik.id),
          getFollowerCount(uporabnik.id),
          getFollowingCount(uporabnik.id),
        ]);
        
        setSledim(rezultatSledim.data);
        setSledilci(rezultatSledilci.data);
        setSteviloSledilcev(stSledilcev);
        setSteviloSledim(stSledim);
      }
    } catch (napaka) {
      console.error('Napaka pri nalaganju podatkov:', napaka);
    } finally {
      setNalaganje(false);
      setOsvezevanje(false);
    }
  };

  const osveziPodatke = () => {
    setOsvezevanje(true);
    naloziPodatke();
  };

  const obdelajIskanje = async () => {
    if (!iskalniNiz.trim()) {
      setRezultatiIskanja([]);
      return;
    }

    const rezultat = await searchProfiles(iskalniNiz.trim());
    if (rezultat.success && rezultat.profiles) {
      const filtrirani = rezultat.profiles.filter(p => p.id !== trenutniUporabnikId);
      setRezultatiIskanja(filtrirani);
    }
  };

  const obdelajSledenje = async (uporabnikId: string) => {
    const rezultat = await followUser(uporabnikId);
    if (rezultat.success) {
      Alert.alert('Uspeh', 'Zdaj sledite temu uporabniku!');
      naloziPodatke();
    } else {
      Alert.alert('Napaka', rezultat.error || 'Sledenje uporabniku ni uspelo');
    }
  };

  const obdelajOdsledenje = (uporabnikId: string, uporabniskoIme: string) => {
    Alert.alert(
      'Prenehaj slediti',
      `Ali ste prepričani, da želite prenehati slediti ${uporabniskoIme}?`,
      [
        { text: 'Prekliči', style: 'cancel' },
        {
          text: 'Prenehaj slediti',
          style: 'destructive',
          onPress: async () => {
            const rezultat = await unfollowUser(uporabnikId);
            if (rezultat.success) {
              naloziPodatke();
            } else {
              Alert.alert('Napaka', rezultat.error || 'Odssledenje ni uspelo');
            }
          },
        },
      ]
    );
  };

  const sledinUporabniku = (uporabnikId: string) => {
    return sledim.some(s => s.id === uporabnikId);
  };

  const obdelajPritiskUporabnika = (uporabnikId: string) => {
    if (uporabnikId === trenutniUporabnikId) {
      usmerjevalnik.push('/(tabs)/profile');
    } else {
      usmerjevalnik.push({ pathname: '/user-profile', params: { userId: uporabnikId } });
    }
  };

  const izrisiUporabnika = ({ item }: { item: Profile }) => {
    const jeSleden = sledinUporabniku(item.id);
    
    return (
      <View style={[styles.userCard, { 
        backgroundColor: barvnaShema === 'dark' ? barve.card : barve.background,
        borderWidth: 1,
        borderColor: barve.border,
      }]}>
        <TouchableOpacity 
          style={styles.userInfo}
          onPress={() => obdelajPritiskUporabnika(item.id)}
          activeOpacity={0.7}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={styles.userAvatar} />
          ) : (
            <View style={[styles.userAvatarPlaceholder, { backgroundColor: barve.backgroundSecondary }]}>
              <IconSymbol name="person.fill" size={24} color={barve.primary} />
            </View>
          )}
          <View style={styles.userDetails}>
            <ThemedText type="bodyBold">{item.display_name || item.username}</ThemedText>
            <ThemedText type="caption" variant="muted">@{item.username}</ThemedText>
          </View>
        </TouchableOpacity>
        
        {aktivniZavihek === 'following' ? (
          <TouchableOpacity
            onPress={() => obdelajOdsledenje(item.id, item.username)}
            style={[styles.actionButton, { 
              backgroundColor: barvnaShema === 'dark' ? barve.background : barve.backgroundSecondary,
              borderWidth: 1,
              borderColor: barve.border,
            }]}
            activeOpacity={0.7}>
            <ThemedText type="bodySmall" variant="muted">Prenehaj slediti</ThemedText>
          </TouchableOpacity>
        ) : aktivniZavihek === 'search' ? (
          <TouchableOpacity
            onPress={() => jeSleden ? obdelajOdsledenje(item.id, item.username) : obdelajSledenje(item.id)}
            style={[
              styles.actionButton, 
              { 
                backgroundColor: jeSleden ? barve.backgroundSecondary : barve.primary,
                borderWidth: 1,
                borderColor: jeSleden ? barve.border : barve.primary,
              }
            ]}
            activeOpacity={0.7}>
            <ThemedText 
              type="bodySmall" 
              lightColor={jeSleden ? barve.text : CleanPaceColors.offWhite}
              darkColor={jeSleden ? barve.text : CleanPaceColors.offWhite}>
              {jeSleden ? 'Sledim' : 'Sledi'}
            </ThemedText>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const pridobiPodatkeSeznama = () => {
    switch (aktivniZavihek) {
      case 'following':
        return sledim;
      case 'followers':
        return sledilci;
      case 'search':
        return rezultatiIskanja;
      default:
        return [];
    }
  };

  const pridobiPraznoSporocilo = () => {
    switch (aktivniZavihek) {
      case 'following':
        return 'Še ne sledite nikomur';
      case 'followers':
        return 'Še nimate sledilcev';
      case 'search':
        return iskalniNiz ? 'Ni najdenih uporabnikov' : 'Iščite uporabnike';
      default:
        return '';
    }
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { 
        backgroundColor: barvnaShema === 'dark' ? barve.card : barve.backgroundSecondary,
        borderBottomWidth: 1,
        borderBottomColor: barve.border,
      }]}>
        <ThemedText type="h3">Skupnost</ThemedText>
        <View style={styles.statsRow}>
          <ThemedText type="bodySmall" variant="muted">
            {steviloSledim} Sledim · {steviloSledilcev} Sledilcev
          </ThemedText>
        </View>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[
            styles.tab,
            { 
              borderWidth: 1,
              borderColor: aktivniZavihek === 'following' ? barve.primary : barve.border,
              backgroundColor: aktivniZavihek === 'following' ? barve.primary : barve.background,
            },
          ]}
          onPress={() => setAktivniZavihek('following')}
          activeOpacity={0.7}>
          <ThemedText
            type="bodyBold"
            lightColor={aktivniZavihek === 'following' ? CleanPaceColors.offWhite : barve.text}
            darkColor={aktivniZavihek === 'following' ? CleanPaceColors.offWhite : barve.text}>
            Sledim
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            { 
              borderWidth: 1,
              borderColor: aktivniZavihek === 'followers' ? barve.primary : barve.border,
              backgroundColor: aktivniZavihek === 'followers' ? barve.primary : barve.background,
            },
          ]}
          onPress={() => setAktivniZavihek('followers')}
          activeOpacity={0.7}>
          <ThemedText
            type="bodyBold"
            lightColor={aktivniZavihek === 'followers' ? CleanPaceColors.offWhite : barve.text}
            darkColor={aktivniZavihek === 'followers' ? CleanPaceColors.offWhite : barve.text}>
            Sledilci
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            { 
              borderWidth: 1,
              borderColor: aktivniZavihek === 'search' ? barve.primary : barve.border,
              backgroundColor: aktivniZavihek === 'search' ? barve.primary : barve.background,
            },
          ]}
          onPress={() => setAktivniZavihek('search')}
          activeOpacity={0.7}>
          <IconSymbol 
            name="magnifyingglass" 
            size={18} 
            color={aktivniZavihek === 'search' ? CleanPaceColors.offWhite : barve.text} 
          />
        </TouchableOpacity>
      </View>

      {aktivniZavihek === 'search' && (
        <View style={[styles.searchSection, { borderBottomColor: barve.border }]}>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, {
                backgroundColor: barvnaShema === 'dark' ? barve.card : barve.background,
                borderColor: barve.border,
                color: barve.text,
              }]}
              value={iskalniNiz}
              onChangeText={setIskalniNiz}
              placeholder="Iskanje po uporabniškem imenu"
              placeholderTextColor={barve.textMuted}
              onSubmitEditing={obdelajIskanje}
              returnKeyType="search"
            />
            <TouchableOpacity
              style={[styles.searchButton, { backgroundColor: barve.primary }]}
              onPress={obdelajIskanje}
              activeOpacity={0.7}>
              <IconSymbol name="magnifyingglass" size={20} color={CleanPaceColors.offWhite} />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {nalaganje ? (
        <View style={styles.loadingContainer}>
          <ThemedText type="body" variant="secondary">Nalaganje...</ThemedText>
        </View>
      ) : pridobiPodatkeSeznama().length === 0 ? (
        <View style={styles.emptyState}>
          <IconSymbol name="person.2.fill" size={64} color={barve.icon} />
          <ThemedText type="h3" style={styles.emptyText}>{pridobiPraznoSporocilo()}</ThemedText>
        </View>
      ) : (
        <FlatList
          data={pridobiPodatkeSeznama()}
          renderItem={izrisiUporabnika}
          keyExtractor={element => element.id}
          contentContainerStyle={styles.usersList}
          showsVerticalScrollIndicator={false}
          refreshControl={
            aktivniZavihek !== 'search' ? (
              <RefreshControl refreshing={osvezevanje} onRefresh={osveziPodatke} />
            ) : undefined
          }
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 60,
    paddingBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  statsRow: {
    marginTop: Spacing.xs,
  },
  tabs: {
    flexDirection: 'row',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchSection: {
    padding: Spacing.md,
    paddingTop: 0,
    borderBottomWidth: 1,
  },
  inputRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.card,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    fontSize: 16,
  },
  searchButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  usersList: {
    padding: Spacing.md,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderRadius: BorderRadius.card,
    marginBottom: Spacing.sm,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  userAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: Spacing.sm,
  },
  userAvatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  userDetails: {
    flex: 1,
  },
  actionButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.small,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  emptyText: {
    marginTop: Spacing.md,
    textAlign: 'center',
  },
});
