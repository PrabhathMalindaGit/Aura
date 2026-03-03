import { useMemo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { StatusPill, type StatusPillVariant } from "@/src/components/StatusPill";
import type { TrustStatus } from "@/src/state/trustStatus";
import { useTokens } from "@/src/theme/tokens";

export type TrustCuePill = {
  label: string;
  variant?: StatusPillVariant;
};

type TrustCuesProps = {
  status: TrustStatus;
  lastUpdatedLabel?: string | null;
  showLastUpdated?: boolean;
  showPending?: boolean;
  showSavedLocalHint?: boolean;
  variant?: "compact" | "default";
  extraPills?: TrustCuePill[];
  maxPills?: number;
  style?: StyleProp<ViewStyle>;
};

export function getTrustCueA11yLabel(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "Status";
  }

  const lower = trimmed.toLowerCase();
  if (lower === "offline") {
    return "Status: Offline";
  }
  if (lower === "service down") {
    return "Status: Service unavailable";
  }
  if (lower === "syncing") {
    return "Status: Syncing";
  }
  if (lower === "saved locally") {
    return "Status: Saved locally";
  }
  if (lower === "synced") {
    return "Status: Synced";
  }
  if (lower === "not updated") {
    return "Last updated: Not available";
  }
  if (lower.startsWith("updated ")) {
    return `Last updated: ${trimmed.slice("Updated ".length)}`;
  }

  const pendingMatch = /^pending\s+(\d+)$/i.exec(trimmed);
  if (pendingMatch) {
    const count = Number(pendingMatch[1] ?? "0");
    return `Status: ${count} item${count === 1 ? "" : "s"} pending upload`;
  }

  return `Status: ${trimmed}`;
}

function toUpdatedLabel(label: string): string {
  if (!label || label === "Never") {
    return "Not updated";
  }
  return `Updated ${label}`;
}

function trustPill(status: TrustStatus, showPending: boolean): TrustCuePill {
  if (status.kind === "offline") {
    return { label: "Offline", variant: "warning" };
  }

  if (status.kind === "serverDown") {
    return { label: "Service down", variant: "warning" };
  }

  if (status.kind === "syncing") {
    if (!showPending) {
      return { label: "Syncing", variant: "info" };
    }
    return {
      label: `Pending ${Math.max(0, status.pendingCount)}`,
      variant: "info",
    };
  }

  return { label: "Synced", variant: "success" };
}

export function TrustCues({
  status,
  lastUpdatedLabel,
  showLastUpdated = true,
  showPending = true,
  showSavedLocalHint = true,
  variant = "compact",
  extraPills = [],
  maxPills = 2,
  style,
}: TrustCuesProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const pills = useMemo(() => {
    const next: TrustCuePill[] = [...extraPills];
    next.push(trustPill(status, showPending));

    if (showLastUpdated && lastUpdatedLabel) {
      next.push({ label: toUpdatedLabel(lastUpdatedLabel), variant: "neutral" });
    }

    if (showSavedLocalHint && status.kind === "offline") {
      next.push({ label: "Saved locally", variant: "neutral" });
    }

    const seen = new Set<string>();
    const deduped: TrustCuePill[] = [];

    for (const item of next) {
      const key = `${item.label.toLowerCase()}::${item.variant ?? "neutral"}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduped.push(item);
    }

    return deduped.slice(0, Math.max(1, maxPills));
  }, [extraPills, lastUpdatedLabel, maxPills, showLastUpdated, showPending, showSavedLocalHint, status]);

  const caption = useMemo(() => {
    if (variant === "compact") {
      return null;
    }

    if (status.kind === "offline") {
      return "Using saved data until connection returns.";
    }

    if (status.kind === "serverDown") {
      return "Live service is unavailable right now.";
    }

    if (status.kind === "syncing") {
      return "Updates are syncing in the background.";
    }

    return null;
  }, [status.kind, variant]);

  if (pills.length === 0 && !caption) {
    return null;
  }

  return (
    <View style={[styles.wrap, style]}>
      {pills.length > 0 ? (
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={pills.map((item) => getTrustCueA11yLabel(item.label)).join(". ")}
          style={styles.row}
        >
          {pills.map((item) => (
            <StatusPill
              key={`${item.label}-${item.variant ?? "neutral"}`}
              label={item.label}
              variant={item.variant ?? "neutral"}
              accessible={false}
            />
          ))}
        </View>
      ) : null}
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    wrap: {
      gap: tokens.spacing.xs,
    },
    row: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    caption: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
  });
}
