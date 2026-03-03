import { useMemo } from "react";
import { Pressable, StyleSheet, Text, type GestureResponderEvent } from "react-native";

import { getPressFeedbackStyle } from "@/src/components/Motion";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { useTokens } from "@/src/theme/tokens";

type SecondaryButtonProps = {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
  testID?: string;
};

export function SecondaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  accessibilityLabel,
  testID,
}: SecondaryButtonProps) {
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
      accessibilityHint={loading ? "Loading" : undefined}
      accessibilityState={{
        disabled: isDisabled,
        busy: loading || undefined,
      }}
      disabled={isDisabled}
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      style={({ pressed }) => [
        styles.button,
        isDisabled ? styles.buttonDisabled : null,
        pressed && !isDisabled ? getPressFeedbackStyle(reduceMotion, 0.86) : null,
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
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surfaceElevated,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: tokens.spacing.lg,
    },
    buttonDisabled: {
      opacity: 0.55,
    },
    label: {
      color: tokens.colors.accent,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
  });
}
