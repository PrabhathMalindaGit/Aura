import { Pressable, StyleSheet, Text, View } from "react-native";

import type { TrustStatus } from "@/src/state/trustStatus";

type TrustBannerProps = {
  status: TrustStatus;
  onRetry?: () => void;
  testID?: string;
};

export function TrustBanner({ status, onRetry, testID }: TrustBannerProps) {
  if (status.kind === "ok") {
    return null;
  }

  let title = "";
  let subtitle = "";
  let toneStyle = styles.infoTone;

  switch (status.kind) {
    case "offline": {
      title = "Offline · Saving on your device";
      subtitle = "We’ll sync when you’re connected.";
      toneStyle = styles.offlineTone;
      break;
    }
    case "serverDown": {
      title = "Service unavailable · Your data is safe";
      subtitle = "We’ll retry when the service is back.";
      toneStyle = styles.serverTone;
      break;
    }
    case "syncing": {
      const count = Math.max(0, status.pendingCount);
      title = "Syncing…";
      subtitle = `${count} item${count === 1 ? "" : "s"} pending upload`;
      toneStyle = styles.syncTone;
      break;
    }
    default: {
      return null;
    }
  }

  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      accessibilityLabel={`${title}. ${subtitle}`}
      style={[styles.container, toneStyle]}
    >
      <View style={styles.copyBlock}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      {status.kind === "serverDown" && onRetry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry loading data"
          onPress={onRetry}
          style={({ pressed }) => [
            styles.retryButton,
            pressed ? styles.retryButtonPressed : null,
          ]}
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "space-between",
  },
  copyBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
  },
  subtitle: {
    fontSize: 12,
    color: "#334155",
    lineHeight: 16,
  },
  retryButton: {
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    backgroundColor: "#eff6ff",
  },
  retryButtonPressed: {
    opacity: 0.8,
  },
  retryText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#1d4ed8",
  },
  offlineTone: {
    backgroundColor: "#f8fafc",
    borderColor: "#94a3b8",
  },
  serverTone: {
    backgroundColor: "#fff7ed",
    borderColor: "#fdba74",
  },
  syncTone: {
    backgroundColor: "#ecfeff",
    borderColor: "#67e8f9",
  },
  infoTone: {
    backgroundColor: "#f8fafc",
    borderColor: "#cbd5e1",
  },
});
