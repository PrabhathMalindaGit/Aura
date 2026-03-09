import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, type CardVariant } from '@/src/components/Card';
import { DomainIcon, type DomainIconKey, type DomainIconTone } from '@/src/components/IconSet';
import { useTokens } from '@/src/theme/tokens';

type CheckinSectionCardProps = {
  title: string;
  description?: string;
  icon: DomainIconKey;
  tone?: DomainIconTone;
  variant?: CardVariant;
  children: ReactNode;
};

export function CheckinSectionCard({
  title,
  description,
  icon,
  tone = 'accent',
  variant = 'outlined',
  children,
}: CheckinSectionCardProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  return (
    <Card variant={variant}>
      <View style={styles.stack}>
        <View style={styles.header}>
          <DomainIcon icon={icon} tone={tone} size={18} accessibilityLabel={`${title} icon`} />
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
    stack: {
      gap: tokens.spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: tokens.spacing.sm,
    },
    copy: {
      flex: 1,
      gap: 2,
    },
    title: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    description: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
  });
}
