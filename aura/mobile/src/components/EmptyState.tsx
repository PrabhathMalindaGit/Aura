import { useMemo, type ReactNode } from "react";
import {
  Image,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";

import {
  getIllustration,
  type IllustrationKey,
} from "@/src/assets/illustrations";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { useTokens } from "@/src/theme/tokens";

type EmptyStateVariant = "default" | "compact";

type EmptyStateProps = {
  title: string;
  description?: string;
  illustration?: ReactNode;
  imageSource?: ImageSourcePropType;
  illustrationKey?: IllustrationKey;
  ctaLabel?: string;
  onCtaPress?: () => void;
  variant?: EmptyStateVariant;
  illustrationAccessibilityLabel?: string;
  decorativeIllustration?: boolean;
};

export function EmptyState({
  title,
  description,
  illustration,
  imageSource,
  illustrationKey,
  ctaLabel,
  onCtaPress,
  variant = "default",
  illustrationAccessibilityLabel,
  decorativeIllustration = false,
}: EmptyStateProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const isCompact = variant === "compact";
  const resolvedImage = useMemo(() => {
    if (imageSource) {
      return imageSource;
    }
    if (illustrationKey) {
      return getIllustration(illustrationKey);
    }
    return undefined;
  }, [illustrationKey, imageSource]);

  return (
    <View
      accessible
      accessibilityLabel={description ? `${title}. ${description}` : title}
      style={[styles.container, isCompact ? styles.compact : null]}
    >
      {illustration ? <View style={styles.illustrationWrap}>{illustration}</View> : null}
      {!illustration && resolvedImage ? (
        <Image
          source={resolvedImage}
          resizeMode="contain"
          accessible={!decorativeIllustration}
          accessibilityRole={decorativeIllustration ? undefined : "image"}
          accessibilityIgnoresInvertColors
          accessibilityLabel={
            decorativeIllustration
              ? undefined
              : illustrationAccessibilityLabel ?? `${title} illustration`
          }
          importantForAccessibility={
            decorativeIllustration ? "no-hide-descendants" : "auto"
          }
          style={styles.image}
        />
      ) : null}
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {ctaLabel && onCtaPress ? (
        <PrimaryButton
          label={ctaLabel}
          onPress={() => {
            onCtaPress();
          }}
        />
      ) : null}
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: tokens.spacing.xxl,
      paddingHorizontal: tokens.spacing.xl,
      borderRadius: tokens.radius.xl,
      backgroundColor: tokens.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      gap: tokens.spacing.md,
    },
    compact: {
      paddingVertical: tokens.spacing.xl,
      gap: tokens.spacing.sm,
    },
    illustrationWrap: {
      alignItems: "center",
      justifyContent: "center",
      marginBottom: tokens.spacing.xs,
    },
    image: {
      width: "100%",
      maxWidth: 300,
      height: 170,
      marginBottom: tokens.spacing.xs,
    },
    title: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      textAlign: "center",
    },
    description: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      textAlign: "center",
    },
  });
}
