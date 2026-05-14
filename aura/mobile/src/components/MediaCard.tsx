import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Avatar, type AvatarRingVariant } from "@/src/components/Avatar";
import { Card } from "@/src/components/Card";
import {
  getPressFeedbackStyle,
} from "@/src/components/Motion";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { SmartImage, type SmartImageSource } from "@/src/components/SmartImage";
import { StatusPill, type StatusPillVariant } from "@/src/components/StatusPill";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { useTokens } from "@/src/theme/tokens";
import {
  DomainIcon,
  type DomainIconKey,
  type DomainIconTone,
} from "@/src/components/IconSet";

export type MediaCardLeading =
  | {
      type: "thumbnail";
      source: SmartImageSource;
      accessibilityLabel?: string;
      fit?: "cover" | "contain";
      bg?: "surface" | "muted";
    }
  | {
      type: "avatar";
      name?: string | null;
      photoUrl?: string | null;
      photoSource?: SmartImageSource | null;
      ring?: AvatarRingVariant;
      accessibilityLabel?: string;
    }
  | {
      type: "icon";
      icon: DomainIconKey;
      tone?: DomainIconTone;
      accessibilityLabel?: string;
    };

export type MediaCardChip = {
  text: string;
  tone?: "muted" | "info" | "success" | "warning" | "danger";
};

export type MediaCardAction = {
  label: string;
  onPress: () => void;
  kind?: "primary" | "secondary";
  disabled?: boolean;
  testID?: string;
};

export type MediaCardProps = {
  leading?: MediaCardLeading;
  title: string;
  subtitle?: string;
  chips?: MediaCardChip[];
  maxChips?: number;
  statusPill?: { text: string; tone?: StatusPillVariant };
  onPress?: () => void;
  rightAccessory?: ReactNode;
  showChevron?: boolean;
  actions?: MediaCardAction[];
  actionsDensity?: "default" | "compact";
  variant?: "default" | "emphasis" | "compact";
  density?: "default" | "calm";
  testID?: string;
  style?: StyleProp<ViewStyle>;
  surfaceStyle?: StyleProp<ViewStyle>;
};

function resolveChipStyle(
  tone: NonNullable<MediaCardChip["tone"]>,
  tokens: ReturnType<typeof useTokens>,
) {
  if (tone === "info") {
    return {
      backgroundColor: tokens.colors.accentTextOn,
      borderColor: tokens.colors.accent,
      color: tokens.scheme === "dark" ? tokens.colors.text : tokens.colors.accent,
    };
  }
  if (tone === "success") {
    return {
      backgroundColor: tokens.colors.successTextOn,
      borderColor: tokens.colors.success,
      color: tokens.scheme === "dark" ? tokens.colors.text : tokens.colors.success,
    };
  }
  if (tone === "warning") {
    return {
      backgroundColor: tokens.colors.warningTextOn,
      borderColor: tokens.colors.warning,
      color: tokens.scheme === "dark" ? tokens.colors.text : tokens.colors.warning,
    };
  }
  if (tone === "danger") {
    return {
      backgroundColor: tokens.colors.dangerTextOn,
      borderColor: tokens.colors.danger,
      color: tokens.scheme === "dark" ? tokens.colors.text : tokens.colors.danger,
    };
  }
  return {
    backgroundColor: tokens.colors.surfaceElevated,
    borderColor: tokens.colors.border,
    color: tokens.colors.textMuted,
  };
}

function buildVisibleChips(chips: MediaCardChip[], maxChips: number): MediaCardChip[] {
  if (chips.length <= maxChips) {
    return chips;
  }
  const safeMax = Math.max(1, maxChips);
  const visibleBaseCount = Math.max(0, safeMax - 1);
  const overflowCount = chips.length - visibleBaseCount;
  const base = chips.slice(0, visibleBaseCount);
  return [...base, { text: `+${overflowCount}`, tone: "muted" }];
}

