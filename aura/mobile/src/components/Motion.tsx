import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Platform,
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
  const shouldAnimateTranslate = !shouldReduceMotion && Platform.OS !== "web";
  const useNativeDriver = Platform.OS !== "web";

  const [shouldRender, setShouldRender] = useState(visible);
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const translateY = useRef(
    new Animated.Value(visible || !shouldAnimateTranslate ? 0 : slideDistance)
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
      if (shouldAnimateTranslate) {
        translateY.setValue(slideDistance);
      } else {
        translateY.setValue(0);
      }

      const animations = [
        Animated.timing(opacity, {
          toValue: 1,
          duration: resolvedDuration,
          easing: motionEasing,
          useNativeDriver,
        }),
      ];

      if (shouldAnimateTranslate) {
        animations.push(
          Animated.timing(translateY, {
            toValue: 0,
            duration: resolvedDuration,
            easing: motionEasing,
            useNativeDriver,
          })
        );
      }

      Animated.parallel(animations).start();
      return;
    }

    if (resolvedDuration === 0) {
      opacity.setValue(0);
      if (shouldAnimateTranslate) {
        translateY.setValue(slideDistance);
      }
      if (unmountOnExit) {
        setShouldRender(false);
      }
      return;
    }

    const exitAnimations = [
      Animated.timing(opacity, {
        toValue: 0,
        duration: resolvedDuration,
        easing: motionEasing,
        useNativeDriver,
      }),
    ];

    if (shouldAnimateTranslate) {
      exitAnimations.push(
        Animated.timing(translateY, {
          toValue: slideDistance,
          duration: resolvedDuration,
          easing: motionEasing,
          useNativeDriver,
        })
      );
    }

    Animated.parallel(exitAnimations).start(({ finished }) => {
      if (finished && unmountOnExit) {
        setShouldRender(false);
      }
    });
  }, [
    opacity,
    resolvedDuration,
    shouldAnimateTranslate,
    slideDistance,
    translateY,
    unmountOnExit,
    useNativeDriver,
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
          transform: shouldAnimateTranslate ? [{ translateY }] : undefined,
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
  if (reduceMotion || Platform.OS === "web") {
    return {
      opacity: pressedOpacity,
    };
  }

  return {
    opacity: pressedOpacity,
    transform: [{ scale: 0.985 }],
  };
}
