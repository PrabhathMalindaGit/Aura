import { useMemo, type ReactNode } from "react";
import {
  Image,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";

import { PrimaryButton } from "@/src/components/PrimaryButton";
import { useTokens } from "@/src/theme/tokens";

type EmptyStateVariant = "default" | "compact";

type EmptyStateProps = {
  title: string;
  description?: string;
  illustration?: ReactNode;
  imageSource?: ImageSourcePropType;
  ctaLabel?: string;
  onCtaPress?: () => void;
  variant?: EmptyStateVariant;
};

export function EmptyState({
  title,
  description,
  illustration,
  imageSource,
  ctaLabel,
  onCtaPress,
  variant = "default",
}: EmptyStateProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const isCompact = variant === "compact";

  return (
    <View
      accessible
      accessibilityLabel={description ? `${title}. ${description}` : title}
      style={[styles.container, isCompact ? styles.compact : null]}
    >
      {illustration ? <View style={styles.illustrationWrap}>{illustration}</View> : null}
      {!illustration && imageSource ? (
        <Image source={imageSource} resizeMode="contain" style={styles.image} />
      ) : null}
      <Text style={styles.title}>{title}</Text>
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
      paddingHorizontal: tokens.spacing.lg,
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      gap: tokens.spacing.sm,
    },
    compact: {
      paddingVertical: tokens.spacing.lg,
      gap: tokens.spacing.xs,
    },
    illustrationWrap: {
      alignItems: "center",
      justifyContent: "center",
      marginBottom: tokens.spacing.xs,
    },
    image: {
      width: 84,
      height: 84,
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