export function MediaCard({
  leading,
  title,
  subtitle,
  chips = [],
  maxChips = 3,
  statusPill,
  onPress,
  rightAccessory,
  showChevron = true,
  actions = [],
  actionsDensity = "default",
  variant = "default",
  density = "default",
  testID,
  style,
  surfaceStyle,
}: MediaCardProps) {
  const tokens = useTokens();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const isCompact = variant === "compact";
  const isEmphasis = variant === "emphasis";
  const isCalm = density === "calm";
  const hasCompactActions = actionsDensity === "compact";
  const leadingSize = isCompact ? (isCalm ? 44 : 48) : isCalm ? 48 : 56;
  const avatarSize = isCompact ? (isCalm ? 38 : 40) : isCalm ? 40 : 44;
  const iconSize = isCompact ? (isCalm ? 20 : 22) : isCalm ? 22 : 24;
  const resolvedPadding = isCompact || isCalm ? tokens.spacing.md : tokens.spacing.lg;

  const cardStyle = [
    isEmphasis ? styles.cardEmphasis : null,
    !isEmphasis && variant === "compact" ? styles.cardCompact : null,
  ];

  const visibleChips = useMemo(
    () => buildVisibleChips(chips, Math.max(1, maxChips)),
    [chips, maxChips],
  );

  const resolvedAccessory =
    rightAccessory ?? (onPress && showChevron ? (
      <MaterialCommunityIcons
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        name="chevron-right"
        size={20}
        color={tokens.colors.textMuted}
      />
    ) : null);

  const topContent = (
    <View style={styles.topContent}>
      <View style={styles.topRow}>
        {leading ? (
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={styles.leadingWrap}
          >
            {leading.type === "thumbnail" ? (
              <SmartImage
                source={leading.source}
                width={leadingSize}
                height={leadingSize}
                radius={tokens.radius.md}
                contentFit={leading.fit ?? "cover"}
                backgroundVariant={leading.bg === "muted" ? "muted" : "surface"}
                accessibilityLabel={leading.accessibilityLabel ?? `${title} thumbnail`}
                accessible={false}
              />
            ) : null}
            {leading.type === "avatar" ? (
              <Avatar
                size={avatarSize}
                name={leading.name}
                photoUrl={leading.photoUrl}
                photoSource={leading.photoSource}
                ring={leading.ring}
                accessibilityLabel={
                  leading.accessibilityLabel ??
                  (leading.name ? `Avatar for ${leading.name}` : "Avatar")
                }
              />
            ) : null}
            {leading.type === "icon" ? (
              <View
                style={[
                  styles.iconCircle,
                  {
                    width: avatarSize,
                    height: avatarSize,
                    borderRadius: avatarSize / 2,
                  },
                ]}
              >
                <DomainIcon
                  icon={leading.icon}
                  tone={leading.tone ?? "muted"}
                  size={iconSize}
                  accessibilityLabel={leading.accessibilityLabel ?? `${leading.icon} icon`}
                />
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.mainContent}>
          <View style={styles.titleRow}>
            <Text
              allowFontScaling
              numberOfLines={2}
              style={[styles.title, isCalm ? styles.titleCalm : null]}
            >
              {title}
            </Text>
            {statusPill ? (
              <StatusPill
                label={statusPill.text}
                variant={statusPill.tone ?? "info"}
                accessible
                accessibilityLabel={`Status: ${statusPill.text}`}
                style={styles.statusPill}
              />
            ) : null}
          </View>
          {subtitle ? (
            <Text
              allowFontScaling
              numberOfLines={2}
              style={[styles.subtitle, isCalm ? styles.subtitleCalm : null]}
            >
              {subtitle}
            </Text>
          ) : null}
          {visibleChips.length > 0 ? (
            <View style={styles.chipsRow}>
              {visibleChips.map((chip, index) => {
                const tone = chip.tone ?? "muted";
                const chipStyle = resolveChipStyle(tone, tokens);
                return (
                  <View
                    key={`${chip.text}-${index}`}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: chipStyle.backgroundColor,
                        borderColor: chipStyle.borderColor,
                      },
                    ]}
                  >
                    <Text allowFontScaling numberOfLines={1} style={[styles.chipText, { color: chipStyle.color }]}>
                      {chip.text}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>

        {resolvedAccessory ? <View style={styles.accessoryWrap}>{resolvedAccessory}</View> : null}
      </View>
    </View>
  );

  const actionsContent =
    actions.length > 0 ? (
      <View style={[styles.actionsRow, hasCompactActions ? styles.actionsRowCompact : null]}>
        {actions.slice(0, 2).map((action, index, arr) => (
          <View
            key={`${action.label}-${index}`}
            style={arr.length === 2 && !hasCompactActions ? styles.actionFlex : undefined}
          >
            {action.kind === "secondary" ? (
              <SecondaryButton
                testID={action.testID}
                label={action.label}
                disabled={action.disabled}
                size={hasCompactActions ? "compact" : "default"}
                accessibilityLabel={action.label}
                onPress={() => {
                  action.onPress();
                }}
              />
            ) : (
              <PrimaryButton
                testID={action.testID}
                label={action.label}
                disabled={action.disabled}
                size={hasCompactActions ? "compact" : "default"}
                accessibilityLabel={action.label}
                onPress={() => {
                  action.onPress();
                }}
              />
            )}
          </View>
        ))}
      </View>
    ) : null;

  const content = (
    <View style={styles.content}>
      {topContent}
      {actionsContent}
    </View>
  );

  if (onPress) {
    return (
      <Card
        padding={0}
        style={[cardStyle, surfaceStyle, style]}
        accessibilityLabel={`${title}${subtitle ? `. ${subtitle}` : ""}`}
      >
        <View style={styles.contentWrap}>
          <Pressable
            testID={testID}
            accessibilityRole="button"
            accessibilityLabel={`${title}${subtitle ? `. ${subtitle}` : ""}`.trim()}
            accessibilityState={{ disabled: false }}
            onPress={onPress}
            style={({ pressed }) => [
              styles.pressable,
              { padding: resolvedPadding },
              pressed ? getPressFeedbackStyle(reduceMotion, 0.9) : null,
            ]}
          >
            {topContent}
          </Pressable>
          {actionsContent ? (
            <View style={[styles.actionsWrap, { paddingHorizontal: resolvedPadding, paddingBottom: resolvedPadding }]}>
              {actionsContent}
            </View>
          ) : null}
        </View>
      </Card>
    );
  }

  return (
    <View testID={testID} style={style}>
      <Card
        padding={resolvedPadding}
        style={[cardStyle, surfaceStyle]}
        accessibilityLabel={`${title}${subtitle ? `. ${subtitle}` : ""}`.trim()}
      >
        {content}
      </Card>
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    pressable: {
      borderRadius: tokens.radius.lg,
      minHeight: 44,
    },
    contentWrap: {
      gap: tokens.spacing.sm,
    },
    cardCompact: {
      backgroundColor: tokens.colors.surface,
    },
    cardEmphasis: {
      backgroundColor: tokens.colors.surfaceElevated,
      borderColor: tokens.colors.border,
    },
    content: {
      gap: tokens.spacing.md,
    },
    topContent: {
      gap: tokens.spacing.md,
    },
    topRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: tokens.spacing.md,
    },
    leadingWrap: {
      justifyContent: "center",
      alignItems: "center",
    },
    iconCircle: {
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: tokens.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: tokens.colors.border,
    },
    mainContent: {
      flex: 1,
      gap: tokens.spacing.xs,
    },
    titleRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: tokens.spacing.xs,
    },
    title: {
      flex: 1,
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    titleCalm: {
      fontSize: 18,
      lineHeight: 24,
    },
    subtitle: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    subtitleCalm: {
      fontSize: 15,
      lineHeight: 22,
    },
    statusPill: {
      alignSelf: "flex-start",
    },
    chipsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
      paddingTop: tokens.spacing.xs,
    },
    chip: {
      minHeight: 26,
      borderRadius: tokens.radius.xl,
      borderWidth: 1,
      paddingHorizontal: tokens.spacing.sm,
      justifyContent: "center",
    },
    chipText: {
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    accessoryWrap: {
      paddingTop: 2,
      alignItems: "center",
      justifyContent: "center",
    },
    actionsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    actionsRowCompact: {
      alignItems: "flex-start",
      paddingTop: tokens.spacing.xs,
    },
    actionsWrap: {
      paddingTop: 0,
    },
    actionFlex: {
      flex: 1,
    },
  });
}
