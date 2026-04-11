import React, { Children, Fragment, useMemo, type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { Card } from "@/src/components/Card";
import { useTokens } from "@/src/theme/tokens";

export type SettingsGroupTone = "default" | "subtle" | "danger";

type SettingsGroupProps = {
  children: ReactNode;
  tone?: SettingsGroupTone;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function SettingsGroup({
  children,
  tone = "default",
  style,
  testID,
}: SettingsGroupProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const items = Children.toArray(children).filter(Boolean);

  const toneStyle =
    tone === "danger"
      ? styles.dangerCard
      : tone === "subtle"
        ? styles.subtleCard
        : styles.defaultCard;

  return (
    <View testID={testID}>
      <Card variant="outlined" style={[styles.card, toneStyle, style]}>
        {items.map((child, index) => (
          <Fragment key={index}>
            {index > 0 ? <View style={styles.divider} /> : null}
            {child}
          </Fragment>
        ))}
      </Card>
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    card: {
      overflow: "hidden",
      padding: 0,
      backgroundColor: tokens.colors.surface,
      borderColor: tokens.colors.border,
    },
    defaultCard: {
      backgroundColor: tokens.colors.surface,
    },
    subtleCard: {
      backgroundColor: tokens.colors.surfaceSubtle,
    },
    dangerCard: {
      backgroundColor: tokens.colors.dangerTextOn,
      borderColor: tokens.colors.danger,
    },
    divider: {
      height: 1,
      backgroundColor: tokens.colors.border,
      marginLeft: tokens.spacing.lg,
    },
  });
}
