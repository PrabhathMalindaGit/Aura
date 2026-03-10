import { Redirect, useRouter } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Avatar } from "@/src/components/Avatar";
import { Card } from "@/src/components/Card";
import { EmptyState } from "@/src/components/EmptyState";
import { HeroHeader } from "@/src/components/HeroHeader";
import { MediaCard } from "@/src/components/MediaCard";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { StatusPill } from "@/src/components/StatusPill";
import { TrackerTile } from "@/src/components/TrackerTile";
import { useAuth } from "@/src/state/auth";
import { clearSelectedCheckin, getSelectedCheckin } from "@/src/state/progressSelection";
import { useTokens } from "@/src/theme/tokens";
import { painTypeLabel, regionLabel } from "@/src/utils/bodyMapLabels";
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

function formatPercent(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }
  return `${Math.round(value * 100)}%`;
}

function formatBooleanLabel(value?: boolean): string {
  if (typeof value !== "boolean") {
    return "—";
  }
  return value ? "Yes" : "No";
}

function numberOrDash(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }
  return `${Math.round(value * 10) / 10}`;
}

function medicationStatusLabel(status?: string): string {
  if (!status) {
    return "—";
  }
  if (status === "taken") {
    return "Taken";
  }
  if (status === "missed") {
    return "Missed";
  }
  if (status === "not_applicable") {
    return "Not needed";
  }
  return status;
}

