import { Redirect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
import { Card } from "@/src/components/Card";
import { DomainIcon } from "@/src/components/IconSet";
import { HeroHeader } from "@/src/components/HeroHeader";
import { MediaCard } from "@/src/components/MediaCard";
import { Row } from "@/src/components/Row";
import { Screen } from "@/src/components/Screen";
import { Section } from "@/src/components/Section";
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

  const mostRecentUsageAt = [usage.breathing.lastUsedAt, usage.grounding.lastUsedAt]
    .filter((value): value is number => typeof value === "number")
    .sort((left, right) => left - right)
    .at(-1) ?? null;

  const calmingTools = [
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
        </View>
        <Text style={styles.storyStatusText}>
          {mostRecentUsageAt
            ? `Last support used ${formatLastUsed(mostRecentUsageAt)}.`
            : "Your coping tools are ready whenever you need them."}
        </Text>
      </Card>

      <Section
        title="Recent support"
        subtitle="See what you have used most recently before choosing the next support step."
        card
      >
        <View style={styles.metricStack}>
          <View style={styles.metricRow}>
            <View style={styles.metricCell}>
              <TrackerTile
                variant="compact"
                icon="coping"
                label="Breathing count"
                value={`${usage.breathing.count}`}
                delta="Total sessions"
                tone="accent"
                micro={{ type: "ring", progress: clamp01(usage.breathing.count / 7) }}
              />
            </View>
            <View style={styles.metricCell}>
              <TrackerTile
                variant="compact"
                icon="coping"
                label="Grounding count"
                value={`${usage.grounding.count}`}
                delta="Total sessions"
                tone="primary"
                micro={{ type: "dots", values: [usage.grounding.count, 0, 0, 0, 0, 0, 0] }}
              />
            </View>
          </View>
          <View style={styles.metricRow}>
            <View style={styles.metricCell}>
              <TrackerTile
                variant="compact"
                icon="weekly"
                label="Last breathing"
                value={formatLastUsed(usage.breathing.lastUsedAt)}
                delta="Recent usage"
                tone="muted"
                micro={{ type: "dots", values: [usage.breathing.lastUsedAt ? 1 : 0, 0, 0, 0, 0, 0, 0] }}
              />
            </View>
            <View style={styles.metricCell}>
              <TrackerTile
                variant="compact"
                icon="weekly"
                label="Last grounding"
                value={formatLastUsed(usage.grounding.lastUsedAt)}
                delta="Recent usage"
                tone="muted"
                micro={{ type: "dots", values: [usage.grounding.lastUsedAt ? 1 : 0, 0, 0, 0, 0, 0, 0] }}
              />
            </View>
          </View>
        </View>
      </Section>

      <Section
        title="Calming tools"
        subtitle="Start with one short reset, then move into a support option if you need more help."
        right={<StatusPill label="2 tools" variant="neutral" accessible={false} />}
        card
      >
        <View style={styles.toolRow}>
          {calmingTools.map((card) => (
            <View key={card.key} style={styles.toolCell}>
              <MediaCard
                variant="compact"
                leading={{ type: "icon", icon: card.icon, tone: "accent" }}
                title={card.title}
                subtitle={card.subtitle}
                chips={card.chips}
                onPress={card.onPress}
              />
            </View>
          ))}
        </View>
      </Section>

      <Section
        title="Support options"
        subtitle="Use these when you want a direct support path instead of another calming exercise."
        card
      >
        <View style={styles.supportList}>
          <Row
            title="Message care team"
            subtitle="Ask for support in Messages."
            leftIcon={<DomainIcon icon="chat" tone="accent" accessibilityLabel="Message care team icon" />}
            onPress={() => {
              router.push("/(tabs)/chat");
            }}
          />
          <Row
            title="Safety support"
            subtitle="Open guided support steps and quick next actions."
            leftIcon={<DomainIcon icon="safety" tone="warning" accessibilityLabel="Safety support icon" />}
            onPress={() => {
              router.push("/safety");
            }}
          />
        </View>
      </Section>

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
      gap: tokens.spacing.sm,
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
    storyStatusText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    metricStack: {
      gap: tokens.spacing.sm,
    },
    metricRow: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
    },
    metricCell: {
      flex: 1,
      minWidth: 0,
    },
    toolRow: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
    },
    toolCell: {
      flex: 1,
      minWidth: 0,
    },
    supportList: {
      gap: tokens.spacing.xs,
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
  });
}
