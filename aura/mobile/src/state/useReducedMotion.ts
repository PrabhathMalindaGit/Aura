import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

type MotionSubscription = {
  remove?: () => void;
} | null;

export function useReducedMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    let subscription: MotionSubscription = null;

    // If reduceMotion is true, avoid animated height/spring transitions; prefer instant updates.
    if (typeof AccessibilityInfo?.isReduceMotionEnabled === "function") {
      void AccessibilityInfo.isReduceMotionEnabled()
        .then((enabled) => {
          if (active) {
            setReduceMotion(Boolean(enabled));
          }
        })
        .catch(() => {
          if (active) {
            setReduceMotion(false);
          }
        });
    }

    const handler = (enabled: boolean) => {
      if (active) {
        setReduceMotion(Boolean(enabled));
      }
    };

    if (typeof AccessibilityInfo?.addEventListener === "function") {
      subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", handler);
    }

    return () => {
      active = false;
      if (subscription && typeof subscription.remove === "function") {
        subscription.remove();
      }
    };
  }, []);

  return reduceMotion;
}

