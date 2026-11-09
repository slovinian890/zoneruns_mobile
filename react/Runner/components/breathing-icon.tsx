import { PropsWithChildren, useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

/** Gentle, slow breathing scale+fade for a static empty-state icon or illustration. */
export function BreathingIcon({ children }: PropsWithChildren) {
  const reducedMotion = useReducedMotion();
  const t = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    t.set(withRepeat(withTiming(1, { duration: 2200, easing: EASE_IN_OUT }), -1, true));
  }, [reducedMotion, t]);

  const style = useAnimatedStyle(() => {
    const p = reducedMotion ? 0 : t.get();
    return {
      transform: [{ scale: 1 + p * 0.08 }],
      opacity: 0.85 + p * 0.15,
    };
  });

  return <Animated.View style={style}>{children}</Animated.View>;
}
