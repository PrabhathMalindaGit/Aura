import React, { useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { StatusPill, type StatusPillVariant } from "@/src/components/StatusPill";
import { getPressFeedbackStyle } from "@/src/components/Motion";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { useTokens } from "@/src/theme/tokens";

type AccessoryMode = "chevron" | "none";
type SettingsItemTone = "default" | "danger";

type SettingsItemProps = {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  onPress?: () => void;
  right?: ReactNode;
  statusLabel?: string;
  statusVariant?: StatusPillVariant;
  accessory?: AccessoryMode;
  tone?: SettingsItemTone;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
};

export function SettingsItem({
  title,
  subtitle,
  leading,
  onPress,
  right,
  statusLabel,
  statusVariant = "neutral",
  accessory,
  tone = "default",
  disabled = false,
  testID,
  accessibilityLabel,
}: SettingsItemProps) {
  const tokens = useTokens();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const isPressable = Boolean(onPress) && !disabled;
  const resolvedAccessory = accessory ?? (onPress ? "chevron" : "none");
  const resolvedLabel = accessibilityLabel ?? (subtitle ? `${title}. ${subtitle}` : title);
  const titleTone = tone === "danger" ? tokens.colors.danger : tokens.colors.text;

  const meta = (
    <View style={styles.metaRow}>
      {statusLabel ? (
        <StatusPill label={statusLabel} variant={statusVariant} />
      ) : null}
      {right}
      {resolvedAccessory === "chevron" ? (
        <Text style={[styles.chevron, tone === "danger" ? styles.chevronDanger : null]}>›</Text>
      ) : null}
    </View>
  );

  const content = (
    <View style={styles.row}>
      <View style={styles.leadingBlock}>
        {leading ? (
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={styles.leadingWrap}
          >
            {leading}
          </View>
        ) : null}
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: titleTone }, disabled ? styles.disabledText : null]}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, disabled ? styles.disabledText : null]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {meta}
    </View>
  );

  if (!onPress) {
    return (
      <View
        testID={testID}
        accessible
        accessibilityLabel={resolvedLabel}
        style={[styles.base, disabled ? styles.disabled : null]}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={resolvedLabel}
      accessibilityState={{ disabled }}
      disabled={!isPressable}
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      style={({ pressed }) => [
        styles.base,
        disabled ? styles.disabled : null,
        pressed && isPressable ? getPressFeedbackStyle(reduceMotion, 0.9) : null,
      ]}
    >
      {content}
    </Pressable>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    base: {
      minHeight: 68,
      justifyContent: "center",
      paddingHorizontal: tokens.spacing.lg,
      paddingVertical: tokens.spacing.md,
      backgroundColor: "transparent",
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.md,
    },
    leadingBlock: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.md,
      minWidth: 0,
    },
    leadingWrap: {
      width: 28,
      alignItems: "center",
      justifyContent: "center",
    },
    textWrap: {
      flex: 1,
      gap: 3,
      minWidth: 0,
    },
    title: {
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    subtitle: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
      flexShrink: 0,
    },
    chevron: {
      color: tokens.colors.textTertiary,
      fontSize: 19,
      lineHeight: 20,
      fontWeight: tokens.typography.weights.semibold,
    },
    chevronDanger: {
      color: tokens.colors.danger,
    },
    disabled: {
      opacity: 0.55,
    },
    disabledText: {
      color: tokens.colors.textMuted,
    },
  });
}
