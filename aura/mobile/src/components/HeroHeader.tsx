import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { LinearGradient } from "expo-linear-gradient";
import { useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { DomainIcon, type DomainIconKey, type DomainIconTone } from "@/src/components/IconSet";
import { getPressFeedbackStyle } from "@/src/components/Motion";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { useTokens } from "@/src/theme/tokens";

type HeroHeaderActionIcon = DomainIconKey | "chevron-left" | "bell" | "dots-horizontal";

export type HeroHeaderAction = {
  icon: HeroHeaderActionIcon;
  onPress: () => void;
  accessibilityLabel: string;
  tone?: DomainIconTone;
  testID?: string;
};

export type HeroHeaderProps = {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  rightActions?: HeroHeaderAction[];
  children?: ReactNode;
  variant?: "default" | "compact";
  testID?: string;
};

function isSpecialActionIcon(
  icon: HeroHeaderActionIcon,
): icon is "chevron-left" | "bell" | "dots-horizontal" {
  return icon === "chevron-left" || icon === "bell" || icon === "dots-horizontal";
}

function mapSpecialIcon(icon: "chevron-left" | "bell" | "dots-horizontal") {
  if (icon === "bell") {
    return "bell-outline";
  }
  return icon;
}

export function HeroHeader({
  title,
  subtitle,
  left,
  rightActions = [],
  children,
  variant = "default",
  testID,
}: HeroHeaderProps) {
  const tokens = useTokens();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const isCompact = variant === "compact";
  const actionSize = 40;

  return (
    <LinearGradient
      testID={testID}
      colors={[
        tokens.colors.surfaceElevated,
        tokens.colors.surface,
        tokens.colors.surfaceElevated,
      ]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.container,
        isCompact ? styles.compactContainer : null,
        {
          borderColor: tokens.colors.border,
        },
      ]}
    >
      <View style={styles.topRow}>
        {left ? <View style={styles.leftWrap}>{left}</View> : null}

        <View style={styles.titleWrap}>
          <Text
            allowFontScaling
            accessibilityRole="header"
            style={[styles.title, isCompact ? styles.titleCompact : null]}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text allowFontScaling style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {rightActions.length > 0 ? (
          <View style={styles.actionsRow}>
            {rightActions.map((action, index) => (
              <Pressable
                key={`${action.accessibilityLabel}-${index}`}
                testID={action.testID}
                accessibilityRole="button"
                accessibilityLabel={action.accessibilityLabel}
                accessibilityState={{ disabled: false }}
                onPress={action.onPress}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                style={({ pressed }) => [
                  styles.actionButton,
                  {
                    width: actionSize,
                    height: actionSize,
                    borderRadius: actionSize / 2,
                    borderColor: tokens.colors.border,
                    backgroundColor: tokens.colors.surface,
                  },
                  pressed ? getPressFeedbackStyle(reduceMotion, 0.9) : null,
                ]}
              >
                {isSpecialActionIcon(action.icon) ? (
                  <View
                    accessible={false}
                    importantForAccessibility="no-hide-descendants"
                  >
                    <MaterialCommunityIcons
                      name={mapSpecialIcon(action.icon)}
                      size={19}
                      color={
                        action.tone === "accent"
                          ? tokens.colors.accent
                          : action.tone === "primary"
                            ? tokens.colors.primary
                            : tokens.colors.textMuted
                      }
                    />
                  </View>
                ) : (
                  <View
                    accessible={false}
                    importantForAccessibility="no-hide-descendants"
                  >
                    <DomainIcon
                      icon={action.icon}
                      tone={action.tone ?? "muted"}
                      size={19}
                      accessibilityLabel={`${action.icon} icon`}
                    />
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {children ? <View style={styles.childrenWrap}>{children}</View> : null}
    </LinearGradient>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      borderWidth: 1,
      borderRadius: tokens.radius.xl,
      paddingVertical: tokens.spacing.xl,
      paddingHorizontal: tokens.spacing.xl,
      gap: tokens.spacing.lg,
      ...tokens.elevation.card,
    },
    compactContainer: {
      paddingVertical: tokens.spacing.md,
      paddingHorizontal: tokens.spacing.lg,
    },
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
    },
    leftWrap: {
      alignItems: "center",
      justifyContent: "center",
    },
    titleWrap: {
      flex: 1,
      gap: tokens.spacing.xs,
      minWidth: 0,
    },
    title: {
      color: tokens.colors.text,
      fontSize: tokens.typography.title.fontSize,
      lineHeight: tokens.typography.title.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    titleCompact: {
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
    },
    subtitle: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    actionsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.xs,
    },
    actionButton: {
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
    },
    childrenWrap: {
      gap: tokens.spacing.md,
    },
  });
}
