import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FadeSlideIn } from "@/src/components/Motion";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import type { TrustStatus } from "@/src/state/trustStatus";
import { useTokens } from "@/src/theme/tokens";

type TrustBannerProps = {
  status: TrustStatus;
  onRetry?: () => void;
  testID?: string;
};

export function TrustBanner({ status, onRetry, testID }: TrustBannerProps) {
  const tokens = useTokens();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

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
    <FadeSlideIn visible reduceMotion={reduceMotion}>
      <View
        testID={testID}
        accessible
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
    </FadeSlideIn>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      borderWidth: 1,
      borderRadius: tokens.radius.md,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.md - 2,
      flexDirection: "row",
      gap: tokens.spacing.sm + 2,
      alignItems: "center",
      justifyContent: "space-between",
    },
    copyBlock: {
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
      color: tokens.colors.textMuted,
    },
    retryButton: {
      minHeight: 44,
      borderRadius: tokens.radius.sm,
      borderWidth: 1,
      borderColor: tokens.colors.accent,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: tokens.spacing.md,
      backgroundColor: tokens.colors.surface,
    },
    retryButtonPressed: {
      opacity: 0.82,
    },
    retryText: {
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      color: tokens.colors.accent,
    },
    offlineTone: {
      backgroundColor: tokens.colors.surfaceElevated,
      borderColor: tokens.colors.border,
    },
    serverTone: {
      backgroundColor: tokens.colors.warningTextOn,
      borderColor: tokens.colors.warning,
    },
    syncTone: {
      backgroundColor: tokens.colors.surfaceElevated,
      borderColor: tokens.colors.accent,
    },
    infoTone: {
      backgroundColor: tokens.colors.surfaceElevated,
      borderColor: tokens.colors.border,
    },
  });
}
