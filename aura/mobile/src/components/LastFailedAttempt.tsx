import { Pressable, StyleSheet, Text, View } from "react-native";

type LastFailedAttemptProps = {
  label?: string;
  value: string;
  title?: string;
  message?: string;
  onClear?: () => void;
  compact?: boolean;
};

export function LastFailedAttempt({
  label = "Last failed attempt",
  value,
  title,
  message,
  onClear,
  compact = false,
}: LastFailedAttemptProps) {
  const hasDetails = Boolean(title || message) && value !== "Never";

  return (
    <View style={compact ? styles.compactContainer : styles.container}>
      <Text style={compact ? styles.compactPrimary : styles.primary}>
        {label}: {value}
      </Text>

      {hasDetails ? (
        <View style={styles.detailRow}>
          <Text style={styles.detailText}>
            {title ?? "Request failed"}
            {message ? ` — ${message}` : ""}
          </Text>
          {onClear ? (
            <Pressable
              accessibilityRole="button"
              onPress={onClear}
              style={({ pressed }) => [
                styles.clearButton,
                pressed ? styles.clearButtonPressed : null,
              ]}
            >
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 4,
    gap: 4,
  },
  compactContainer: {
    paddingVertical: 2,
    gap: 3,
  },
  primary: {
    fontSize: 13,
    color: "#4b5563",
  },
  compactPrimary: {
    fontSize: 12,
    color: "#6b7280",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  detailText: {
    flex: 1,
    fontSize: 12,
    color: "#7f1d1d",
  },
  clearButton: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  clearButtonPressed: {
    opacity: 0.75,
  },
  clearText: {
    fontSize: 12,
    color: "#b91c1c",
    fontWeight: "600",
  },
});
