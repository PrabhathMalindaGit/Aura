import { useMemo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/src/components/Card";
import { DomainIcon, type DomainIconKey, type DomainIconTone } from "@/src/components/IconSet";
import { useTokens } from "@/src/theme/tokens";

type CheckinStepCardProps = {
  title: string;
  description?: string;
  icon: DomainIconKey;
  tone?: DomainIconTone;
  compact?: boolean;
  children: ReactNode;
};

export function CheckinStepCard({
  title,
  description,
  icon,
  tone = "primary",
  compact = false,
  children,
}: CheckinStepCardProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <Card
      padding={compact ? tokens.spacing.lg : tokens.spacing.xl}
      style={styles.card}
    >
      <View style={[styles.stack, compact ? styles.stackCompact : null]}>
        <View style={styles.header}>
          <View style={styles.iconWrap}>
            <DomainIcon icon={icon} size={18} tone={tone} accessibilityLabel={`${title} icon`} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.title}>{title}</Text>
            {description ? <Text style={styles.description}>{description}</Text> : null}
          </View>
        </View>
        {children}
      </View>
    </Card>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    card: {
      backgroundColor: tokens.colors.surface,
      borderColor: tokens.colors.border,
    },
    stack: {
      gap: tokens.spacing.xl,
    },
    stackCompact: {
      gap: tokens.spacing.lg,
    },
    header: {
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
      backgroundColor: tokens.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: tokens.colors.border,
    },
    copy: {
      flex: 1,
      gap: tokens.spacing.xs,
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
  });
}
