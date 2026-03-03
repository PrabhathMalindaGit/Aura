import { Redirect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
import { HeroHeader } from "@/src/components/HeroHeader";
import { MediaCard } from "@/src/components/MediaCard";
import { Screen } from "@/src/components/Screen";
import { TrackerTile } from "@/src/components/TrackerTile";
import { useAuth } from "@/src/state/auth";
import {
  formatLastUsed,
  getUsage,
  type CopingUsage,
} from "@/src/state/copingUsage";
import { useTokens } from "@/src/theme/tokens";

type UsageSummary = {
  breathing: CopingUsage;
  grounding: CopingUsage;
};

const DEFAULT_SUMMARY: UsageSummary = {
  breathing: { count: 0, lastUsedAt: null },
  grounding: { count: 0, lastUsedAt: null },
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export default function CopingToolsScreen() {
  const auth = useAuth();
  const router = useRouter();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
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
      <Screen
        scroll={false}
        header={
          <HeroHeader
            variant="compact"
            title="Coping tools"
            subtitle="Loading"
          />
        }
      >
        <View style={styles.centered}>
          <Text style={styles.statusText}>Loading…</Text>
        </View>
      </Screen>
    );
  }

  if (auth.status === "signedOut") {
    return <Redirect href="/(auth)/login" />;
  }

  const toolCards = [
    {
      key: "breathing",
      title: "Breathing",
      subtitle: "Guided prompts (3 min)",
      chips: [{ text: `Used ${usage.breathing.count}`, tone: "muted" as const }],
      onPress: () => router.push("/breathing"),
      icon: "coping" as const,
    },
    {
      key: "grounding",
      title: "Grounding",
      subtitle: "5–4–3–2–1 senses",
      chips: [{ text: `Used ${usage.grounding.count}`, tone: "muted" as const }],
      onPress: () => router.push("/grounding"),
      icon: "coping" as const,
    },
    {
      key: "chat",
      title: "Chat",
      subtitle: "Ask for support",
      chips: [{ text: "Assistant", tone: "info" as const }],
      onPress: () => router.push("/(tabs)/chat"),
      icon: "chat" as const,
    },
    {
      key: "safety",
      title: "Safety support",
      subtitle: "Reach your support steps",
      chips: [{ text: "Quick access", tone: "warning" as const }],
      onPress: () => router.push("/safety"),
      icon: "safety" as const,
    },
  ];

  const listHeader = (
    <View style={styles.listHeader}>
      <MediaCard
        leading={{ type: "icon", icon: "coping", tone: "accent" }}
        title="Support is ready"
        subtitle="Pick one tool. Your progress is saved locally."
        chips={[
          { text: "Offline ready", tone: "success" },
          { text: "2–5 min", tone: "muted" },
        ]}
      />

      <View style={styles.trackerGrid}>
        <View style={styles.trackerTileWrap}>
          <TrackerTile
            icon="coping"
            label="Breathing count"
            value={`${usage.breathing.count}`}
            delta="Total sessions"
            tone="accent"
            micro={{ type: "ring", progress: clamp01(usage.breathing.count / 7) }}
          />
        </View>
        <View style={styles.trackerTileWrap}>
          <TrackerTile
            icon="coping"
            label="Grounding count"
            value={`${usage.grounding.count}`}
            delta="Total sessions"
            tone="primary"
            micro={{ type: "dots", values: [usage.grounding.count, 0, 0, 0, 0, 0, 0] }}
          />
        </View>
        <View style={styles.trackerTileWrap}>
          <TrackerTile
            icon="weekly"
            label="Last breathing"
            value={formatLastUsed(usage.breathing.lastUsedAt)}
            delta="Recent usage"
            tone="muted"
            micro={{ type: "dots", values: [usage.breathing.lastUsedAt ? 1 : 0, 0, 0, 0, 0, 0, 0] }}
          />
        </View>
        <View style={styles.trackerTileWrap}>
          <TrackerTile
            icon="weekly"
            label="Last grounding"
            value={formatLastUsed(usage.grounding.lastUsedAt)}
            delta="Recent usage"
            tone="muted"
            micro={{ type: "dots", values: [usage.grounding.lastUsedAt ? 1 : 0, 0, 0, 0, 0, 0, 0] }}
          />
        </View>
      </View>

      <View style={styles.toolGrid}>
        {toolCards.map((card) => (
          <View key={card.key} style={styles.toolCardWrap}>
            <MediaCard
              variant="compact"
              leading={{ type: "icon", icon: card.icon, tone: card.key === "safety" ? "warning" : "accent" }}
              title={card.title}
              subtitle={card.subtitle}
              chips={card.chips}
              onPress={card.onPress}
            />
          </View>
        ))}
      </View>

      <Banner
        variant="warning"
        title="Safety reminder"
        message="If you feel unsafe or in immediate danger, use the Safety screen or contact local emergency services."
      />
    </View>
  );

  return (
    <Screen
      scroll={false}
      header={
        <HeroHeader
          variant="compact"
          title="Coping tools"
          subtitle="These tools work offline"
          left={<Avatar size={40} name={auth.patient?.displayName ?? auth.patient?.id ?? "Aura"} fallback="icon" iconKey="coping" />}
          rightActions={[
            {
              icon: "safety",
              tone: "warning",
              accessibilityLabel: "Open Safety support",
              onPress: () => {
                router.push("/safety");
              },
            },
            {
              icon: "home",
              tone: "muted",
              accessibilityLabel: "Back to Home",
              onPress: () => {
                router.push("/(tabs)");
              },
            },
          ]}
        />
      }
    >
      <FlatList
        data={[]}
        renderItem={() => null}
        keyExtractor={(_item, index) => `coping-${index}`}
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.container}
      />
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      paddingBottom: tokens.spacing.xxxl,
    },
    centered: {
      minHeight: 140,
      alignItems: "center",
      justifyContent: "center",
    },
    statusText: {
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      color: tokens.colors.textMuted,
    },
    listHeader: {
      gap: tokens.spacing.md,
    },
    trackerGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.md,
    },
    trackerTileWrap: {
      width: "48%",
      minWidth: 0,
    },
    toolGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.md,
    },
    toolCardWrap: {
      width: "48%",
      minWidth: 0,
    },
  });
}
