import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import {
  getDuration,
  motionDurations,
  motionEasing,
} from "@/src/theme/motion";

type FadeSlideInProps = {
  visible: boolean;
  children: ReactNode;
  reduceMotion?: boolean;
  duration?: number;
  slideDistance?: number;
  style?: StyleProp<ViewStyle>;
  unmountOnExit?: boolean;
};

export function FadeSlideIn({
  visible,
  children,
  reduceMotion,
  duration = motionDurations.medium,
  slideDistance = 4,
  style,
  unmountOnExit = true,
}: FadeSlideInProps) {
  const prefersReducedMotion = useReducedMotion();
  const shouldReduceMotion = reduceMotion ?? prefersReducedMotion;
  const resolvedDuration = getDuration(shouldReduceMotion, duration);

  const [shouldRender, setShouldRender] = useState(visible);
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const translateY = useRef(
    new Animated.Value(visible || shouldReduceMotion ? 0 : slideDistance)
  ).current;

  useEffect(() => {
    if (visible) {
      setShouldRender(true);

      if (resolvedDuration === 0) {
        opacity.setValue(1);
        translateY.setValue(0);
        return;
      }

      opacity.setValue(0);
      translateY.setValue(slideDistance);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: resolvedDuration,
          easing: motionEasing,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: resolvedDuration,
          easing: motionEasing,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (resolvedDuration === 0) {
      opacity.setValue(0);
      if (!shouldReduceMotion) {
        translateY.setValue(slideDistance);
      }
      if (unmountOnExit) {
        setShouldRender(false);
      }
      return;
    }

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: resolvedDuration,
        easing: motionEasing,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: shouldReduceMotion ? 0 : slideDistance,
        duration: resolvedDuration,
        easing: motionEasing,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished && unmountOnExit) {
        setShouldRender(false);
      }
    });
  }, [
    opacity,
    resolvedDuration,
    shouldReduceMotion,
    slideDistance,
    translateY,
    unmountOnExit,
    visible,
  ]);

  if (!shouldRender) {
    return null;
  }

  return (
    <Animated.View
      style={[
        {
          opacity,
          transform: shouldReduceMotion ? undefined : [{ translateY }],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function getPressFeedbackStyle(
  reduceMotion: boolean,
  pressedOpacity = 0.84
): ViewStyle {
  if (reduceMotion) {
    return {
      opacity: pressedOpacity,
    };
  }

  return {
    opacity: pressedOpacity,
    transform: [{ scale: 0.985 }],
  };
}
