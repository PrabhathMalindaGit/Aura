import { useMemo, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { useTokens } from "@/src/theme/tokens";

export type CardVariant = "default" | "elevated" | "outlined";

type CardProps = {
  children: ReactNode;
  variant?: CardVariant;
  padding?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function Card({
  children,
  variant = "default",
  padding,
  style,
  accessibilityLabel,
}: CardProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const variantStyle =
    variant === "outlined"
      ? styles.outlined
      : variant === "elevated"
        ? styles.elevated
        : styles.defaultCard;

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[styles.base, variantStyle, { padding: padding ?? tokens.spacing.lg }, style]}
    >
      {children}
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    base: {
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surface,
      borderWidth: 1,
      borderColor: tokens.colors.border,
    },
    defaultCard: {},
    elevated: {
      borderColor: "transparent",
      ...tokens.elevation.card,
    },
    outlined: {
      backgroundColor: tokens.colors.surface,
      borderColor: tokens.colors.border,
    },
  });
}

