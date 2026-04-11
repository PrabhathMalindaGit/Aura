import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/src/components/Card";
import { DomainIcon } from "@/src/components/IconSet";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { StatusPill } from "@/src/components/StatusPill";
import { useTokens } from "@/src/theme/tokens";

type CheckinSubmissionRecoveryCardProps = {
  title: string;
  message: string;
  detail: string;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  statusLabel?: string;
  testID?: string;
};

export function CheckinSubmissionRecoveryCard({
  title,
  message,
  detail,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
  statusLabel,
  testID,
}: CheckinSubmissionRecoveryCardProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <View testID={testID}>
      <Card variant="outlined" padding={tokens.spacing.xl} style={styles.card}>
        <View style={styles.stack}>
          <View style={styles.headerRow}>
            <View style={styles.iconWrap}>
              <DomainIcon
                icon="warning"
                tone="warning"
                size={20}
                accessibilityLabel="Submission issue"
              />
            </View>
            <View style={styles.copy}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.message}>{message}</Text>
            </View>
            {statusLabel ? (
              <StatusPill label={statusLabel} variant="warning" accessible={false} />
            ) : null}
          </View>

          <Text style={styles.detail}>{detail}</Text>

          {(primaryActionLabel && onPrimaryAction) || (secondaryActionLabel && onSecondaryAction) ? (
            <View style={styles.actions}>
              {primaryActionLabel && onPrimaryAction ? (
                <PrimaryButton label={primaryActionLabel} onPress={onPrimaryAction} />
              ) : null}
              {secondaryActionLabel && onSecondaryAction ? (
                <SecondaryButton label={secondaryActionLabel} onPress={onSecondaryAction} />
              ) : null}
            </View>
          ) : null}
        </View>
      </Card>
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    card: {
      backgroundColor: tokens.colors.warningTextOn,
      borderColor: tokens.colors.warning,
    },
    stack: {
      gap: tokens.spacing.md,
    },
    headerRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: tokens.spacing.md,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: tokens.colors.warning,
      backgroundColor: tokens.colors.surface,
    },
    copy: {
      flex: 1,
      gap: 2,
    },
    title: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    message: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    detail: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    actions: {
      gap: tokens.spacing.sm,
    },
  });
}
