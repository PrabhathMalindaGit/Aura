import { useMemo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { Card, type CardVariant } from "@/src/components/Card";
import { SectionTitle } from "@/src/components/SectionTitle";
import { useTokens } from "@/src/theme/tokens";

type SectionProps = {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  heading?: boolean;
  card?: boolean;
  cardVariant?: CardVariant;
  children: ReactNode;
};

export function Section({
  title,
  subtitle,
  left,
  right,
  heading = true,
  card = false,
  cardVariant = "default",
  children,
}: SectionProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  if (card) {
    return (
      <View style={styles.section}>
        <Card variant={cardVariant} padding={tokens.spacing.lg}>
          <View style={styles.content}>
            <SectionTitle
              title={title}
              subtitle={subtitle}
              left={left}
              right={right}
              isHeading={heading}
            />
            <View>{children}</View>
          </View>
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <SectionTitle
        title={title}
        subtitle={subtitle}
        left={left}
        right={right}
        isHeading={heading}
      />
      <View>{children}</View>
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    section: {
      marginBottom: tokens.spacing.xl,
      gap: tokens.spacing.md,
    },
    content: {
      gap: tokens.spacing.md,
    },
  });
}
