import type { ReactNode } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ScreenProps = {
  children: ReactNode;
  title?: string;
  scroll?: boolean;
  header?: ReactNode;
  banner?: ReactNode;
  testID?: string;
  maxWidth?: number;
  contentContainerStyle?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
};

export function Screen({
  children,
  title,
  scroll = true,
  header,
  banner,
  testID,
  maxWidth,
  contentContainerStyle,
  containerStyle,
}: ScreenProps) {
  const widthStyle = maxWidth ? { maxWidth, width: "100%" as const } : null;

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
      <SafeAreaView style={styles.safeArea} testID={testID} edges={["top", "bottom"]}>
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
    <SafeAreaView style={styles.safeArea} testID={testID} edges={["top", "bottom"]}>
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  scrollContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  nonScrollContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  centered: {
    alignItems: "center",
  },
  fill: {
    flex: 1,
  },
  content: {
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 12,
    color: "#0f172a",
  },
});
