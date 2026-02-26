import { Redirect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { InlineNotice } from "@/src/components/InlineNotice";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { Section } from "@/src/components/Section";
import { useAuth } from "@/src/state/auth";
import {
  formatLastUsed,
  getUsage,
  type CopingUsage,
} from "@/src/state/copingUsage";

type UsageSummary = {
  breathing: CopingUsage;
  grounding: CopingUsage;
};

const DEFAULT_SUMMARY: UsageSummary = {
  breathing: { count: 0, lastUsedAt: null },
  grounding: { count: 0, lastUsedAt: null },
};

export default function CopingToolsScreen() {
  const auth = useAuth();
  const router = useRouter();
  const [usage, setUsage] = useState<UsageSummary>(DEFAULT_SUMMARY);

  const loadUsage = useCallback(async () => {
    const [breathing, grounding] = await Promise.all([
      getUsage("breathing"),
      getUsage("grounding"),
    ]);
    setUsage({ breathing, grounding });
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (auth.status !== "signedIn") {
        return undefined;
      }
      void loadUsage();
      return undefined;
    }, [auth.status, loadUsage])
  );

  if (auth.status === "loading") {
    return (
      <Screen title="Coping tools">
        <View style={styles.centered}>
          <Text style={styles.statusText}>Loading…</Text>
        </View>
      </Screen>
    );
  }

  if (auth.status === "signedOut") {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Screen title="Coping tools">
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.subtitle}>These tools work offline.</Text>

        <Section title="Breathing">
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Guided breathing</Text>
            <Text style={styles.meta}>
              Used {usage.breathing.count} time{usage.breathing.count === 1 ? "" : "s"}
            </Text>
            <Text style={styles.meta}>
              Last used: {formatLastUsed(usage.breathing.lastUsedAt)}
            </Text>
            <PrimaryButton
              label="Start"
              onPress={() => router.push("/breathing" as never)}
              accessibilityLabel="Start breathing tool"
            />
          </View>
        </Section>

        <Section title="Grounding (5-4-3-2-1)">
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Senses grounding</Text>
            <Text style={styles.meta}>
              Used {usage.grounding.count} time{usage.grounding.count === 1 ? "" : "s"}
            </Text>
            <Text style={styles.meta}>
              Last used: {formatLastUsed(usage.grounding.lastUsedAt)}
            </Text>
            <PrimaryButton
              label="Start"
              onPress={() => router.push("/grounding" as never)}
              accessibilityLabel="Start grounding tool"
            />
          </View>
        </Section>

        <InlineNotice
          variant="warning"
          title="Safety reminder"
          message="If you feel unsafe or in immediate danger, use the Safety screen or contact local emergency services."
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingBottom: 24,
  },
  centered: {
    minHeight: 140,
    alignItems: "center",
    justifyContent: "center",
  },
  statusText: {
    fontSize: 14,
    color: "#374151",
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 2,
  },
  card: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    backgroundColor: "#ffffff",
    padding: 12,
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  meta: {
    fontSize: 13,
    color: "#4b5563",
  },
});
