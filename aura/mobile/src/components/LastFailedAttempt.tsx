import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTokens } from "@/src/theme/tokens";

type LastFailedAttemptProps = {
  label?: string;
  value: string;
  title?: string;
  message?: string;
  onClear?: () => void;
  compact?: boolean;
};

export function LastFailedAttempt({
  label = "Last failed attempt",
  value,
  title,
  message,
  onClear,
  compact = false,
}: LastFailedAttemptProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const hasDetails = Boolean(title || message) && value !== "Never";

  return (
    <View style={compact ? styles.compactContainer : styles.container}>
      <Text style={compact ? styles.compactPrimary : styles.primary}>
        {label}: {value}
      </Text>

      {hasDetails ? (
        <View style={styles.detailRow}>
          <Text style={styles.detailText}>
            {title ?? "Request failed"}
            {message ? ` — ${message}` : ""}
          </Text>
          {onClear ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear failed attempt details"
              onPress={onClear}
              style={({ pressed }) => [
                styles.clearButton,
                pressed ? styles.clearButtonPressed : null,
              ]}
            >
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      paddingVertical: tokens.spacing.xs,
      gap: tokens.spacing.xs,
    },
    compactContainer: {
      paddingVertical: tokens.spacing.xs - 1,
      gap: tokens.spacing.xs - 1,
    },
    primary: {
      color: tokens.colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    compactPrimary: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    detailRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    detailText: {
      flex: 1,
      color: tokens.colors.danger,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    clearButton: {
      minHeight: 44,
      borderRadius: tokens.radius.sm,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      paddingHorizontal: tokens.spacing.sm,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.colors.surface,
    },
    clearButtonPressed: {
      opacity: 0.82,
    },
    clearText: {
      color: tokens.colors.danger,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
  });
}
