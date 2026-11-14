import { StyleSheet, View, TouchableOpacity, Alert, FlatList, RefreshControl } from 'react-native';
import { useCallback, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { useAmbientVariant } from '@/components/ambient-background';
import { EmptyState } from '@/components/ui/empty-state';
import { ListRow, listRowDividerStyle } from '@/components/ui/list-row';
import { ScreenHeader } from '@/components/ui/screen-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { TAB_BAR_HEIGHT } from '@/components/ui/floating-tab-bar';
import { AuroraColors, BorderRadius, Spacing } from '@/constants/theme';
import { SearchBar } from '@/components/ui/search-bar';
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
import { getUnreadMessageCount } from '@/services/messagesService';
import { Profile } from '@/services/supabase';

type TipZavihka = 'following' | 'followers' | 'search';

export default function FriendsScreen() {
  useAmbientVariant('default');
  const insets = useSafeAreaInsets();
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
  const [nepreebranaSporocila, setNepreebranaSporocila] = useState(0);

  useFocusEffect(
    useCallback(() => {
      naloziPodatke();
      getUnreadMessageCount().then(setNepreebranaSporocila);
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
      console.error('Error loading data:', napaka);
    } finally {
      setNalaganje(false);
      setOsvezevanje(false);
    }
  };

  const osveziPodatke = () => {
    setOsvezevanje(true);
    naloziPodatke();
  };

  const zadnjaPoizvedbaRef = useRef('');

  const obdelajIskanje = async (poizvedba: string) => {
    zadnjaPoizvedbaRef.current = poizvedba;
    if (!poizvedba) {
      setRezultatiIskanja([]);
      return;
    }

    const rezultat = await searchProfiles(poizvedba);
    if (zadnjaPoizvedbaRef.current !== poizvedba) return; // a newer query already superseded this one
    if (rezultat.success && rezultat.profiles) {
      const filtrirani = rezultat.profiles.filter(p => p.id !== trenutniUporabnikId);
      setRezultatiIskanja(filtrirani);
    }
  };

  const obdelajSledenje = async (uporabnikId: string) => {
    const rezultat = await followUser(uporabnikId);
    if (rezultat.success) {
      Alert.alert('Success', 'You are now following this user!');
      naloziPodatke();
    } else {
      Alert.alert('Error', rezultat.error || 'Failed to follow user');
    }
  };

  const obdelajOdsledenje = (uporabnikId: string, uporabniskoIme: string) => {
    Alert.alert(
      'Unfollow',
      `Are you sure you want to unfollow ${uporabniskoIme}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfollow',
          style: 'destructive',
          onPress: async () => {
            const rezultat = await unfollowUser(uporabnikId);
            if (rezultat.success) {
              naloziPodatke();
            } else {
              Alert.alert('Error', rezultat.error || 'Failed to unfollow');
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

    const pill =
      aktivniZavihek === 'following' ? (
        <TouchableOpacity
          onPress={() => obdelajOdsledenje(item.id, item.username)}
          style={[styles.pill, styles.pillOutline]}
          activeOpacity={0.7}>
          <ThemedText type="bodySmall" variant="muted">Unfollow</ThemedText>
        </TouchableOpacity>
      ) : aktivniZavihek === 'search' ? (
        <TouchableOpacity
          onPress={() => (jeSleden ? obdelajOdsledenje(item.id, item.username) : obdelajSledenje(item.id))}
          style={[styles.pill, jeSleden ? styles.pillOutline : styles.pillFilled]}
          activeOpacity={0.7}>
          <ThemedText
            type="bodySmall"
            lightColor={jeSleden ? AuroraColors.text : AuroraColors.onPrimary}
            darkColor={jeSleden ? AuroraColors.text : AuroraColors.onPrimary}>
            {jeSleden ? 'Following' : 'Follow'}
          </ThemedText>
        </TouchableOpacity>
      ) : null;

    return (
      <ListRow
        avatarUri={item.avatar_url}
        title={item.display_name || item.username}
        subtitle={`@${item.username}`}
        trailing={pill}
        onPress={() => obdelajPritiskUporabnika(item.id)}
      />
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
        return "You aren't following anyone yet";
      case 'followers':
        return "You don't have any followers yet";
      case 'search':
        return iskalniNiz ? 'No users found' : 'Search for users';
      default:
        return '';
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader
        title="Community"
        subtitle={`${steviloSledim} Following · ${steviloSledilcev} Followers`}
        actions={[
          { icon: 'magnifyingglass', onPress: () => setAktivniZavihek('search') },
          { icon: 'paperplane.fill', onPress: () => usmerjevalnik.push('/messages'), badge: nepreebranaSporocila },
        ]}>
        <View style={styles.segmentedWrap}>
          <SegmentedControl
            segments={[
              { key: 'following', label: 'Following' },
              { key: 'followers', label: 'Followers' },
            ]}
            value={aktivniZavihek}
            onChange={(key) => setAktivniZavihek(key as TipZavihka)}
          />
        </View>
      </ScreenHeader>

      {aktivniZavihek === 'search' && (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)} style={styles.searchSection}>
          <SearchBar
            value={iskalniNiz}
            onChangeText={setIskalniNiz}
            onSearch={obdelajIskanje}
            placeholder="Search by username"
          />
        </Animated.View>
      )}

      {nalaganje ? (
        <View style={styles.loadingContainer}>
          <ThemedText type="body" variant="secondary">Loading...</ThemedText>
        </View>
      ) : pridobiPodatkeSeznama().length === 0 ? (
        <EmptyState
          icon="person.2.fill"
          title={pridobiPraznoSporocilo()}
          ctaLabel={aktivniZavihek !== 'search' ? 'Find users' : undefined}
          onPressCta={aktivniZavihek !== 'search' ? () => setAktivniZavihek('search') : undefined}
        />
      ) : (
        <FlatList
          data={pridobiPodatkeSeznama()}
          renderItem={izrisiUporabnika}
          keyExtractor={element => element.id}
          contentContainerStyle={[styles.usersList, { paddingBottom: TAB_BAR_HEIGHT + insets.bottom + Spacing.lg }]}
          ItemSeparatorComponent={() => <View style={listRowDividerStyle} />}
          showsVerticalScrollIndicator={false}
          refreshControl={
            aktivniZavihek !== 'search' ? (
              <RefreshControl refreshing={osvezevanje} onRefresh={osveziPodatke} tintColor={AuroraColors.primary} />
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
    backgroundColor: 'transparent',
  },
  segmentedWrap: {
    marginTop: Spacing.sm,
  },
  searchSection: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  usersList: {
    paddingHorizontal: Spacing.md,
  },
  pill: {
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.sm + 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  pillOutline: {
    backgroundColor: 'transparent',
    borderColor: AuroraColors.border,
  },
  pillFilled: {
    backgroundColor: AuroraColors.primary,
    borderColor: AuroraColors.primary,
  },
});
