import { Platform, StyleSheet, View } from 'react-native';

import { Collapsible } from '@/components/ui/collapsible';
import { ExternalLink } from '@/components/external-link';
import ParallaxScrollView from '@/components/parallax-scroll-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, CleanPaceColors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabTwoScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  
  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: CleanPaceColors.frostBlue, dark: colors.card }}
      headerImage={
        <IconSymbol
          size={310}
          color={colors.icon}
          name="chevron.left.forwardslash.chevron.right"
          style={styles.headerImage}
        />
      }>
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="h2">Explore</ThemedText>
      </ThemedView>
      <ThemedText type="body">This app includes example code to help you get started.</ThemedText>
      <Collapsible title="File-based routing">
        <ThemedText type="body">
          This app has two screens:{' '}
          <ThemedText type="bodyBold">app/(tabs)/index.tsx</ThemedText> and{' '}
          <ThemedText type="bodyBold">app/(tabs)/explore.tsx</ThemedText>
        </ThemedText>
        <ThemedText type="body">
          The layout file in <ThemedText type="bodyBold">app/(tabs)/_layout.tsx</ThemedText>{' '}
          sets up the tab navigator.
        </ThemedText>
        <ExternalLink href="https://docs.expo.dev/router/introduction">
          <ThemedText type="link">Learn more</ThemedText>
        </ExternalLink>
      </Collapsible>
      <Collapsible title="Android, iOS, and web support">
        <ThemedText type="body">
          You can open this project on Android, iOS, and the web. To open the web version, press{' '}
          <ThemedText type="bodyBold">w</ThemedText> in the terminal running this project.
        </ThemedText>
      </Collapsible>
      <Collapsible title="Images">
        <ThemedText type="body">
          For static images, you can use the <ThemedText type="bodyBold">@2x</ThemedText> and{' '}
          <ThemedText type="bodyBold">@3x</ThemedText> suffixes to provide files for
          different screen densities
        </ThemedText>
        <View style={styles.imageContainer}>
          <IconSymbol name="photo.fill" size={64} color={colors.primary} />
        </View>
        <ExternalLink href="https://reactnative.dev/docs/images">
          <ThemedText type="link">Learn more</ThemedText>
        </ExternalLink>
      </Collapsible>
      <Collapsible title="Light and dark mode components">
        <ThemedText type="body">
          This template has light and dark mode support. The{' '}
          <ThemedText type="bodyBold">useColorScheme()</ThemedText> hook lets you inspect
          what the user&apos;s current color scheme is, and so you can adjust UI colors accordingly.
        </ThemedText>
        <ExternalLink href="https://docs.expo.dev/develop/user-interface/color-themes/">
          <ThemedText type="link">Learn more</ThemedText>
        </ExternalLink>
      </Collapsible>
      <Collapsible title="Animations">
        <ThemedText type="body">
          This template includes an example of an animated component. The{' '}
          <ThemedText type="bodyBold">components/HelloWave.tsx</ThemedText> component uses
          the powerful{' '}
          <ThemedText type="bodyBold">react-native-reanimated</ThemedText>{' '}
          library to create a waving hand animation.
        </ThemedText>
        {Platform.select({
          ios: (
            <ThemedText type="body">
              The <ThemedText type="bodyBold">components/ParallaxScrollView.tsx</ThemedText>{' '}
              component provides a parallax effect for the header image.
            </ThemedText>
          ),
        })}
      </Collapsible>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  headerImage: {
    bottom: -90,
    left: -35,
    position: 'absolute',
  },
  titleContainer: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  imageContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
});
