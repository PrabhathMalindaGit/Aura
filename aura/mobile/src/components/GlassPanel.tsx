import { BlurView } from "expo-blur";
import { useMemo, type ReactNode } from "react";
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useTokens } from "@/src/theme/tokens";

export type GlassPanelProps = {
  children?: ReactNode;
  intensity?: number;
  tint?: "light" | "dark" | "default";
  radius?: number;
  fallbackVariant?: "surface" | "elevated";
  fallbackOpacity?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
  forceFallback?: boolean;
};

export function GlassPanel({
  children,
  intensity = 35,
  tint = "default",
  radius,
  fallbackVariant = "elevated",
  fallbackOpacity = 0.72,
  style,
  testID,
  accessibilityLabel,
  forceFallback = false,
}: GlassPanelProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const resolvedRadius = radius ?? tokens.radius.lg;
  const fallbackBaseColor =
    fallbackVariant === "surface" ? tokens.colors.surface : tokens.colors.surfaceElevated;
  const useBlur = Platform.OS === "ios" && !forceFallback;

  return (
    <View
      testID={testID}
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.panel,
        {
          borderRadius: resolvedRadius,
          borderColor: tokens.colors.border,
          backgroundColor: tokens.colors.surface,
        },
        style,
      ]}
    >
      {useBlur ? (
        <>
          <BlurView intensity={intensity} tint={tint} style={StyleSheet.absoluteFill} />
          <View
            pointerEvents="none"
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={[
              StyleSheet.absoluteFillObject,
              {
                backgroundColor: fallbackBaseColor,
                opacity: 0.34,
              },
            ]}
          />
        </>
      ) : (
        <View
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: fallbackBaseColor,
              opacity: fallbackOpacity,
            },
          ]}
        />
      )}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    panel: {
      overflow: "hidden",
      borderWidth: 1,
    },
    content: {
      padding: tokens.spacing.lg,
      gap: tokens.spacing.sm,
    },
  });
}
