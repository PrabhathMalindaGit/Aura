import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SegmentedControl } from '@/src/components/SegmentedControl';
import { Switch } from 'react-native';
import { useTokens } from '@/src/theme/tokens';
import type { CheckinHelpLevel, CheckinSafetyState } from '@/src/types/checkin';
import { HELP_LEVEL_LABELS, SAFETY_STATE_LABELS } from '@/src/utils/checkin';

type NeedHelpPromptProps = {
  helpLevel: CheckinHelpLevel | null;
  safetyState: CheckinSafetyState | null;
  wantsExtraSupport: boolean;
  onHelpLevelChange: (value: CheckinHelpLevel) => void;
  onSafetyStateChange: (value: CheckinSafetyState) => void;
  onToggleExtraSupport: (value: boolean) => void;
};

export function NeedHelpPrompt({
  helpLevel,
  safetyState,
  wantsExtraSupport,
  onHelpLevelChange,
  onSafetyStateChange,
  onToggleExtraSupport,
}: NeedHelpPromptProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View style={styles.stack}>
      <View style={styles.copy}>
        <Text style={styles.title}>Need help today?</Text>
        <Text style={styles.description}>
          Tell us if you want a follow-up or need urgent help. This supports the same safety routing already in place.
        </Text>
      </View>

      <SegmentedControl
        value={helpLevel ?? 'none'}
        onChange={onHelpLevelChange}
        options={[
          { value: 'none', label: HELP_LEVEL_LABELS.none },
          { value: 'follow_up', label: HELP_LEVEL_LABELS.follow_up },
          { value: 'urgent', label: HELP_LEVEL_LABELS.urgent },
        ]}
        allowWrap
        tone="accent"
        accessibilityLabel="Support request"
      />

      <View style={styles.copy}>
        <Text style={styles.title}>Do you feel safe right now?</Text>
        <Text style={styles.description}>
          If you feel unsafe, choose that here and submit your check-in so we can route help appropriately.
        </Text>
      </View>

      <SegmentedControl
        value={safetyState ?? 'safe'}
        onChange={onSafetyStateChange}
        options={[
          { value: 'safe', label: SAFETY_STATE_LABELS.safe },
          { value: 'unsure', label: SAFETY_STATE_LABELS.unsure },
          { value: 'unsafe', label: SAFETY_STATE_LABELS.unsafe },
        ]}
        allowWrap
        tone="primary"
        accessibilityLabel="Current safety state"
      />

      <View style={styles.switchRow}>
        <View style={styles.switchCopy}>
          <Text style={styles.switchTitle}>Extra support today</Text>
          <Text style={styles.switchDescription}>
            Use this if you would like a little more encouragement or practical support without needing urgent help.
          </Text>
        </View>
        <Switch value={wantsExtraSupport} onValueChange={onToggleExtraSupport} />
      </View>
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    stack: {
      gap: tokens.spacing.lg,
    },
    copy: {
      gap: 4,
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
    switchRow: {
      minHeight: 64,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.lg,
      paddingHorizontal: tokens.spacing.lg,
      paddingVertical: tokens.spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: tokens.spacing.sm,
      backgroundColor: tokens.colors.surfaceElevated,
    },
    switchCopy: {
      flex: 1,
      gap: 2,
      marginRight: tokens.spacing.sm,
    },
    switchTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    switchDescription: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
  });
}
