import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  formatNetworkReason,
  refreshNetworkState,
  useNetwork,
} from "@/src/state/network";

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
          <Text style={styles.title}>Offline</Text>
          <Text style={styles.subtitle}>
            Nothing will be sent until you're back online.
          </Text>
          <Text style={styles.meta}>
            Last change: {formatRelativeTime(network.lastChangedAt, now)}
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

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    zIndex: 50,
  },
  banner: {
    backgroundColor: "#fef3c7",
    borderColor: "#f59e0b",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#78350f",
  },
  subtitle: {
    fontSize: 13,
    color: "#78350f",
  },
  meta: {
    fontSize: 12,
    color: "#92400e",
  },
  reason: {
    fontSize: 11,
    color: "#b45309",
  },
  retryButton: {
    minHeight: 36,
    minWidth: 64,
    borderRadius: 8,
    backgroundColor: "#78350f",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  retryButtonPressed: {
    opacity: 0.85,
  },
  retryButtonDisabled: {
    opacity: 0.65,
  },
  retryText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
});
