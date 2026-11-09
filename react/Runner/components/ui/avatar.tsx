import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { AuroraColors } from '@/constants/theme';

interface AvatarProps {
  uri?: string | null;
  size?: number;
  /** Thin chartreuse ring — for the current user, someone live-running, etc. */
  active?: boolean;
}

export function Avatar({ uri, size = 44, active }: AvatarProps) {
  const dimension = active ? size : size; // ring is drawn as padding, overall footprint stays `size`
  const inner = active ? size - 4 : size;

  return (
    <View
      style={[
        styles.ring,
        {
          width: dimension,
          height: dimension,
          borderRadius: dimension / 2,
          borderWidth: active ? 2 : 0,
          borderColor: active ? AuroraColors.primary : 'transparent',
        },
      ]}>
      {uri ? (
        <Image source={{ uri }} style={{ width: inner, height: inner, borderRadius: inner / 2 }} />
      ) : (
        <View
          style={[
            styles.placeholder,
            { width: inner, height: inner, borderRadius: inner / 2 },
          ]}>
          <IconSymbol name="person.fill" size={inner * 0.5} color={AuroraColors.primary} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholder: {
    backgroundColor: AuroraColors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
