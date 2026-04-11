import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  formatNetworkReason,
  refreshNetworkState,
  useNetwork,
} from "@/src/state/network";
import { useTokens } from "@/src/theme/tokens";

function formatRelativeTime(timestamp: number, now: number): string {
  const deltaMs = Math.max(0, now - timestamp);
  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 10) {
    return "just now";
  }
  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const network = useNetwork();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const [now, setNow] = useState(() => Date.now());
  const [isChecking, setIsChecking] = useState(false);

  const shouldShow = useMemo(
    () =>
      network.isOffline ||
      network.reason === "no-connection" ||
      network.reason === "not-reachable",
    [network.isOffline, network.reason]
  );

  useEffect(() => {
    if (!shouldShow) {
      return;
    }

    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [shouldShow]);

  if (!shouldShow) {
    return null;
  }

  const handleRetry = async () => {
    setIsChecking(true);
    await refreshNetworkState();
    setNow(Date.now());
    setIsChecking(false);
  };

  return (
    <View pointerEvents="box-none" style={styles.root}>
      <View style={[styles.banner, { marginTop: insets.top + 8 }]}>
        <View style={styles.textBlock}>
          <Text style={styles.title}>Connection paused</Text>
          <Text style={styles.subtitle}>
            Anything you do stays on this device until your connection returns.
          </Text>
          <Text style={styles.meta}>
            Connection changed {formatRelativeTime(network.lastChangedAt, now)}.
          </Text>
          <Text style={styles.reason}>{formatNetworkReason(network.reason)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={handleRetry}
          disabled={isChecking}
          style={({ pressed }) => [
            styles.retryButton,
            pressed ? styles.retryButtonPressed : null,
            isChecking ? styles.retryButtonDisabled : null,
          ]}
        >
          <Text style={styles.retryText}>{isChecking ? "Checking…" : "Retry"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    root: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      paddingHorizontal: tokens.spacing.md,
      zIndex: 50,
    },
    banner: {
      backgroundColor: tokens.colors.warningTextOn,
      borderColor: tokens.colors.warning,
      borderWidth: 1,
      borderRadius: tokens.radius.md,
      padding: tokens.spacing.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    textBlock: {
      flex: 1,
      gap: 2,
    },
    title: {
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      color: tokens.colors.text,
    },
    subtitle: {
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      color: tokens.colors.text,
    },
    meta: {
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      color: tokens.colors.textMuted,
    },
    reason: {
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      color: tokens.colors.textMuted,
    },
    retryButton: {
      minHeight: 36,
      minWidth: 64,
      borderRadius: tokens.radius.sm,
      backgroundColor: tokens.colors.surface,
      borderWidth: 1,
      borderColor: tokens.colors.warning,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: tokens.spacing.md,
    },
    retryButtonPressed: {
      opacity: 0.85,
    },
    retryButtonDisabled: {
      opacity: 0.65,
    },
    retryText: {
      color: tokens.colors.warning,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
  });
}
