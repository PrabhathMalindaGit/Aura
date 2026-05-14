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
  size?: "default" | "compact";
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
};

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  size = "default",
  accessibilityLabel,
  accessibilityHint,
  testID,
}: PrimaryButtonProps) {
  const tokens = useTokens();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const isDisabled = disabled || loading;
  const resolvedLabel = accessibilityLabel ?? (loading ? `${label}. Loading` : label);

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={resolvedLabel}
      accessibilityHint={loading ? "Loading" : accessibilityHint}
      accessibilityState={{
        disabled: isDisabled,
        busy: loading || undefined,
      }}
      disabled={isDisabled}
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      style={({ pressed }) => [
        styles.button,
        size === "compact" ? styles.buttonCompact : null,
        isDisabled ? styles.buttonDisabled : null,
        pressed && !isDisabled ? getPressFeedbackStyle(reduceMotion, 0.88) : null,
      ]}
    >
      <Text style={[styles.label, size === "compact" ? styles.labelCompact : null]}>
        {loading ? "…" : label}
      </Text>
    </Pressable>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    button: {
      minHeight: 52,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      borderWidth: 1,
      borderColor: tokens.colors.primary,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: tokens.spacing.lg,
      ...tokens.elevation.sm,
    },
    buttonCompact: {
      minHeight: 44,
      paddingHorizontal: tokens.spacing.lg,
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
    labelCompact: {
      fontSize: 15,
      lineHeight: 20,
    },
  });
}
