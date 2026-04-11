import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/src/components/Card";
import { CheckinReviewCard } from "@/src/components/checkin/CheckinReviewCard";
import { DomainIcon } from "@/src/components/IconSet";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { StatusPill } from "@/src/components/StatusPill";
import { useTokens } from "@/src/theme/tokens";
import type { CheckinReviewChip } from "@/src/types/checkin";
import { formatISOToHuman, formatPatientCardTimestamp } from "@/src/utils/date";

type CheckinConfirmationPanelProps = {
  submittedAtISO: string;
  summary: string;
  chips: CheckinReviewChip[];
  notesPreview?: string;
  onBackToToday: () => void;
  onViewProgress?: () => void;
  testID?: string;
};

export function CheckinConfirmationPanel({
  submittedAtISO,
  summary,
  chips,
  notesPreview,
  onBackToToday,
  onViewProgress,
  testID,
}: CheckinConfirmationPanelProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const submittedLabel = formatPatientCardTimestamp(submittedAtISO) ?? "Saved just now";
  const exactDateLabel = formatISOToHuman(submittedAtISO);

  return (
    <View testID={testID}>
      <Card padding={tokens.spacing.xl} style={styles.card}>
        <View style={styles.stack}>
          <View style={styles.headerRow}>
            <View style={styles.iconWrap}>
              <DomainIcon
                icon="success"
                tone="success"
                size={22}
                accessibilityLabel="Check-in saved"
              />
            </View>
            <View style={styles.copy}>
              <Text style={styles.eyebrow}>Today’s check-in</Text>
              <Text accessibilityRole="header" style={styles.title}>
                Check-in submitted
              </Text>
              <Text style={styles.description}>
                Your update was recorded and added to today’s recovery timeline.
              </Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            <StatusPill label={submittedLabel} variant="success" accessible={false} />
            <StatusPill label={exactDateLabel} variant="neutral" accessible={false} />
          </View>

          <Card variant="outlined" style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>What was recorded</Text>
            <CheckinReviewCard summary={summary} chips={chips} notesPreview={notesPreview} />
          </Card>

          <View style={styles.actions}>
            <PrimaryButton label="Back to Today" onPress={onBackToToday} />
            {onViewProgress ? (
              <SecondaryButton label="View Progress" onPress={onViewProgress} />
            ) : null}
          </View>
        </View>
      </Card>
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    card: {
      backgroundColor: tokens.colors.surface,
      borderColor: tokens.colors.border,
    },
    stack: {
      gap: tokens.spacing.lg,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: tokens.spacing.md,
    },
    iconWrap: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: tokens.colors.success,
      backgroundColor: tokens.colors.successTextOn,
    },
    copy: {
      flex: 1,
      gap: tokens.spacing.xs,
    },
    eyebrow: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    title: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    description: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    metaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    summaryCard: {
      gap: tokens.spacing.md,
      backgroundColor: tokens.colors.surfaceSubtle,
    },
    summaryLabel: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    actions: {
      gap: tokens.spacing.sm,
    },
  });
}
