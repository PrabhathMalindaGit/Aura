import { useMemo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTokens } from "@/src/theme/tokens";

type CheckinFieldBlockProps = {
  title: string;
  description?: string;
  errorText?: string | null;
  accessory?: ReactNode;
  children: ReactNode;
};

export function CheckinFieldBlock({
  title,
  description,
  errorText,
  accessory,
  children,
}: CheckinFieldBlockProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View style={styles.block}>
      <View style={styles.header}>
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          {description ? <Text style={styles.description}>{description}</Text> : null}
        </View>
        {accessory ? <View style={styles.accessory}>{accessory}</View> : null}
      </View>
      {children}
      {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    block: {
      gap: tokens.spacing.md,
    },
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    copy: {
      flex: 1,
      gap: tokens.spacing.xs,
    },
    accessory: {
      flexShrink: 0,
    },
    title: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    description: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    errorText: {
      color: tokens.colors.danger,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
  });
}
