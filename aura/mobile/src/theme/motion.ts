import { Easing, LayoutAnimation, Platform, UIManager } from "react-native";

export const motionDurations = {
  short: 120,
  medium: 180,
  long: 240,
} as const;

export const motionEasing = Easing.out(Easing.cubic);

let layoutAnimationPrepared = false;

function prepareLayoutAnimationForAndroid(): void {
  if (layoutAnimationPrepared || Platform.OS !== "android") {
    return;
  }

  if (typeof UIManager.setLayoutAnimationEnabledExperimental === "function") {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }

  layoutAnimationPrepared = true;
}

export function getDuration(
  reduceMotion: boolean,
  duration: number
): number {
  return reduceMotion ? 0 : duration;
}

export function runLayoutAnimationIfAllowed(
  reduceMotion: boolean,
  duration = motionDurations.medium
): void {
  if (reduceMotion || Platform.OS === "web") {
    return;
  }

  prepareLayoutAnimationForAndroid();

  LayoutAnimation.configureNext({
    duration,
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
    update: {
      type: LayoutAnimation.Types.easeInEaseOut,
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
  });
}
