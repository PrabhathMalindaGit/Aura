import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/src/components/Card";
import { DomainIcon } from "@/src/components/IconSet";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { StatusPill } from "@/src/components/StatusPill";
import { useTokens } from "@/src/theme/tokens";
import type { TipCardTone } from "@/src/components/TipCard";

type WorkflowMessageCardProps = {
  title: string;
  text: string;
  chips?: string[];
  tone?: TipCardTone;
  actionLabel: string;
  onAction: () => void;
  compact?: boolean;
  testID?: string;
};

function resolveToneStyles(
  tokens: ReturnType<typeof useTokens>,
  tone: TipCardTone,
): {
  backgroundColor: string;
  borderColor: string;
  iconTone: "primary" | "warning" | "success" | "muted";
  statusLabel: string;
  statusVariant: "info" | "warning" | "success" | "neutral";
} {
  if (tone === "warning") {
    return {
      backgroundColor: tokens.colors.warningSoft,
      borderColor: tokens.colors.warning,
      iconTone: "warning",
      statusLabel: "Needs attention",
      statusVariant: "warning",
    };
  }

  if (tone === "success" || tone === "safety") {
    return {
      backgroundColor: tokens.colors.successSoft,
      borderColor: tokens.colors.success,
      iconTone: "success",
      statusLabel: "Support update",
      statusVariant: "success",
    };
  }

  return {
    backgroundColor: tokens.colors.primarySoft,
    borderColor: tokens.colors.primary,
    iconTone: "primary",
    statusLabel: "Care update",
    statusVariant: "info",
  };
}

export function WorkflowMessageCard({
  title,
  text,
  chips = [],
  tone = "info",
  actionLabel,
  onAction,
  compact = false,
  testID,
}: WorkflowMessageCardProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const toneStyles = resolveToneStyles(tokens, tone);
  const visibleChips = chips.slice(0, 3);

  return (
    <View testID={testID}>
      <Card
        padding={compact ? tokens.spacing.md : tokens.spacing.lg}
        style={[
          styles.card,
          {
            backgroundColor: toneStyles.backgroundColor,
            borderColor: toneStyles.borderColor,
          },
        ]}
      >
        <View style={styles.stack}>
          <View style={styles.headerRow}>
            <View style={styles.titleRow}>
              <View style={styles.iconWrap}>
                <DomainIcon
                  icon="chat"
                  tone={toneStyles.iconTone}
                  size={18}
                  accessibilityLabel="Care update icon"
                />
              </View>
              <Text style={styles.title}>{title}</Text>
            </View>
            <StatusPill
              label={toneStyles.statusLabel}
              variant={toneStyles.statusVariant}
              accessible={false}
            />
          </View>

          <Text style={styles.text}>{text}</Text>

          {visibleChips.length > 0 ? (
            <View style={styles.chipsRow}>
              {visibleChips.map((chip) => (
                <View key={chip} style={styles.chip}>
                  <Text style={styles.chipText}>{chip}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <SecondaryButton label={actionLabel} onPress={onAction} accessibilityLabel={actionLabel} />
        </View>
      </Card>
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    card: {
      borderRadius: tokens.radius.lg,
    },
    stack: {
      gap: tokens.spacing.sm,
    },
    headerRow: {
      gap: tokens.spacing.sm,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
    },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.colors.surface,
      borderWidth: 1,
      borderColor: tokens.colors.border,
    },
    title: {
      flex: 1,
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    text: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    chipsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    chip: {
      minHeight: 28,
      paddingHorizontal: tokens.spacing.sm + 2,
      borderRadius: tokens.radius.xl,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
      justifyContent: "center",
    },
    chipText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
  });
}
