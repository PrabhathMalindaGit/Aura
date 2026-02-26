import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTokens } from "@/src/theme/tokens";

export type BannerVariant = "info" | "success" | "warning" | "danger";

type BannerProps = {
  title: string;
  message?: string;
  variant?: BannerVariant;
  actionLabel?: string;
  onAction?: () => void;
};

export function Banner({
  title,
  message,
  variant = "info",
  actionLabel,
  onAction,
}: BannerProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const toneStyle =
    variant === "success"
      ? styles.successTone
      : variant === "warning"
        ? styles.warningTone
        : variant === "danger"
          ? styles.dangerTone
          : styles.infoTone;

  return (
    <View style={[styles.container, toneStyle]}>
      <View style={styles.copyBlock}>
        <Text style={styles.title}>{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={({ pressed }) => [
            styles.actionButton,
            pressed ? styles.actionButtonPressed : null,
          ]}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
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
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    copyBlock: {
      flex: 1,
      gap: 2,
    },
    title: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    message: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    actionButton: {
      minHeight: 36,
      borderRadius: tokens.radius.sm,
      paddingHorizontal: tokens.spacing.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.colors.surface,
    },
    actionButtonPressed: {
      opacity: 0.82,
    },
    actionText: {
      color: tokens.colors.accent,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    infoTone: {
      backgroundColor: tokens.colors.surfaceElevated,
      borderColor: tokens.colors.border,
    },
    successTone: {
      backgroundColor: tokens.colors.successTextOn,
      borderColor: tokens.colors.success,
    },
    warningTone: {
      backgroundColor: tokens.colors.warningTextOn,
      borderColor: tokens.colors.warning,
    },
    dangerTone: {
      backgroundColor: tokens.colors.dangerTextOn,
      borderColor: tokens.colors.danger,
    },
  });
}

