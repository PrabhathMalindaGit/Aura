import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useReducedMotion(): boolean {
  const [isReducedMotionEnabled, setIsReducedMotionEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;

    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) {
          setIsReducedMotionEnabled(Boolean(enabled));
        }
      })
      .catch(() => {
        if (mounted) {
          setIsReducedMotionEnabled(false);
        }
      });

    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => {
        setIsReducedMotionEnabled(Boolean(enabled));
      }
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return isReducedMotionEnabled;
}
