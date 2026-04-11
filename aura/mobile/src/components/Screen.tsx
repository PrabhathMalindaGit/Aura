import { useMemo, type ReactNode } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useDevRenderAudit } from "@/src/dev/renderAudit";
import { useTokens } from "@/src/theme/tokens";

type ScreenProps = {
  children: ReactNode;
  title?: string;
  scroll?: boolean;
  header?: ReactNode;
  banner?: ReactNode;
  accessibilityLabel?: string;
  testID?: string;
  maxWidth?: number;
  auditLabel?: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
};

export function Screen({
  children,
  title,
  scroll = true,
  header,
  banner,
  accessibilityLabel,
  testID,
  maxWidth,
  auditLabel,
  contentContainerStyle,
  containerStyle,
}: ScreenProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const widthStyle = maxWidth ? { maxWidth, width: "100%" as const } : null;
  useDevRenderAudit(auditLabel ? `Screen:${auditLabel}` : undefined);

  const content = (
    <View style={[styles.content, widthStyle, containerStyle]}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {header}
      {banner}
      {children}
    </View>
  );

  if (scroll) {
    return (
      <SafeAreaView
        accessible={Boolean(accessibilityLabel)}
        accessibilityLabel={accessibilityLabel}
        style={styles.safeArea}
        testID={testID}
        edges={["top", "bottom"]}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContainer,
            maxWidth ? styles.centered : null,
            contentContainerStyle,
          ]}
        >
          {content}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      accessible={Boolean(accessibilityLabel)}
      accessibilityLabel={accessibilityLabel}
      style={styles.safeArea}
      testID={testID}
      edges={["top", "bottom"]}
    >
      <View style={[styles.nonScrollContainer, maxWidth ? styles.centered : null]}>
        <View style={[styles.fill, widthStyle, containerStyle]}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {header}
          {banner}
          {children}
        </View>
      </View>
    </SafeAreaView>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: tokens.colors.background,
    },
    scrollContainer: {
      paddingHorizontal: tokens.layout.screenPaddingHorizontal,
      paddingVertical: tokens.layout.screenPaddingVertical,
    },
    nonScrollContainer: {
      flex: 1,
      paddingHorizontal: tokens.layout.screenPaddingHorizontal,
      paddingVertical: tokens.layout.screenPaddingVertical,
    },
    centered: {
      alignItems: "center",
    },
    fill: {
      flex: 1,
    },
    content: {
      gap: tokens.spacing.sm,
    },
    title: {
      fontSize: tokens.typography.title.fontSize,
      lineHeight: tokens.typography.title.lineHeight,
      fontWeight: tokens.typography.title.fontWeight,
      marginBottom: tokens.spacing.md,
      color: tokens.colors.text,
    },
  });
}
