import { Redirect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
import { Card } from "@/src/components/Card";
import { HeroHeader } from "@/src/components/HeroHeader";
import { MediaCard } from "@/src/components/MediaCard";
import { Screen } from "@/src/components/Screen";
import { StatusPill } from "@/src/components/StatusPill";
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
      <Card variant="elevated" padding={tokens.spacing.lg} style={styles.storyCard}>
        <View style={styles.storyHeader}>
          <View style={styles.storyTitleWrap}>
            <Text style={styles.storyEyebrow}>Support now</Text>
            <Text style={styles.storyTitle}>Pick one calming step when you need a reset</Text>
          </View>
          <StatusPill label="Offline ready" variant="success" accessible={false} />
        </View>
        <Text style={styles.storyBody}>
          These tools are here to help you steady your breathing, ground yourself, or move into a
          support step without searching through the app.
        </Text>
        <View style={styles.storyMetricRow}>
          <View style={styles.storyMetric}>
            <Text style={styles.storyMetricValue}>{usage.breathing.count}</Text>
            <Text style={styles.storyMetricLabel}>Breathing sessions</Text>
          </View>
          <View style={styles.storyMetric}>
            <Text style={styles.storyMetricValue}>{usage.grounding.count}</Text>
            <Text style={styles.storyMetricLabel}>Grounding sessions</Text>
          </View>
          <View style={styles.storyMetric}>
            <Text style={styles.storyMetricValue}>
              {usage.breathing.lastUsedAt || usage.grounding.lastUsedAt ? "Used recently" : "Ready"}
            </Text>
            <Text style={styles.storyMetricLabel}>Support status</Text>
          </View>
        </View>
      </Card>

      <Card variant="outlined" padding={tokens.spacing.md} style={styles.sectionIntro}>
        <Text style={styles.sectionEyebrow}>Quick support</Text>
        <Text style={styles.sectionTitle}>Choose the next calming step</Text>
        <Text style={styles.sectionBody}>
          Start with a short breathing or grounding tool, then move to chat or the Safety screen if
          you need more support.
        </Text>
      </Card>

      <MediaCard
        leading={{ type: "icon", icon: "coping", tone: "accent" }}
        title="Support is ready"
        subtitle="Pick one tool. Your progress is saved locally."
        chips={[
          { text: "Offline ready", tone: "success" },
          { text: "2–5 min", tone: "muted" },
        ]}
      />

      <Card variant="outlined" padding={tokens.spacing.md} style={styles.sectionIntro}>
        <Text style={styles.sectionEyebrow}>Usage</Text>
        <Text style={styles.sectionTitle}>Recent support activity</Text>
        <Text style={styles.sectionBody}>
          Use these quick summaries to see what you’ve leaned on most recently, then continue with
          the tool that feels helpful now.
        </Text>
      </Card>

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

      <Card variant="outlined" padding={tokens.spacing.md} style={styles.sectionIntro}>
        <Text style={styles.sectionEyebrow}>Tools</Text>
        <Text style={styles.sectionTitle}>Open the right support path</Text>
        <Text style={styles.sectionBody}>
          Each option below supports a different kind of reset, from a short breathing pause to a
          faster route into Safety support.
        </Text>
      </Card>

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
        >
          <View style={styles.headerPills}>
            <StatusPill label="Offline ready" variant="success" accessible={false} />
            <StatusPill
              label={`${usage.breathing.count + usage.grounding.count} uses`}
              variant="info"
              accessible={false}
            />
            <StatusPill label="Support tools" variant="neutral" accessible={false} />
          </View>
        </HeroHeader>
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
    headerPills: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
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
    storyCard: {
      gap: tokens.spacing.md,
    },
    storyHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    storyTitleWrap: {
      flex: 1,
      gap: tokens.spacing.xs,
    },
    storyEyebrow: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    storyTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    storyBody: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    storyMetricRow: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
    },
    storyMetric: {
      flex: 1,
      minWidth: 0,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surfaceElevated,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      gap: tokens.spacing.xs,
    },
    storyMetricValue: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    storyMetricLabel: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    sectionIntro: {
      gap: tokens.spacing.xs,
    },
    sectionEyebrow: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    sectionTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    sectionBody: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
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
