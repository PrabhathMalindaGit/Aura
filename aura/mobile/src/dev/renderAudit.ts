import { useEffect, useRef } from "react";
import { Platform } from "react-native";

const activeMounts = new Map<string, number>();
const DEBUG_UI_FLAG = "__AURA_ENABLE_PATIENT_DEBUG_UI__";

type DebugGlobal = typeof globalThis & {
  [DEBUG_UI_FLAG]?: boolean;
};

export function isPatientDebugUIEnabled(): boolean {
  return __DEV__ && Boolean((globalThis as DebugGlobal)[DEBUG_UI_FLAG]);
}

export function useDevRenderAudit(label?: string) {
  const instanceIdRef = useRef(
    Math.random()
      .toString(36)
      .slice(2, 8),
  );

  useEffect(() => {
    if (!isPatientDebugUIEnabled() || Platform.OS !== "web" || !label) {
      return;
    }

    const nextCount = (activeMounts.get(label) ?? 0) + 1;
    activeMounts.set(label, nextCount);

    console.info(
      `[render-audit] mount ${label}#${instanceIdRef.current} active=${nextCount}`,
    );

    if (nextCount > 1) {
      console.warn(
        `[render-audit] multiple active mounts detected for ${label} on web (${nextCount})`,
      );
    }

    return () => {
      const currentCount = activeMounts.get(label) ?? 1;
      const remaining = Math.max(0, currentCount - 1);

      if (remaining === 0) {
        activeMounts.delete(label);
      } else {
        activeMounts.set(label, remaining);
      }

      console.info(
        `[render-audit] unmount ${label}#${instanceIdRef.current} active=${remaining}`,
      );
    };
  }, [label]);
}
