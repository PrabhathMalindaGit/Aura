import { useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "@/src/components/Card";
import { DomainIcon, type DomainIconKey, type DomainIconTone } from "@/src/components/IconSet";
import { getPressFeedbackStyle } from "@/src/components/Motion";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { SmartImage, type SmartImageSource } from "@/src/components/SmartImage";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { useTokens } from "@/src/theme/tokens";

export type TipCardTone = "info" | "success" | "warning" | "neutral" | "safety";

export type TipCardLeading =
  | {
      type: "icon";
      icon: DomainIconKey;
      tone?: DomainIconTone;
      a11yLabel?: string;
    }
  | {
      type: "thumbnail";
      source: SmartImageSource;
      fit?: "cover" | "contain";
      a11yLabel?: string;
    };

export type TipCardAction = {
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary";
  disabled?: boolean;
  testID?: string;
};

export type TipCardProps = {
  tone?: TipCardTone;
  leading?: TipCardLeading;
  title?: string;
  text: string;
  chips?: string[];
  onPress?: () => void;
  actions?: TipCardAction[];
  compact?: boolean;
  testID?: string;
  accessibilityLabel?: string;
};

function getToneStyles(tokens: ReturnType<typeof useTokens>, tone: TipCardTone) {
  if (tone === "info") {
    return {
      backgroundColor: tokens.colors.accentTextOn,
      borderColor: tokens.colors.accent,
      iconTone: "accent" as DomainIconTone,
    };
  }
  if (tone === "success") {
    return {
      backgroundColor: tokens.colors.successTextOn,
      borderColor: tokens.colors.success,
      iconTone: "success" as DomainIconTone,
    };
  }
  if (tone === "warning") {
    return {
      backgroundColor: tokens.colors.warningTextOn,
      borderColor: tokens.colors.warning,
      iconTone: "warning" as DomainIconTone,
    };
  }
  if (tone === "safety") {
    return {
      backgroundColor: tokens.colors.accentTextOn,
      borderColor: tokens.colors.accent,
      iconTone: "accent" as DomainIconTone,
    };
  }
  return {
    backgroundColor: tokens.colors.surfaceElevated,
    borderColor: tokens.colors.border,
    iconTone: "muted" as DomainIconTone,
  };
}

function visibleChips(chips: string[]): string[] {
  if (chips.length <= 2) {
    return chips;
  }
  const overflow = chips.length - 1;
  return [chips[0], `+${overflow}`];
}

export function TipCard({
  tone = "neutral",
  leading,
  title,
  text,
  chips = [],
  onPress,
  actions = [],
  compact = false,
  testID,
  accessibilityLabel,
}: TipCardProps) {
  const tokens = useTokens();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const toneStyles = getToneStyles(tokens, tone);
  const effectiveLeading: TipCardLeading = leading ?? {
    type: "icon",
    icon: "insights",
    tone: toneStyles.iconTone,
  };

  const leadingSize = compact ? 36 : 40;
  const chipList = visibleChips(chips);
  const accessibleLabel =
    accessibilityLabel ?? `${title ? `${title}. ` : ""}${text}`.trim();

  const content = (
    <View style={styles.content}>
      <View style={styles.topRow}>
        <View
          style={[
            styles.leadingCircle,
            {
              width: leadingSize,
              height: leadingSize,
              borderRadius: leadingSize / 2,
              borderColor: tokens.colors.border,
              backgroundColor: tokens.colors.surface,
            },
          ]}
        >
          {effectiveLeading.type === "thumbnail" ? (
            <SmartImage
              source={effectiveLeading.source}
              width={leadingSize}
              height={leadingSize}
              radius={leadingSize / 2}
              contentFit={effectiveLeading.fit ?? "cover"}
              accessibilityLabel={effectiveLeading.a11yLabel ?? "Tip thumbnail"}
            />
          ) : (
            <DomainIcon
              icon={effectiveLeading.icon}
              tone={effectiveLeading.tone ?? toneStyles.iconTone}
              size={compact ? 18 : 20}
              accessibilityLabel={effectiveLeading.a11yLabel ?? `${effectiveLeading.icon} tip icon`}
            />
          )}
        </View>

        <View style={styles.textCol}>
          {title ? (
            <Text allowFontScaling style={[styles.title, compact ? styles.titleCompact : null]}>
              {title}
            </Text>
          ) : null}
          <Text allowFontScaling style={styles.bodyText}>
            {text}
          </Text>
        </View>
      </View>

      {chipList.length > 0 ? (
        <View style={styles.chipsRow}>
          {chipList.map((chip) => (
            <View key={chip} style={styles.chip}>
              <Text allowFontScaling style={styles.chipText}>
                {chip}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {actions.length > 0 ? (
        <View style={styles.actionsRow}>
          {actions.slice(0, 2).map((action) => (
            <View key={action.label} style={actions.length > 1 ? styles.actionFlex : undefined}>
              {action.kind === "secondary" ? (
                <SecondaryButton
                  label={action.label}
                  onPress={() => {
                    action.onPress();
                  }}
                  disabled={action.disabled}
                  accessibilityLabel={action.label}
                />
              ) : (
                <PrimaryButton
                  label={action.label}
                  onPress={() => {
                    action.onPress();
                  }}
                  disabled={action.disabled}
                  accessibilityLabel={action.label}
                />
              )}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );

  const cardNode = (
    <Card
      padding={compact ? tokens.spacing.md : tokens.spacing.lg}
      style={{
        backgroundColor: toneStyles.backgroundColor,
        borderColor: toneStyles.borderColor,
      }}
      accessibilityLabel={accessibleLabel}
    >
      {content}
    </Card>
  );

  if (!onPress) {
    return <View testID={testID}>{cardNode}</View>;
  }

  return (
    <View testID={testID}>
      <Card
        padding={0}
        style={{
          backgroundColor: toneStyles.backgroundColor,
          borderColor: toneStyles.borderColor,
        }}
        accessibilityLabel={accessibleLabel}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibleLabel}
          onPress={onPress}
          style={({ pressed }) => [
            styles.pressable,
            { padding: compact ? tokens.spacing.md : tokens.spacing.lg },
            pressed ? getPressFeedbackStyle(reduceMotion, 0.9) : null,
          ]}
        >
          {content}
        </Pressable>
      </Card>
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    pressable: {
      borderRadius: tokens.radius.lg,
    },
    content: {
      gap: tokens.spacing.sm,
    },
    topRow: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
      alignItems: "flex-start",
    },
    leadingCircle: {
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      overflow: "hidden",
      flexShrink: 0,
    },
    textCol: {
      flex: 1,
      gap: tokens.spacing.xs,
    },
    title: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    titleCompact: {
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    bodyText: {
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
      minHeight: 24,
      borderRadius: tokens.radius.xl,
      backgroundColor: tokens.colors.surface,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      justifyContent: "center",
      paddingHorizontal: tokens.spacing.sm,
    },
    chipText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    actionsRow: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
      flexWrap: "wrap",
    },
    actionFlex: {
      flex: 1,
    },
  });
}
