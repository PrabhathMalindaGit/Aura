import { Pressable, StyleSheet, Text, View } from "react-native";

type InlineNoticeProps = {
  variant: "info" | "warning" | "error";
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

const VARIANT_STYLES = {
  info: {
    backgroundColor: "#eff6ff",
    borderColor: "#93c5fd",
    titleColor: "#1d4ed8",
    messageColor: "#1e3a8a",
  },
  warning: {
    backgroundColor: "#fffbeb",
    borderColor: "#fcd34d",
    titleColor: "#92400e",
    messageColor: "#78350f",
  },
  error: {
    backgroundColor: "#fef2f2",
    borderColor: "#fca5a5",
    titleColor: "#b91c1c",
    messageColor: "#7f1d1d",
  },
} as const;

export function InlineNotice({
  variant,
  title,
  message,
  actionLabel,
  onAction,
}: InlineNoticeProps) {
  const variantStyle = VARIANT_STYLES[variant];

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: variantStyle.backgroundColor,
          borderColor: variantStyle.borderColor,
        },
      ]}
    >
      <Text style={[styles.title, { color: variantStyle.titleColor }]}>{title}</Text>
      <Text style={[styles.message, { color: variantStyle.messageColor }]}>
        {message}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [
            styles.actionButton,
            pressed ? styles.actionButtonPressed : null,
          ]}
        >
          <Text style={[styles.actionText, { color: variantStyle.titleColor }]}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
  },
  message: {
    fontSize: 13,
    lineHeight: 18,
  },
  actionButton: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  actionButtonPressed: {
    opacity: 0.75,
  },
  actionText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
