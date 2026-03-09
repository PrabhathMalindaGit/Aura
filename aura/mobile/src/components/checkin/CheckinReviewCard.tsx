import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { StatusPill } from '@/src/components/StatusPill';
import { useTokens } from '@/src/theme/tokens';
import type { CheckinReviewChip } from '@/src/types/checkin';

type CheckinReviewCardProps = {
  summary: string;
  chips: CheckinReviewChip[];
  notesPreview?: string;
};

export function CheckinReviewCard({ summary, chips, notesPreview }: CheckinReviewCardProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View style={styles.stack}>
      <Text style={styles.summary}>{summary}</Text>
      <View style={styles.chipsRow}>
        {chips.map((chip) => (
          <StatusPill
            key={chip.id}
            label={chip.label}
            variant={
              chip.tone === 'danger'
                ? 'warning'
                : chip.tone === 'warning'
                  ? 'warning'
                  : chip.tone === 'success'
                    ? 'success'
                    : chip.tone === 'accent'
                      ? 'info'
                      : 'neutral'
            }
            accessible={false}
          />
        ))}
      </View>
      {notesPreview ? (
        <View style={styles.notesCard}>
          <Text style={styles.notesLabel}>Notes preview</Text>
          <Text style={styles.notesText}>{notesPreview}</Text>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    stack: {
      gap: tokens.spacing.md,
    },
    summary: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: tokens.spacing.sm,
    },
    notesCard: {
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surfaceElevated,
      padding: tokens.spacing.md,
      gap: tokens.spacing.xs,
    },
    notesLabel: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    notesText: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
  });
}
