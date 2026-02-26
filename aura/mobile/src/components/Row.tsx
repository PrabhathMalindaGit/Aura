import { useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTokens } from "@/src/theme/tokens";

type AccessoryMode = "chevron" | "none";

type RowProps = {
  title: string;
  subtitle?: string;
  leftIcon?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  accessory?: AccessoryMode;
  testID?: string;
};

export function Row({
  title,
  subtitle,
  leftIcon,
  right,
  onPress,
  disabled = false,
  accessory,
  testID,
}: RowProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const isPressable = Boolean(onPress) && !disabled;
  const resolvedAccessory: AccessoryMode =
    accessory ?? (onPress ? "chevron" : "none");
  const accessibilityLabel = subtitle ? `${title}. ${subtitle}` : title;

  const content = (
    <View style={styles.content}>
      <View style={styles.leftBlock}>
        {leftIcon ? <View style={styles.iconWrap}>{leftIcon}</View> : null}
        <View style={styles.textWrap}>
          <Text style={[styles.title, disabled ? styles.disabledText : null]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, disabled ? styles.disabledText : null]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.rightBlock}>
        {right}
        {resolvedAccessory === "chevron" ? <Text style={styles.chevron}>›</Text> : null}
      </View>
    </View>
  );

  if (!onPress) {
    return (
      <View style={[styles.base, disabled ? styles.disabled : null]} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={!isPressable}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        disabled ? styles.disabled : null,
        pressed && isPressable ? styles.pressed : null,
      ]}
    >
      {content}
    </Pressable>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    base: {
      minHeight: 56,
      borderRadius: tokens.radius.md,
      justifyContent: "center",
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      backgroundColor: tokens.colors.surface,
      borderWidth: 1,
      borderColor: tokens.colors.border,
    },
    content: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    leftBlock: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
    },
    iconWrap: {
      width: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    textWrap: {
      flex: 1,
      gap: 2,
    },
    title: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    subtitle: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    rightBlock: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
    },
    chevron: {
      color: tokens.colors.textMuted,
      fontSize: 18,
      lineHeight: 20,
      fontWeight: tokens.typography.weights.semibold,
    },
    pressed: {
      opacity: 0.82,
    },
    disabled: {
      opacity: 0.55,
    },
    disabledText: {
      color: tokens.colors.textMuted,
    },
  });
}

