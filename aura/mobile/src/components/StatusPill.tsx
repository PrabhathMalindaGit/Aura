import { useMemo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useTokens } from "@/src/theme/tokens";

export type StatusPillVariant = "neutral" | "info" | "success" | "warning" | "danger";

type StatusPillProps = {
  label: string;
  variant?: StatusPillVariant;
  style?: StyleProp<ViewStyle>;
};

export function StatusPill({ label, variant = "neutral", style }: StatusPillProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const variantStyle =
    variant === "info"
      ? styles.info
      : variant === "success"
        ? styles.success
        : variant === "warning"
          ? styles.warning
          : variant === "danger"
            ? styles.danger
            : styles.neutral;

  const textStyle =
    variant === "info"
      ? styles.infoText
      : variant === "success"
        ? styles.successText
        : variant === "warning"
          ? styles.warningText
          : variant === "danger"
            ? styles.dangerText
            : styles.neutralText;

  return (
    <View style={[styles.base, variantStyle, style]}>
      <Text style={[styles.label, textStyle]}>{label}</Text>
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    base: {
      minHeight: 24,
      borderRadius: tokens.radius.xl,
      paddingHorizontal: tokens.spacing.sm + 2,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
    },
    label: {
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    neutral: {
      backgroundColor: tokens.colors.surfaceElevated,
      borderColor: tokens.colors.border,
    },
    neutralText: {
      color: tokens.colors.text,
    },
    info: {
      backgroundColor: tokens.colors.accentTextOn,
      borderColor: tokens.colors.accent,
    },
    infoText: {
      color: tokens.scheme === "dark" ? tokens.colors.text : tokens.colors.accent,
    },
    success: {
      backgroundColor: tokens.colors.successTextOn,
      borderColor: tokens.colors.success,
    },
    successText: {
      color: tokens.scheme === "dark" ? tokens.colors.text : tokens.colors.success,
    },
    warning: {
      backgroundColor: tokens.colors.warningTextOn,
      borderColor: tokens.colors.warning,
    },
    warningText: {
      color: tokens.scheme === "dark" ? tokens.colors.text : tokens.colors.warning,
    },
    danger: {
      backgroundColor: tokens.colors.dangerTextOn,
      borderColor: tokens.colors.danger,
    },
    dangerText: {
      color: tokens.scheme === "dark" ? tokens.colors.text : tokens.colors.danger,
    },
  });
}
