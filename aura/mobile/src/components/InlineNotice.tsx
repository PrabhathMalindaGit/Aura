import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTokens } from "@/src/theme/tokens";

type InlineNoticeProps = {
  variant: "info" | "warning" | "error";
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

const VARIANT_STYLES = {
  info: {
    backgroundColor: "#eff6ff",
    borderColor: "#93c5fd",
    titleColor: "#1d4ed8",
    messageColor: "#1e3a8a",
  },
  warning: {
    backgroundColor: "#fffbeb",
    borderColor: "#fcd34d",
    titleColor: "#92400e",
    messageColor: "#78350f",
  },
  error: {
    backgroundColor: "#fef2f2",
    borderColor: "#fca5a5",
    titleColor: "#b91c1c",
    messageColor: "#7f1d1d",
  },
} as const;

export function InlineNotice({
  variant,
  title,
  message,
  actionLabel,
  onAction,
}: InlineNoticeProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const variantStyle = resolveVariantStyle(variant, tokens);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: variantStyle.backgroundColor,
          borderColor: variantStyle.borderColor,
        },
      ]}
    >
      <Text style={[styles.title, { color: variantStyle.titleColor }]}>{title}</Text>
      <Text style={[styles.message, { color: variantStyle.messageColor }]}>
        {message}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [
            styles.actionButton,
            pressed ? styles.actionButtonPressed : null,
          ]}
        >
          <Text style={[styles.actionText, { color: variantStyle.titleColor }]}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function resolveVariantStyle(
  variant: InlineNoticeProps["variant"],
  tokens: ReturnType<typeof useTokens>,
) {
  const fallback = VARIANT_STYLES[variant];

  if (variant === "info") {
    return {
      backgroundColor: tokens.colors.accentTextOn,
      borderColor: tokens.colors.accent,
      titleColor: tokens.scheme === "dark" ? tokens.colors.text : tokens.colors.accent,
      messageColor: tokens.colors.text,
    };
  }

  if (variant === "warning") {
    return {
      backgroundColor: tokens.colors.warningTextOn,
      borderColor: tokens.colors.warning,
      titleColor: tokens.scheme === "dark" ? tokens.colors.text : tokens.colors.warning,
      messageColor: tokens.colors.text,
    };
  }

  if (variant === "error") {
    return {
      backgroundColor: tokens.colors.dangerTextOn,
      borderColor: tokens.colors.danger,
      titleColor: tokens.scheme === "dark" ? tokens.colors.text : tokens.colors.danger,
      messageColor: tokens.colors.text,
    };
  }

  return fallback;
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      borderWidth: 1,
      borderRadius: tokens.radius.md,
      padding: tokens.spacing.md,
      gap: tokens.spacing.xs + 2,
    },
    title: {
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    message: {
      fontSize: 13,
      lineHeight: 18,
    },
    actionButton: {
      alignSelf: "flex-start",
      paddingVertical: 4,
    },
    actionButtonPressed: {
      opacity: 0.75,
    },
    actionText: {
      fontSize: 13,
      fontWeight: tokens.typography.weights.semibold,
    },
  });
}
