import { useMemo } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { DomainIcon, type DomainIconKey } from "@/src/components/IconSet";
import { SmartImage, type SmartImageSource } from "@/src/components/SmartImage";
import { useTokens } from "@/src/theme/tokens";

export type AvatarRingVariant = "none" | "ok" | "attention" | "safety";
export type AvatarFallbackVariant = "initials" | "icon";

export type AvatarProps = {
  size?: number;
  name?: string | null;
  photoUrl?: string | null;
  photoSource?: SmartImageSource | null;
  ring?: AvatarRingVariant;
  fallback?: AvatarFallbackVariant;
  iconKey?: DomainIconKey;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
};

export function getInitials(name?: string | null): string {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) {
    return "A";
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "A";
  }

  const first = words[0]?.[0] ?? "";
  const second = words[1]?.[0] ?? "";
  const initials = `${first}${second}`.toUpperCase();

  return initials || "A";
}

function getRingColor(ring: AvatarRingVariant, tokens: ReturnType<typeof useTokens>): string {
  if (ring === "ok") {
    return tokens.colors.success;
  }
  if (ring === "attention") {
    return tokens.colors.warning;
  }
  if (ring === "safety") {
    return tokens.colors.accent;
  }
  return "transparent";
}

export function Avatar({
  size = 40,
  name,
  photoUrl,
  photoSource,
  ring = "none",
  fallback = "initials",
  iconKey,
  style,
  accessibilityLabel,
  testID,
}: AvatarProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const ringWidth = Math.max(2, Math.round(size * 0.08));
  const hasRing = ring !== "none";
  const outerSize = hasRing ? size + ringWidth * 2 : size;
  const initials = getInitials(name);
  const resolvedSource: SmartImageSource | null = photoSource ?? photoUrl ?? null;
  const hasPhoto = Boolean(resolvedSource);
  const ringColor = getRingColor(ring, tokens);
  const iconSize = Math.max(16, Math.round(size * 0.45));
  const initialsFontSize = Math.max(14, Math.round(size * 0.38));

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? (name ? `Avatar for ${name}` : "Avatar")}
      style={[
        styles.outer,
        {
          width: outerSize,
          height: outerSize,
          borderRadius: outerSize / 2,
          backgroundColor: hasRing ? ringColor : "transparent",
          padding: hasRing ? ringWidth : 0,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.inner,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      >
        {hasPhoto ? (
          <SmartImage
            source={resolvedSource as SmartImageSource}
            width={size}
            height={size}
            radius={size / 2}
            contentFit="cover"
            transitionMs={150}
            backgroundVariant="muted"
            accessibilityLabel={accessibilityLabel ?? (name ? `Avatar photo for ${name}` : "Avatar photo")}
          />
        ) : fallback === "icon" ? (
          <View style={styles.fallbackCenter}>
            <DomainIcon
              icon={iconKey ?? "login"}
              tone="muted"
              size={iconSize}
              accessibilityLabel={accessibilityLabel ?? (name ? `Avatar icon for ${name}` : "Avatar icon")}
            />
          </View>
        ) : (
          <View style={styles.fallbackCenter}>
            <Text
              allowFontScaling
              numberOfLines={1}
              style={[
                styles.initials,
                {
                  fontSize: initialsFontSize,
                },
              ]}
            >
              {initials}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    outer: {
      alignItems: "center",
      justifyContent: "center",
    },
    inner: {
      overflow: "hidden",
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surfaceElevated,
    },
    fallbackCenter: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.colors.surfaceElevated,
    },
    initials: {
      color: tokens.colors.text,
      fontWeight: "700",
      lineHeight: undefined,
      textAlign: "center",
    },
  });
}
