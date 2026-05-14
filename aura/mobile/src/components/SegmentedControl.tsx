import { useMemo, type ComponentType, type JSX } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { DomainIcon, type DomainIconKey } from "@/src/components/IconSet";
import { getPressFeedbackStyle } from "@/src/components/Motion";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { useTokens } from "@/src/theme/tokens";

type NativeSegmentedControlProps = {
  values: string[];
  selectedIndex: number;
  onChange: (event: { nativeEvent: { selectedSegmentIndex: number } }) => void;
  enabled?: boolean;
  style?: unknown;
};

let NativeIOSSegmentedControl: ComponentType<NativeSegmentedControlProps> | null = null;
try {
  const loaded = require("@react-native-segmented-control/segmented-control");
  NativeIOSSegmentedControl = loaded?.default ?? null;
} catch {
  NativeIOSSegmentedControl = null;
}

export type SegmentedSize = "sm" | "md";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: DomainIconKey;
  disabled?: boolean;
  a11yLabel?: string;
};

export type SegmentedControlProps<T extends string> = {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  size?: SegmentedSize;
  fullWidth?: boolean;
  allowWrap?: boolean;
  preferNativeIOS?: boolean;
  tone?: "primary" | "accent";
  testID?: string;
  accessibilityLabel?: string;
};

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  size = "md",
  fullWidth = true,
  allowWrap = false,
  preferNativeIOS = false,
  tone = "primary",
  testID,
  accessibilityLabel,
}: SegmentedControlProps<T>): JSX.Element {
  const tokens = useTokens();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const selectedIndex = useMemo(
    () => options.findIndex((option) => option.value === value),
    [options, value],
  );

  const selectedBackgroundColor =
    tone === "accent" ? tokens.colors.accent : tokens.colors.primary;
  const selectedTextColor = tokens.colors.primaryTextOn;

  const canUseNativeIOS =
    Platform.OS === "ios" &&
    preferNativeIOS &&
    NativeIOSSegmentedControl !== null &&
    !allowWrap &&
    options.every((option) => !option.icon && !option.disabled);

  if (canUseNativeIOS && NativeIOSSegmentedControl) {
    const safeIndex = selectedIndex >= 0 ? selectedIndex : 0;
    return (
      <View
        testID={testID}
        accessible
        accessibilityRole="tablist"
        accessibilityLabel={accessibilityLabel ?? "Segmented control"}
        style={[
          styles.nativeWrap,
          fullWidth ? styles.fullWidth : null,
          {
            borderColor: tokens.colors.border,
            backgroundColor: tokens.colors.surfaceElevated,
          },
        ]}
      >
        <NativeIOSSegmentedControl
          values={options.map((option) => option.label)}
          selectedIndex={safeIndex}
          enabled
          onChange={(event) => {
            const next = options[event.nativeEvent.selectedSegmentIndex];
            if (!next || next.disabled) {
              return;
            }
            onChange(next.value);
          }}
          style={styles.nativeControl}
        />
      </View>
    );
  }

  const buttonMinHeight = size === "sm" ? 44 : 48;
  const buttonHorizontalPadding = size === "sm" ? tokens.spacing.sm : tokens.spacing.md;
  const iconSize = size === "sm" ? 16 : 18;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel ?? "Segmented control"}
      style={[
        styles.container,
        {
          backgroundColor: tokens.colors.surfaceElevated,
          borderColor: tokens.colors.border,
        },
        fullWidth ? styles.fullWidth : null,
        allowWrap ? styles.wrap : styles.noWrap,
      ]}
    >
      {options.map((option) => {
        const isSelected = option.value === value;
        const isDisabled = !!option.disabled;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected, disabled: isDisabled }}
            accessibilityLabel={
              option.a11yLabel ??
              `${option.label}${isSelected ? ", selected" : ""}`
            }
            disabled={isDisabled}
            onPress={() => {
              if (isDisabled || isSelected) {
                return;
              }
              onChange(option.value);
            }}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            style={({ pressed }) => [
              styles.segment,
              !allowWrap ? styles.segmentFlex : null,
              {
                minHeight: buttonMinHeight,
                paddingHorizontal: buttonHorizontalPadding,
                backgroundColor: isSelected ? selectedBackgroundColor : "transparent",
                opacity: isDisabled ? 0.45 : 1,
              },
              pressed && !isDisabled ? getPressFeedbackStyle(reduceMotion, 0.9) : null,
            ]}
          >
            {option.icon ? (
              <View
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                style={styles.segmentIconWrap}
              >
                <DomainIcon
                  icon={option.icon}
                  size={iconSize}
                  tone={isSelected ? "text" : "muted"}
                  accessibilityLabel={`${option.label} icon`}
                  style={styles.segmentIcon}
                />
              </View>
            ) : null}
            <Text
              allowFontScaling
              numberOfLines={allowWrap ? 2 : 1}
              style={[
                styles.segmentLabel,
                {
                  color: isSelected ? selectedTextColor : tokens.colors.textMuted,
                  fontWeight: isSelected
                    ? tokens.typography.weights.semibold
                    : tokens.typography.weights.medium,
                },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      borderWidth: 1,
      borderRadius: 999,
      padding: 4,
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    fullWidth: {
      width: "100%",
    },
    noWrap: {
      flexWrap: "nowrap",
    },
    wrap: {
      flexWrap: "wrap",
    },
    segment: {
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      minWidth: 56,
    },
    segmentFlex: {
      flex: 1,
    },
    segmentIcon: {
      marginRight: tokens.spacing.xs,
    },
    segmentIconWrap: {
      justifyContent: "center",
      alignItems: "center",
    },
    segmentLabel: {
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      textAlign: "center",
    },
    nativeWrap: {
      borderWidth: 1,
      borderRadius: 999,
      padding: 4,
    },
    nativeControl: {
      minHeight: 44,
    },
  });
}
