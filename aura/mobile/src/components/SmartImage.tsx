import { Image as ExpoImage, type ImageContentFit, type ImageSource } from "expo-image";
import { useMemo } from "react";
import {
  Platform,
  StyleSheet,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { DomainIcon } from "@/src/components/IconSet";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { useTokens } from "@/src/theme/tokens";

export type SmartImageSource = number | { uri: string } | string;

export type SmartImageProps = {
  source: SmartImageSource;
  width?: number | string;
  height?: number;
  radius?: number;
  contentFit?: "cover" | "contain";
  contentPosition?: string;
  placeholderBlurhash?: string;
  placeholderThumbhash?: string;
  showFallbackPlaceholder?: boolean;
  cachePolicy?: "none" | "disk" | "memory" | "memory-disk";
  transitionMs?: number;
  containerStyle?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  backgroundVariant?: "surface" | "surfaceElevated" | "muted";
  accessibilityLabel?: string;
  accessible?: boolean;
  testID?: string;
};

function resolveBackgroundColor(
  variant: "surface" | "surfaceElevated" | "muted",
  tokens: ReturnType<typeof useTokens>,
) {
  if (variant === "surfaceElevated") {
    return tokens.colors.surfaceElevated;
  }
  if (variant === "muted") {
    return tokens.colors.background;
  }
  return tokens.colors.surface;
}

export function SmartImage({
  source,
  width = "100%",
  height = 160,
  radius,
  contentFit = "cover",
  contentPosition,
  placeholderBlurhash,
  placeholderThumbhash,
  showFallbackPlaceholder = true,
  cachePolicy = "memory-disk",
  transitionMs = Platform.OS === "web" ? 120 : 150,
  containerStyle,
  imageStyle,
  backgroundVariant = "surface",
  accessibilityLabel,
  accessible = true,
  testID,
}: SmartImageProps) {
  const tokens = useTokens();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const resolvedRadius = radius ?? tokens.radius.lg;
  const resolvedWidth = width as ViewStyle["width"];
  const backgroundColor = resolveBackgroundColor(backgroundVariant, tokens);

  const normalizedSource = useMemo<ImageSource | number>(() => {
    if (typeof source === "string") {
      return { uri: source };
    }
    if (typeof source === "number") {
      return source;
    }
    return source;
  }, [source]);

  const placeholder = useMemo(() => {
    if (placeholderBlurhash) {
      return { blurhash: placeholderBlurhash };
    }
    if (placeholderThumbhash) {
      return { thumbhash: placeholderThumbhash };
    }
    return undefined;
  }, [placeholderBlurhash, placeholderThumbhash]);

  const resolvedTransitionMs = reduceMotion ? 0 : transitionMs;

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        {
          width: resolvedWidth,
          height,
          borderRadius: resolvedRadius,
          backgroundColor,
        },
        containerStyle,
      ]}
    >
      {showFallbackPlaceholder ? (
        <View
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={styles.placeholderLayer}
        >
          <DomainIcon
            icon="photos"
            size={24}
            tone="muted"
            accessibilityLabel="Image placeholder icon"
          />
        </View>
      ) : null}
      <ExpoImage
        accessible={accessible}
        accessibilityRole={accessible ? "image" : undefined}
        accessibilityLabel={accessible ? accessibilityLabel ?? "Image" : undefined}
        importantForAccessibility={accessible ? "auto" : "no-hide-descendants"}
        source={normalizedSource}
        placeholder={placeholder}
        contentFit={contentFit as ImageContentFit}
        contentPosition={contentPosition as never}
        transition={resolvedTransitionMs}
        cachePolicy={cachePolicy}
        style={[styles.image, imageStyle]}
      />
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      overflow: "hidden",
      position: "relative",
      borderWidth: 1,
      borderColor: tokens.colors.border,
    },
    placeholderLayer: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
    },
    image: {
      width: "100%",
      height: "100%",
    },
  });
}
