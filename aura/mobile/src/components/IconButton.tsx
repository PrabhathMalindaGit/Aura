import { useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTokens } from "@/src/theme/tokens";

type IconButtonProps = {
  icon?: ReactNode;
  label?: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
  testID?: string;
};

export function IconButton({
  icon,
  label = "•",
  onPress,
  disabled = false,
  accessibilityLabel,
  testID,
}: IconButtonProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.button,
        disabled ? styles.disabled : null,
        pressed && !disabled ? styles.pressed : null,
      ]}
    >
      {icon ? (
        <View style={styles.iconWrap}>{icon}</View>
      ) : (
        <Text style={styles.fallbackIcon}>{label}</Text>
      )}
    </Pressable>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    button: {
      minWidth: 44,
      minHeight: 44,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    iconWrap: {
      alignItems: "center",
      justifyContent: "center",
    },
    fallbackIcon: {
      color: tokens.colors.text,
      fontSize: 18,
      lineHeight: 20,
      fontWeight: tokens.typography.weights.semibold,
    },
    pressed: {
      opacity: 0.82,
    },
    disabled: {
      opacity: 0.5,
    },
  });
}

