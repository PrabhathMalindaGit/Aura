import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/src/components/Card";
import { MicroSparkline, type MicroSparklineTone } from "@/src/components/MicroSparkline";
import { StatusPill, type StatusPillVariant } from "@/src/components/StatusPill";
import { useTokens } from "@/src/theme/tokens";

export type ProgressSignalCardProps = {
  title: string;
  value: string;
  summary: string;
  detail?: string;
  sparklineValues?: number[];
  sparklineTone?: MicroSparklineTone;
  variant?: StatusPillVariant;
  testID?: string;
};

function resolveValueColor(
  variant: StatusPillVariant,
  tokens: ReturnType<typeof useTokens>,
): string {
  if (variant === "success") {
    return tokens.colors.success;
  }
  if (variant === "warning") {
    return tokens.colors.warning;
  }
  if (variant === "danger") {
    return tokens.colors.danger;
  }
  if (variant === "info") {
    return tokens.colors.primary;
  }
  return tokens.colors.text;
}

export function ProgressSignalCard({
  title,
  value,
  summary,
  detail,
  sparklineValues = [0, 0, 0, 0, 0],
  sparklineTone = "muted",
  variant = "neutral",
  testID,
}: ProgressSignalCardProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View testID={testID}>
      <Card variant="outlined" style={styles.card}>
        <View style={styles.topRow}>
          <Text numberOfLines={1} style={styles.label}>
            {title}
          </Text>
          <StatusPill label={summary} variant={variant} />
        </View>

        <Text style={[styles.value, { color: resolveValueColor(variant, tokens) }]}>
          {value}
        </Text>

        <View style={styles.chartWrap}>
          <MicroSparkline
            values={sparklineValues}
            width={108}
            height={36}
            strokeWidth={2.5}
            tone={sparklineTone}
            showBaseline
          />
        </View>

        <Text numberOfLines={2} style={styles.detail}>
          {detail ?? "Recent entries will fill in this signal as you check in."}
        </Text>
      </Card>
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    card: {
      minHeight: 176,
      gap: tokens.spacing.md,
      backgroundColor: tokens.colors.surface,
    },
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    label: {
      flex: 1,
      color: tokens.colors.textSecondary,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    value: {
      fontSize: 30,
      lineHeight: 34,
      fontWeight: tokens.typography.weights.semibold,
    },
    chartWrap: {
      minHeight: 36,
      justifyContent: "center",
    },
    detail: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
  });
}
