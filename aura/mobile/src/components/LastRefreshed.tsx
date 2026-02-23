import { StyleSheet, Text, View } from "react-native";

type LastRefreshedProps = {
  label?: string;
  value: string;
  compact?: boolean;
};

export function LastRefreshed({
  label = "Last refreshed",
  value,
  compact = false,
}: LastRefreshedProps) {
  return (
    <View style={compact ? styles.compactContainer : styles.container}>
      <Text style={compact ? styles.compactText : styles.text}>
        {label}: {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 4,
  },
  compactContainer: {
    paddingVertical: 2,
  },
  text: {
    fontSize: 13,
    color: "#4b5563",
  },
  compactText: {
    fontSize: 12,
    color: "#6b7280",
  },
});
