import { Redirect, useRouter } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { useAuth } from "@/src/state/auth";
import { clearSelectedCheckin, getSelectedCheckin } from "@/src/state/progressSelection";
import { formatISOToHuman } from "@/src/utils/date";

function detailDateLabel(date?: string, createdAt?: string): string {
  if (date) {
    return formatISOToHuman(date);
  }
  if (createdAt) {
    return formatISOToHuman(createdAt);
  }
  return "Unknown date";
}

export default function CheckinDetailScreen() {
  const router = useRouter();
  const auth = useAuth();
  const selected = getSelectedCheckin();

  if (auth.status === "signedOut") {
    return <Redirect href="/(auth)/login" />;
  }

  if (!selected) {
    return (
      <Screen title="Check-in detail">
        <View style={styles.container}>
          <Text style={styles.message}>
            No check-in selected. Go back to Progress and choose a check-in.
          </Text>
          <PrimaryButton
            label="Back to Progress"
            onPress={() => {
              router.replace("/progress" as any);
            }}
          />
        </View>
      </Screen>
    );
  }

  const exercises =
    typeof selected.adherence?.exercises === "number"
      ? `${Math.round(selected.adherence.exercises * 100)}%`
      : "—";
  const medication =
    typeof selected.adherence?.medication === "boolean"
      ? selected.adherence.medication
        ? "Yes"
        : "No"
      : "—";

  return (
    <Screen title="Check-in detail">
      <View style={styles.container}>
        <Text style={styles.label}>Date</Text>
        <Text style={styles.value}>{detailDateLabel(selected.date, selected.createdAt)}</Text>

        <Text style={styles.label}>Pain</Text>
        <Text style={styles.value}>{selected.pain}/10</Text>

        <Text style={styles.label}>Mood</Text>
        <Text style={styles.value}>{selected.mood}/5</Text>

        <Text style={styles.label}>Exercises adherence</Text>
        <Text style={styles.value}>{exercises}</Text>

        <Text style={styles.label}>Medication taken</Text>
        <Text style={styles.value}>{medication}</Text>

        {selected.notes ? (
          <>
            <Text style={styles.label}>Notes</Text>
            <Text style={styles.value}>{selected.notes}</Text>
          </>
        ) : null}

        <PrimaryButton
          label="Back"
          onPress={() => {
            clearSelectedCheckin();
            router.back();
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  message: {
    fontSize: 14,
    color: "#4b5563",
    lineHeight: 20,
  },
  label: {
    fontSize: 13,
    color: "#6b7280",
    fontWeight: "600",
  },
  value: {
    fontSize: 16,
    color: "#111827",
    lineHeight: 22,
  },
});
