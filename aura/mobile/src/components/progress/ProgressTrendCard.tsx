import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/src/components/Card";
import { MicroSparkline, type MicroSparklineTone } from "@/src/components/MicroSparkline";
import { StatusPill, type StatusPillVariant } from "@/src/components/StatusPill";
import { useTokens } from "@/src/theme/tokens";

export type ProgressTrendCardProps = {
  title: string;
  sentence: string;
  deltaLabel: string;
  rangeLabel: string;
  statusLabel: string;
  variant?: StatusPillVariant;
  sparklineValues?: number[];
  sparklineTone?: MicroSparklineTone;
  testID?: string;
};

export function ProgressTrendCard({
  title,
  sentence,
  deltaLabel,
  rangeLabel,
  statusLabel,
  variant = "neutral",
  sparklineValues = [0, 0, 0, 0, 0],
  sparklineTone = "muted",
  testID,
}: ProgressTrendCardProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View testID={testID}>
      <Card variant="outlined" style={styles.card}>
        <View style={styles.topRow}>
          <Text style={styles.title}>{title}</Text>
          <StatusPill label={statusLabel} variant={variant} />
        </View>

        <Text style={styles.sentence}>{sentence}</Text>

        <View style={styles.metaRow}>
          <View style={styles.metaCopy}>
            <Text style={styles.metaLabel}>Change</Text>
            <Text style={styles.metaValue}>{deltaLabel}</Text>
          </View>
          <View style={styles.metaCopy}>
            <Text style={styles.metaLabel}>Window</Text>
            <Text style={styles.metaValue}>{rangeLabel}</Text>
          </View>
          <View style={styles.chartWrap}>
            <MicroSparkline
              values={sparklineValues}
              width={94}
              height={40}
              strokeWidth={2.5}
              tone={sparklineTone}
              showBaseline
            />
          </View>
        </View>
      </Card>
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    card: {
      gap: tokens.spacing.md,
      backgroundColor: tokens.colors.surface,
    },
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    title: {
      flex: 1,
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    sentence: {
      color: tokens.colors.textSecondary,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    metaRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: tokens.spacing.md,
    },
    metaCopy: {
      gap: 2,
      minWidth: 72,
    },
    metaLabel: {
      color: tokens.colors.textTertiary,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    metaValue: {
      color: tokens.colors.text,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    chartWrap: {
      marginLeft: "auto",
      justifyContent: "center",
      alignItems: "flex-end",
    },
  });
}
