import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { Card } from "@/src/components/Card";
import { DomainIcon, type DomainIconKey, type DomainIconTone } from "@/src/components/IconSet";
import { MicroSparkline, type MicroSparklineTone } from "@/src/components/MicroSparkline";
import { getPressFeedbackStyle } from "@/src/components/Motion";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { useTokens } from "@/src/theme/tokens";

export type TrackerMicro =
  | { type: "sparkline"; values: number[]; tone?: MicroSparklineTone }
  | { type: "bars"; values: number[] }
  | { type: "dots"; values: number[] }
  | { type: "ring"; progress: number };

export type TrackerTileVariant = "default" | "compact";

export type TrackerTileProps = {
  icon: DomainIconKey;
  label: string;
  value: string;
  delta?: string;
  tone?: DomainIconTone;
  micro?: TrackerMicro;
  variant?: TrackerTileVariant;
  onPress?: () => void;
  testID?: string;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function resolveToneColor(
  tone: DomainIconTone | undefined,
  tokens: ReturnType<typeof useTokens>,
): string {
  if (tone === "text") {
    return tokens.colors.text;
  }
  if (tone === "primary") {
    return tokens.colors.primary;
  }
  if (tone === "accent") {
    return tokens.colors.accent;
  }
  if (tone === "success") {
    return tokens.colors.success;
  }
  if (tone === "warning") {
    return tokens.colors.warning;
  }
  if (tone === "danger") {
    return tokens.colors.danger;
  }
  return tokens.colors.textMuted;
}

function mapTileToneToSparklineTone(tone: DomainIconTone | undefined): MicroSparklineTone {
  if (tone === "primary") {
    return "primary";
  }
  if (tone === "accent") {
    return "accent";
  }
  if (tone === "success") {
    return "success";
  }
  if (tone === "warning") {
    return "warning";
  }
  return "muted";
}

function normalizeValues(values: number[]) {
  if (values.length === 0) {
    return [];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return values.map(() => 0.5);
  }

  return values.map((value) => clamp01((value - min) / (max - min)));
}

export function TrackerTile({
  icon,
  label,
  value,
  delta,
  tone = "muted",
  micro,
  variant = "default",
  onPress,
  testID,
}: TrackerTileProps) {
  const tokens = useTokens();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const isCompact = variant === "compact";
  const iconSize = isCompact ? 18 : 20;
  const iconToneColor = resolveToneColor(tone, tokens);
  const containerPadding = isCompact ? tokens.spacing.md : tokens.spacing.lg;
  const valueStyle = isCompact ? styles.valueCompact : styles.value;
  const deltaText = delta ?? "No change";

  const normalizedBars = useMemo(() => {
    if (!micro || micro.type !== "bars") {
      return [];
    }
    return normalizeValues(micro.values);
  }, [micro]);

  const normalizedDots = useMemo(() => {
    if (!micro || micro.type !== "dots") {
      return [];
    }
    return normalizeValues(micro.values);
  }, [micro]);

  const ringProgress = useMemo(() => {
    if (!micro || micro.type !== "ring") {
      return 0;
    }
    return clamp01(micro.progress);
  }, [micro]);

  const microVisual = (() => {
    if (!micro) {
      return null;
    }

    if (micro.type === "sparkline") {
      return (
        <MicroSparkline
          values={micro.values}
          width={72}
          height={22}
          tone={micro.tone ?? mapTileToneToSparklineTone(tone)}
          showEndDot
          showBaseline={false}
        />
      );
    }

    if (micro.type === "bars") {
      return (
        <View style={styles.barsWrap}>
          {normalizedBars.map((normalized, index) => {
            const barHeight = 6 + normalized * 12;
            return (
              <View
                key={`bar-${index}`}
                style={[
                  styles.bar,
                  {
                    height: barHeight,
                    backgroundColor: iconToneColor,
                    opacity: 0.45 + normalized * 0.55,
                  },
                ]}
              />
            );
          })}
        </View>
      );
    }

    if (micro.type === "dots") {
      return (
        <View style={styles.dotsWrap}>
          {normalizedDots.map((normalized, index) => {
            const dotSize = 4 + normalized * 2;
            return (
              <View
                key={`dot-${index}`}
                style={[
                  styles.dot,
                  {
                    width: dotSize,
                    height: dotSize,
                    borderRadius: dotSize / 2,
                    backgroundColor: iconToneColor,
                    opacity: 0.4 + normalized * 0.6,
                  },
                ]}
              />
            );
          })}
        </View>
      );
    }

    const size = 22;
    const strokeWidth = 2;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const filledLength = circumference * ringProgress;
    const dashOffset = circumference - filledLength;

    return (
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        accessibilityRole="image"
        accessible
        accessibilityLabel="Progress ring"
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={tokens.colors.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={iconToneColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
    );
  })();

  const content = (
    <View style={styles.content}>
      <View style={styles.headerRow}>
        <View style={styles.iconLabelRow}>
          <View style={styles.iconWrap}>
            <DomainIcon icon={icon} tone={tone} size={iconSize} accessibilityLabel={`${label} icon`} />
          </View>
          <Text allowFontScaling numberOfLines={1} style={styles.label}>
            {label}
          </Text>
        </View>
      </View>

      <Text allowFontScaling numberOfLines={1} style={valueStyle}>
        {value}
      </Text>

      <View style={styles.footerRow}>
        <Text allowFontScaling numberOfLines={1} style={styles.delta}>
          {deltaText}
        </Text>
        <View style={styles.microWrap}>{microVisual}</View>
      </View>
    </View>
  );

  if (onPress) {
    return (
      <View testID={testID}>
        <Card padding={0}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label}, ${value}${delta ? `, ${delta}` : ""}`}
            onPress={onPress}
            style={({ pressed }) => [
              styles.pressable,
              { padding: containerPadding },
              pressed ? getPressFeedbackStyle(reduceMotion, 0.9) : null,
            ]}
          >
            {content}
          </Pressable>
        </Card>
      </View>
    );
  }

  return (
    <View testID={testID}>
      <Card padding={containerPadding} accessibilityLabel={`${label}, ${value}${delta ? `, ${delta}` : ""}`}>
        {content}
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
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    iconLabelRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.xs,
      flex: 1,
      minWidth: 0,
    },
    iconWrap: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: tokens.colors.border,
    },
    label: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
      flexShrink: 1,
    },
    value: {
      color: tokens.colors.text,
      fontSize: tokens.typography.title.fontSize,
      lineHeight: tokens.typography.title.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    valueCompact: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    footerRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    delta: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
      flex: 1,
    },
    microWrap: {
      minWidth: 72,
      alignItems: "flex-end",
      justifyContent: "center",
    },
    barsWrap: {
      minWidth: 72,
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "flex-end",
      gap: 3,
      paddingHorizontal: 2,
      minHeight: 22,
    },
    bar: {
      width: 7,
      borderRadius: 3,
    },
    dotsWrap: {
      minWidth: 72,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 4,
      minHeight: 22,
    },
    dot: {
      borderRadius: 4,
    },
  });
}
