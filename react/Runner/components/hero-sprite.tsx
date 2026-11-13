import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { getHeroSprite } from '@/constants/hero-sprites';
import { AuroraColors } from '@/constants/theme';

interface HeroSpriteProps {
  slug: string;
  tier: number;
  size?: number;
  /** Gentle idle bob — off for static contexts like a locked gallery tile. */
  animated?: boolean;
}

// Source art (160x160) frames the character with a lot of dead space, and
// tier-ups add a power aura that bleeds flush to the left/right canvas edges
// (not top/bottom) — zoom in a bit to tighten that margin, anchored to the
// bottom so feet never clip, then fade the outer edges into the surrounding
// surface so the aura reads as a soft glow instead of a hard-edged box.
const ZOOM = 1.15;
const EDGE_FADE_RATIO = 0.16;

/**
 * One hero's sprite at a given tier. When animated, bobs up and down a few
 * pixels with a slight scale breathe — deliberately subtle (no walk-cycle
 * frames exist in the source art, this is just "alive", not "moving").
 */
export function HeroSprite({ slug, tier, size = 64, animated = true }: HeroSpriteProps) {
  const bob = useSharedValue(0);

  useEffect(() => {
    if (!animated) {
      bob.value = 0;
      return;
    }
    bob.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [animated, bob]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bob.value * -3 }, { scale: 1 + bob.value * 0.03 }],
  }));

  const source = getHeroSprite(slug, tier);
  if (!source) return null;

  const zoomedSize = size * ZOOM;
  const horizontalInset = (zoomedSize - size) / 2;
  const fadeWidth = size * EDGE_FADE_RATIO;

  return (
    <Animated.View style={[{ width: size, height: size }, animated && animatedStyle]}>
      <View style={{ width: size, height: size, overflow: 'hidden' }}>
        <Image
          source={source}
          style={{
            position: 'absolute',
            width: zoomedSize,
            height: zoomedSize,
            left: -horizontalInset,
            top: -(zoomedSize - size),
          }}
          contentFit="contain"
        />
        <LinearGradient
          colors={[AuroraColors.surfaceSolid, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.edgeFade, { left: 0, width: fadeWidth }]}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['transparent', AuroraColors.surfaceSolid]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.edgeFade, { right: 0, width: fadeWidth }]}
          pointerEvents="none"
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  edgeFade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
});
