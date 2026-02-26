import { useMemo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useTokens } from "@/src/theme/tokens";

type SectionTitleProps = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
};

export function SectionTitle({ title, subtitle, right }: SectionTitleProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View style={styles.wrap}>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    wrap: {
      minHeight: 28,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    titleBlock: {
      flex: 1,
      gap: 2,
    },
    title: {
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.section.fontWeight,
      color: tokens.colors.text,
    },
    subtitle: {
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      color: tokens.colors.textMuted,
    },
    right: {
      flexShrink: 0,
    },
  });
}

