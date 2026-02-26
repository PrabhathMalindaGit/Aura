import { useMemo } from "react";
import { Pressable, StyleSheet, Text, type GestureResponderEvent } from "react-native";

import { getPressFeedbackStyle } from "@/src/components/Motion";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { useTokens } from "@/src/theme/tokens";

type PrimaryButtonProps = {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
};

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  accessibilityLabel,
}: PrimaryButtonProps) {
  const tokens = useTokens();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const isDisabled = disabled || loading;
  const resolvedLabel = accessibilityLabel ?? (loading ? `${label}. Loading` : label);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={resolvedLabel}
      accessibilityState={{
        disabled: isDisabled,
        busy: loading || undefined,
      }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        isDisabled ? styles.buttonDisabled : null,
        pressed && !isDisabled ? getPressFeedbackStyle(reduceMotion, 0.88) : null,
      ]}
    >
      <Text style={styles.label}>{loading ? "…" : label}</Text>
    </Pressable>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    button: {
      minHeight: 48,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: tokens.spacing.lg,
      ...tokens.elevation.sm,
    },
    buttonDisabled: {
      opacity: 0.55,
    },
    label: {
      color: tokens.colors.primaryTextOn,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
  });
}