export default function CheckinDetailScreen() {
  const router = useRouter();
  const auth = useAuth();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const selected = getSelectedCheckin();

  if (auth.status === "signedOut") {
    return <Redirect href="/(auth)/login" />;
  }

  if (!selected) {
    return (
      <Screen
        header={
          <HeroHeader
            variant="compact"
            title="Check-in review"
            subtitle="Recent symptom check"
            left={
              <Avatar
                size={40}
                name={auth.patient?.displayName ?? auth.patient?.id ?? "Aura"}
                fallback="icon"
                iconKey="checkin"
              />
            }
          >
            <View style={styles.headerPills}>
              <StatusPill label="No check-in selected" variant="warning" accessible={false} />
            </View>
          </HeroHeader>
        }
      >
        <Card variant="elevated" padding={tokens.spacing.lg} style={styles.storyCard}>
          <Text style={styles.storyEyebrow}>Check-in review</Text>
          <Text style={styles.storyTitle}>Choose a check-in from Progress first</Text>
          <Text style={styles.storyBody}>
            This screen is for reviewing one completed check-in in more detail. Go back to Progress
            and open a saved entry when you’re ready.
          </Text>
        </Card>
        <EmptyState
          illustrationKey="progress"
          title="No check-in selected"
          description="Open Progress and choose a check-in to review the details here."
          ctaLabel="Back to Progress"
          onCtaPress={() => {
            router.replace("/progress" as never);
          }}
        />
      </Screen>
    );
  }

  const exercises = formatPercent(selected.adherence?.exercises);
  const medicationTaken = formatBooleanLabel(selected.adherence?.medication);
  const symptomFlags = selected.symptoms?.flags ?? [];
  const bodyRegions = selected.bodyMap?.regions ?? [];
  const displayDate = detailDateLabel(selected.date, selected.createdAt);
  const supportTone =
    selected.support?.needsUrgentHelp || selected.support?.feelsSafe === false
      ? "warning"
      : selected.support?.wantsFollowUp || selected.support?.wantsExtraSupport
        ? "info"
        : "success";
  const supportLabel =
    selected.support?.needsUrgentHelp || selected.support?.feelsSafe === false
      ? "Needs support"
      : selected.support?.wantsFollowUp || selected.support?.wantsExtraSupport
        ? "Follow-up requested"
        : "Routine check-in";

  return (
    <Screen
      header={
        <HeroHeader
          variant="compact"
          title="Check-in review"
          subtitle="Recent symptom check"
          left={
            <Avatar
              size={40}
              name={auth.patient?.displayName ?? auth.patient?.id ?? "Aura"}
              fallback="icon"
              iconKey="checkin"
            />
          }
          rightActions={[
            {
              icon: "progress",
              tone: "accent",
              accessibilityLabel: "Back to Progress",
              onPress: () => {
                clearSelectedCheckin();
                router.replace("/progress" as never);
              },
            },
          ]}
        >
          <View style={styles.headerPills}>
            <StatusPill label={displayDate} variant="neutral" accessible={false} />
            <StatusPill label={supportLabel} variant={supportTone} accessible={false} />
            <StatusPill
              label={`${bodyRegions.length} area${bodyRegions.length === 1 ? "" : "s"}`}
              variant={bodyRegions.length > 0 ? "info" : "neutral"}
              accessible={false}
            />
          </View>
        </HeroHeader>
      }
    >
      <Card variant="elevated" padding={tokens.spacing.lg} style={styles.storyCard}>
        <View style={styles.storyHeader}>
          <View style={styles.storyTitleWrap}>
            <Text style={styles.storyEyebrow}>Summary</Text>
            <Text style={styles.storyTitle}>{supportLabel}</Text>
          </View>
          <StatusPill label={`Pain ${selected.pain}/10`} variant={selected.pain >= 7 ? "warning" : "info"} accessible={false} />
        </View>
        <Text style={styles.storyBody}>
          Review how this check-in looked on that day, then use the notes, body areas, and support
          details below for deeper context.
        </Text>
        <View style={styles.storyMetricRow}>
          <View style={styles.storyMetric}>
            <Text style={styles.storyMetricValue}>{selected.pain}/10</Text>
            <Text style={styles.storyMetricLabel}>Pain</Text>
          </View>
          <View style={styles.storyMetric}>
            <Text style={styles.storyMetricValue}>{selected.mood}/5</Text>
            <Text style={styles.storyMetricLabel}>Mood</Text>
          </View>
          <View style={styles.storyMetric}>
            <Text style={styles.storyMetricValue}>{symptomFlags.length}</Text>
            <Text style={styles.storyMetricLabel}>Extra symptoms</Text>
          </View>
        </View>
      </Card>

      <Card variant="outlined" padding={tokens.spacing.md} style={styles.sectionIntro}>
        <Text style={styles.sectionEyebrow}>Current snapshot</Text>
        <Text style={styles.sectionTitle}>What this check-in captured</Text>
        <Text style={styles.sectionBody}>
          Start with the headline signals below, then use the support and note details for the full
          picture.
        </Text>
      </Card>

      <View style={styles.metricGrid}>
        <View style={styles.metricTileWrap}>
          <TrackerTile
            icon="checkin"
            label="Exercises"
            value={exercises}
            delta="Adherence"
            tone="accent"
            micro={{ type: "ring", progress: typeof selected.adherence?.exercises === "number" ? selected.adherence.exercises : 0 }}
          />
        </View>
        <View style={styles.metricTileWrap}>
          <TrackerTile
            icon="meds"
            label="Medication"
            value={medicationTaken}
            delta="Taken"
            tone="accent"
            micro={{ type: "dots", values: [selected.adherence?.medication ? 1 : 0, 0.4, 0.4, 0.4] }}
          />
        </View>
        <View style={styles.metricTileWrap}>
          <TrackerTile
            icon="sleep"
            label="Sleep"
            value={numberOrDash(selected.sleep?.hours)}
            delta="Hours"
            tone="muted"
            micro={{ type: "dots", values: [selected.sleep?.hours ?? 0, 0, 0, 0] }}
          />
        </View>
        <View style={styles.metricTileWrap}>
          <TrackerTile
            icon="hydration"
            label="Energy"
            value={numberOrDash(selected.dailySignals?.energyLevel)}
            delta="Daily signal"
            tone="success"
            micro={{ type: "dots", values: [selected.dailySignals?.energyLevel ?? 0, 0, 0, 0] }}
          />
        </View>
      </View>

      <Card variant="outlined" padding={tokens.spacing.md} style={styles.sectionIntro}>
        <Text style={styles.sectionEyebrow}>Support details</Text>
        <Text style={styles.sectionTitle}>Symptoms, support, and notes</Text>
        <Text style={styles.sectionBody}>
          These supporting details help explain what the day looked like beyond the main scores.
        </Text>
      </Card>

      <MediaCard
        leading={{ type: "icon", icon: "warning", tone: symptomFlags.length > 0 ? "warning" : "muted" }}
        title="Symptom flags"
        subtitle={
          symptomFlags.length > 0
            ? symptomFlags.map((flag) => flag.replace(/_/g, " ")).join(" · ")
            : "No extra symptom flags were recorded."
        }
        chips={[
          { text: `${symptomFlags.length} flag${symptomFlags.length === 1 ? "" : "s"}`, tone: symptomFlags.length > 0 ? "warning" : "muted" },
        ]}
      />

      <MediaCard
        leading={{ type: "icon", icon: "safety", tone: supportTone === "warning" ? "warning" : "accent" }}
        title="Support status"
        subtitle={
          [
            selected.support?.wantsFollowUp ? "Follow-up requested" : null,
            selected.support?.wantsExtraSupport ? "Extra support requested" : null,
            selected.support?.feelsSafe === false ? "Felt unsafe" : null,
            selected.support?.needsUrgentHelp ? "Urgent help requested" : null,
          ]
            .filter(Boolean)
            .join(" · ") || "No additional support requests were recorded."
        }
        chips={[
          { text: supportLabel, tone: supportTone === "warning" ? "warning" : supportTone === "info" ? "info" : "success" },
          ...(typeof selected.support?.stressLevel === "number"
            ? [{ text: `Stress ${selected.support.stressLevel}/5`, tone: "muted" as const }]
            : []),
        ]}
      />

      {selected.notes ? (
        <MediaCard
          leading={{ type: "icon", icon: "chat", tone: "muted" }}
          title="Patient note"
          subtitle={selected.notes}
        />
      ) : null}

      {bodyRegions.length > 0 ? (
        <Card variant="outlined" padding={tokens.spacing.lg} style={styles.bodyAreaCard}>
          <Text style={styles.sectionEyebrow}>Body areas</Text>
          <Text style={styles.sectionTitle}>Pain and symptom areas</Text>
          <View style={styles.bodyAreaList}>
            {bodyRegions.map((region) => (
              <View key={`${region.region}-${region.type}-${region.intensity}`} style={styles.bodyAreaItem}>
                <Text style={styles.bodyAreaTitle}>{regionLabel(region.region)}</Text>
                <Text style={styles.bodyAreaMeta}>
                  {`${region.intensity}/10 · ${painTypeLabel(region.type)}`}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <View style={styles.footerAction}>
        <Text style={styles.footerTitle}>Return to your progress history when you’re ready</Text>
        <Text style={styles.footerBody}>
          Use Progress to compare this check-in with the rest of your recent recovery trend.
        </Text>
        <PrimaryButton
          label="Back to Progress"
          onPress={() => {
            clearSelectedCheckin();
            router.back();
          }}
        />
      </View>
    </Screen>
  );
}

const createStyles = (tokens: ReturnType<typeof useTokens>) =>
  StyleSheet.create({
    headerPills: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
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
    metricGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.md,
    },
    metricTileWrap: {
      width: "48%",
      minWidth: 0,
    },
    bodyAreaCard: {
      gap: tokens.spacing.sm,
    },
    bodyAreaList: {
      gap: tokens.spacing.sm,
    },
    bodyAreaItem: {
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surfaceElevated,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      gap: tokens.spacing.xs,
    },
    bodyAreaTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    bodyAreaMeta: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    footerAction: {
      gap: tokens.spacing.sm,
    },
    footerTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    footerBody: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
  });
