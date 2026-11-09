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

    const pill =
      aktivniZavihek === 'following' ? (
        <TouchableOpacity
          onPress={() => obdelajOdsledenje(item.id, item.username)}
          style={[styles.pill, styles.pillOutline]}
          activeOpacity={0.7}>
          <ThemedText type="bodySmall" variant="muted">Prenehaj slediti</ThemedText>
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
            {jeSleden ? 'Sledim' : 'Sledi'}
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
      <ScreenHeader
        title="Skupnost"
        subtitle={`${steviloSledim} Sledim · ${steviloSledilcev} Sledilcev`}
        actions={[
          { icon: 'magnifyingglass', onPress: () => setAktivniZavihek('search') },
          { icon: 'paperplane.fill', onPress: () => usmerjevalnik.push('/messages'), badge: nepreebranaSporocila },
        ]}>
        <View style={styles.segmentedWrap}>
          <SegmentedControl
            segments={[
              { key: 'following', label: 'Sledim' },
              { key: 'followers', label: 'Sledilci' },
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
            placeholder="Iskanje po uporabniškem imenu"
          />
        </Animated.View>
      )}

      {nalaganje ? (
        <View style={styles.loadingContainer}>
          <ThemedText type="body" variant="secondary">Nalaganje...</ThemedText>
        </View>
      ) : pridobiPodatkeSeznama().length === 0 ? (
        <EmptyState
          icon="person.2.fill"
          title={pridobiPraznoSporocilo()}
          ctaLabel={aktivniZavihek !== 'search' ? 'Poišči uporabnike' : undefined}
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
