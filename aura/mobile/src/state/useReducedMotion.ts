import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

type MotionSubscription = {
  remove?: () => void;
} | null;

export function useReducedMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    let subscription: MotionSubscription = null;

    const setSafely = (enabled: boolean) => {
      if (mounted) {
        setReduceMotion(Boolean(enabled));
      }
    };

    if (!AccessibilityInfo) {
      return () => {
        mounted = false;
      };
    }

    const readInitialPreference = async () => {
      try {
        if (typeof AccessibilityInfo.isReduceMotionEnabled === "function") {
          const enabled = await AccessibilityInfo.isReduceMotionEnabled();
          setSafely(Boolean(enabled));
        }
      } catch {
        setSafely(false);
      }
    };

    void readInitialPreference();

    if (typeof AccessibilityInfo.addEventListener === "function") {
      try {
        subscription = AccessibilityInfo.addEventListener(
          "reduceMotionChanged",
          setSafely
        );
      } catch {
        subscription = null;
      }
    }

    return () => {
      mounted = false;
      if (subscription && typeof subscription.remove === "function") {
        subscription.remove();
      }
    };
  }, []);

  return reduceMotion;
}
