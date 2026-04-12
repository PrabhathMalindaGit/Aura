import { Redirect, useRouter, type Href } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { isApiError, type ApiError } from "@/src/api/client";
import {
  getCaregiverSummary,
  getCaregiverWeeklyReport,
  type CaregiverSummary,
} from "@/src/api/caregiver";
import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
import { HeroHeader } from "@/src/components/HeroHeader";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { MediaCard } from "@/src/components/MediaCard";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { StatusPill } from "@/src/components/StatusPill";
import { TrackerTile } from "@/src/components/TrackerTile";
import { useCaregiverSession } from "@/src/state/caregiverSession";
import {
  getCachedCaregiverData,
  getCachedCaregiverWeeklyReport,
  setCachedCaregiverSummary,
  setCachedCaregiverWeeklyReport,
} from "@/src/state/caregiverCache";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { useLastRefreshed } from "@/src/state/refresh";
import { useTokens } from "@/src/theme/tokens";
import { startOfWeekMondayISO } from "@/src/utils/date";
import { normalizeUnknownError } from "@/src/utils/errors";

type NoticeState = {
  variant: "info" | "warning" | "error";
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

function toFriendlyError(error: unknown, title: string): {
  title: string;
  message: string;
  kind: "offline" | "network" | "server" | "validation" | "unknown";
  retryable: boolean;
} {
  let appError: ApiError;
  if (isApiError(error)) {
    appError = error;
  } else {
    const fallback = normalizeUnknownError(error);
    appError = {
      title: fallback.title,
      message: fallback.message,
      kind: fallback.kind,
      retryable: fallback.retryable,
      detail: fallback.detail,
    };
  }

  if (appError.kind === "offline") {
    return {
      title,
      message: "You’re offline. Nothing was loaded.",
      kind: "offline",
      retryable: true,
    };
  }
  if (appError.kind === "network") {
    return {
      title,
      message: "Couldn’t reach the service. Please try again.",
      kind: "network",
      retryable: true,
    };
  }
  if (appError.kind === "server") {
    return {
      title,
      message: "Service unavailable. Please try again shortly.",
      kind: "server",
      retryable: true,
    };
  }
  if (appError.kind === "validation") {
    return {
      title,
      message: appError.message || "Please review and try again.",
      kind: "validation",
      retryable: false,
    };
  }
  return {
    title,
    message: appError.message || "Something went wrong. Please try again.",
    kind: "unknown",
    retryable: true,
  };
}

function isCaregiverAccessError(error: unknown): boolean {
  return isApiError(error) && (error.status === 401 || error.status === 403);
}

function formatPercent(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }
  return `${Math.round(value * 100)}%`;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function mapNoticeVariant(
  variant: NoticeState["variant"],
): "info" | "warning" | "danger" {
  if (variant === "error") {
    return "danger";
  }
  return variant;
}

export default function CaregiverHomeScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const caregiverSession = useCaregiverSession();
  const isOffline = useIsOffline();
  const caregiverRefresh = useLastRefreshed("caregiver");
  const caregiverLoadError = useLastError("caregiverLoad");

  const [summary, setSummary] = useState<CaregiverSummary | null>(null);
  const [weeklyHeadline, setWeeklyHeadline] = useState<string>("");
  const [weeklyHighlights, setWeeklyHighlights] = useState<string[]>([]);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showDevDiagnostics, setShowDevDiagnostics] = useState(false);

  const tzOffsetMinutes = -new Date().getTimezoneOffset();
  const thisWeekStart = useMemo(
    () => startOfWeekMondayISO(tzOffsetMinutes),
    [tzOffsetMinutes]
  );
  const patientId = caregiverSession.patient?.id ?? summary?.patientId ?? "";

  const loadCaregiverData = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!caregiverSession.token) {
        setIsLoading(false);
        return;
      }

      if (mode === "refresh") {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setNotice(null);

      if (isOffline) {
        const cached = patientId ? await getCachedCaregiverData(patientId) : null;
        if (cached?.summary) {
          setSummary(cached.summary);
          const cachedWeekly = getCachedCaregiverWeeklyReport(cached, "this");
          setWeeklyHeadline(cachedWeekly?.summary.headline ?? "");
          setWeeklyHighlights(cachedWeekly?.summary.highlights?.slice(0, 2) ?? []);
          setNotice({
            variant: "warning",
            title: "Offline",
            message: "Offline — showing saved info.",
          });
        } else {
          setSummary(null);
          setWeeklyHeadline("");
          setWeeklyHighlights([]);
          setNotice({
            variant: "warning",
            title: "Offline",
            message: "Offline — no saved caregiver data is available yet.",
          });
        }
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      try {
        const [liveSummary, weeklyReport] = await Promise.all([
          getCaregiverSummary(caregiverSession.token),
          getCaregiverWeeklyReport(caregiverSession.token, {
            weekStart: thisWeekStart,
            tzOffsetMinutes,
          }),
        ]);

        setSummary(liveSummary);
        setWeeklyHeadline(weeklyReport.summary.headline);
        setWeeklyHighlights(weeklyReport.summary.highlights.slice(0, 2));

        await Promise.all([
          setCachedCaregiverSummary(liveSummary.patientId, liveSummary),
          setCachedCaregiverWeeklyReport(liveSummary.patientId, "this", weeklyReport),
          caregiverRefresh.refreshLocal(),
          caregiverLoadError.clear(),
        ]);
      } catch (error) {
        if (isCaregiverAccessError(error)) {
          await caregiverSession.signOut();
          router.replace("/caregiver-login" as Href);
          setIsLoading(false);
          setIsRefreshing(false);
          return;
        }

        const friendly = toFriendlyError(error, "Couldn’t load caregiver view");
        await caregiverLoadError.setLocalError({
          title: friendly.title,
          message: friendly.message,
          kind: friendly.kind,
          retryable: friendly.retryable,
        });

        const cached = patientId ? await getCachedCaregiverData(patientId) : null;
        if (cached?.summary) {
          setSummary(cached.summary);
          const cachedWeekly = getCachedCaregiverWeeklyReport(cached, "this");
          setWeeklyHeadline(cachedWeekly?.summary.headline ?? "");
          setWeeklyHighlights(cachedWeekly?.summary.highlights?.slice(0, 2) ?? []);
          setNotice({
            variant: "warning",
            title: friendly.title,
            message: "Showing saved info. Live refresh failed.",
            actionLabel: friendly.retryable ? "Retry" : undefined,
            onAction: friendly.retryable
              ? () => {
                  void loadCaregiverData("refresh");
                }
              : undefined,
          });
        } else {
          setSummary(null);
          setWeeklyHeadline("");
          setWeeklyHighlights([]);
          setNotice({
            variant: "error",
            title: friendly.title,
            message: friendly.message,
            actionLabel: friendly.retryable ? "Retry" : undefined,
            onAction: friendly.retryable
              ? () => {
                  void loadCaregiverData("refresh");
                }
              : undefined,
          });
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [
      caregiverLoadError,
      caregiverRefresh,
      caregiverSession.token,
      isOffline,
      patientId,
      thisWeekStart,
      tzOffsetMinutes,
    ]
  );

  useFocusEffect(
    useCallback(() => {
      if (caregiverSession.status !== "signedIn") {
        return;
      }
      void loadCaregiverData("initial");
      return undefined;
    }, [caregiverSession.status, loadCaregiverData])
  );

  useEffect(() => {
    if (caregiverSession.status !== "signedIn") {
      return;
    }
    void loadCaregiverData("initial");
  }, [caregiverSession.status, loadCaregiverData]);

  const handleSignOut = useCallback(() => {
    void caregiverSession.signOut().then(() => {
      router.replace("/caregiver-login" as Href);
    });
  }, [caregiverSession, router]);

  const patientName =
    summary?.patient.displayName ?? caregiverSession.patient?.displayName ?? "Patient";
  const patientIdentifier = summary?.patient.id ?? caregiverSession.patient?.id ?? "—";
  const openAlertsCount = summary?.safety.openAlertsCount ?? 0;
  const highRiskAlertsCount = summary?.safety.highRiskAlerts14d ?? 0;
  const dueNowCount = summary?.assessments.dueNowCount ?? 0;
  const careState = summary?.careState;

  const lastCheckin = summary?.lastCheckin;
  const adherencePctNumber =
    typeof lastCheckin?.adherence?.exercises === "number"
      ? Math.round(lastCheckin.adherence.exercises * 100)
      : null;
  const medsTaken = lastCheckin?.medsToday?.taken;
  const medsScheduled = lastCheckin?.medsToday?.scheduled;
  const medsProgress =
    typeof medsTaken === "number" && typeof medsScheduled === "number" && medsScheduled > 0
      ? clamp01(medsTaken / medsScheduled)
      : 0;

  const weeklyPreviewChips = weeklyHighlights
    .filter((item) => item.trim().length > 0)
    .slice(0, 2)
    .map((item) => ({ text: item, tone: "muted" as const }));

  const supportOverview =
    careState?.isHistorical
      ? careState.message
      : openAlertsCount > 0
      ? `There ${openAlertsCount === 1 ? "is" : "are"} ${openAlertsCount} open ${
          openAlertsCount === 1 ? "alert" : "alerts"
        } for ${patientName}. Start with safety and weekly updates.`
      : weeklyHeadline
        ? weeklyHeadline
        : `You’re following ${patientName}'s recovery through recent check-ins, weekly trends, and safety context.`;

  const supportPrompt =
    careState?.isHistorical
      ? "Review the care status and support guidance before relying on older summaries."
      : openAlertsCount > 0
      ? "Review the weekly summary and contact the clinic if something feels off."
      : lastCheckin
        ? "Use the latest check-in and weekly summary to notice what changed and what still needs support."
        : "Check the weekly summary when it becomes available and stay ready to help with routines or reminders.";

  const header = (
    <HeroHeader
      variant="compact"
      title="Caregiver"
      subtitle={patientName ? `Supporting ${patientName}` : "Read-only caregiver view"}
      left={
        <Avatar
          size={40}
          name={patientName}
          fallback="initials"
          ring={isOffline ? "attention" : "none"}
        />
      }
      rightActions={[
        {
          icon: "weekly",
          tone: "accent",
          accessibilityLabel: "Open weekly report",
          onPress: () => router.push("/caregiver-weekly-report" as Href),
        },
        {
          icon: "settings",
          tone: "muted",
          accessibilityLabel: "Sign out caregiver",
          onPress: handleSignOut,
        },
        {
          icon: "safety",
          tone: "warning",
          accessibilityLabel: "Open Safety support",
          onPress: () => router.push("/safety" as Href),
        },
      ]}
    >
      <View style={styles.headerMetaRow}>
        <StatusPill label="Read-only" variant="neutral" />
        <StatusPill
          label={openAlertsCount > 0 ? `${openAlertsCount} alert${openAlertsCount === 1 ? "" : "s"}` : "No open alerts"}
          variant={openAlertsCount > 0 ? "warning" : "success"}
        />
        <StatusPill label={isOffline ? "Offline" : "Weekly summary"} variant={isOffline ? "warning" : "info"} />
      </View>

      <View style={styles.headerStoryCard}>
        <Text style={styles.headerStoryTitle}>Support overview</Text>
        <Text style={styles.headerStoryText}>{supportOverview}</Text>
        <Text style={styles.headerStoryNote}>{supportPrompt}</Text>
      </View>
    </HeroHeader>
  );

  if (caregiverSession.status === "loading") {
    return (
      <Screen scroll={false} header={header}>
        <View style={styles.centered}>
          <ActivityIndicator size="small" />
        </View>
      </Screen>
    );
  }

  if (caregiverSession.status === "signedOut") {
    return <Redirect href={"/caregiver-login" as Href} />;
  }

  return (
    <Screen scroll={false} header={header}>
      <FlatList
        data={[]}
        renderItem={() => null}
        keyExtractor={(_, index) => String(index)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.content}>
            {__DEV__ ? (
              <View style={styles.devCard}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Toggle diagnostics"
                  onPress={() => setShowDevDiagnostics((value) => !value)}
                  style={({ pressed }) => [
                    styles.devRow,
                    pressed ? styles.devRowPressed : null,
                  ]}
                >
                  <Text style={styles.devTitle}>Diagnostics (dev)</Text>
                  <StatusPill
                    label={showDevDiagnostics ? "Open" : "Closed"}
                    variant="neutral"
                    accessible={false}
                  />
                </Pressable>
                {showDevDiagnostics ? (
                  <View style={styles.devDetails}>
                    <LastRefreshed value={caregiverRefresh.label} />
                    <LastFailedAttempt
                      value={caregiverLoadError.label}
                      title={caregiverLoadError.lastError?.title}
                      message={caregiverLoadError.lastError?.message}
                      onClear={caregiverLoadError.lastError ? caregiverLoadError.clear : undefined}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}

            {notice ? (
              <Banner
                variant={mapNoticeVariant(notice.variant)}
                title={notice.title}
                message={notice.message}
                actionLabel={notice.actionLabel}
                onAction={notice.onAction}
              />
            ) : null}

            <View style={styles.sectionIntro}>
              <Text style={styles.sectionTitle}>Patient snapshot</Text>
              <Text style={styles.sectionHelper}>
                Follow the patient&apos;s latest signals here, then move into the weekly summary or
                safety context when you need more detail.
              </Text>
            </View>

            <MediaCard
              leading={{
                type: "avatar",
                name: patientName,
                ring: isOffline ? "attention" : "none",
              }}
              title={patientName}
              subtitle={`ID: ${patientIdentifier}`}
              chips={[
                { text: "Read-only", tone: "muted" },
                ...(summary?.access?.relationship
                  ? [{ text: summary.access.relationship, tone: "muted" as const }]
                  : []),
                ...(summary?.access?.caregiverName
                  ? [{ text: summary.access.caregiverName, tone: "muted" as const }]
                  : []),
                {
                  text: lastCheckin ? "Latest check-in available" : "Waiting for first check-in",
                  tone: "muted",
                },
              ]}
              statusPill={{
                text: careState?.label ?? (openAlertsCount > 0 ? "Needs review" : "Steady"),
                tone:
                  careState?.isHistorical
                    ? "neutral"
                    : openAlertsCount > 0
                      ? "warning"
                      : "success",
              }}
            />

            {careState ? (
              <View style={styles.infoCard}>
                <View style={styles.infoCardHeader}>
                  <Text style={styles.infoCardTitle}>Care status</Text>
                  <StatusPill
                    label={careState.label}
                    variant={careState.isHistorical ? "neutral" : "info"}
                  />
                </View>
                <Text style={styles.infoCardText}>{careState.message}</Text>
                {careState.programSummary ? (
                  <Text style={styles.infoCardNote}>{careState.programSummary}</Text>
                ) : null}
                <View style={styles.infoChipRow}>
                  {careState.dischargedAt ? (
                    <StatusPill
                      label={`Updated ${new Intl.DateTimeFormat(undefined, {
                        month: "short",
                        day: "numeric",
                      }).format(new Date(careState.dischargedAt))}`}
                      variant="neutral"
                    />
                  ) : null}
                  <StatusPill
                    label={careState.isHistorical ? "Historical view" : "Current view"}
                    variant={careState.isHistorical ? "neutral" : "success"}
                  />
                </View>
              </View>
            ) : null}

            <View style={styles.sectionIntro}>
              <Text style={styles.sectionTitle}>This week</Text>
              <Text style={styles.sectionHelper}>
                {careState?.isHistorical
                  ? "These read-only signals keep the recent recovery picture visible without implying ongoing clinician monitoring."
                  : "These signals help you notice how recovery is going before you look at the fuller weekly summary."}
              </Text>
            </View>

            <View style={styles.trackerGrid}>
              <View style={styles.trackerTileWrap}>
                <TrackerTile
                  icon="checkin"
                  label="Pain"
                  value={lastCheckin ? `${lastCheckin.pain}/10` : "—"}
                  delta="Latest check-in"
                  tone="warning"
                  micro={{ type: "dots", values: [0.2, 0.4, 0.6, 0.8, 0.7, 0.5, 0.6] }}
                />
              </View>
              <View style={styles.trackerTileWrap}>
                <TrackerTile
                  icon="insights"
                  label="Mood"
                  value={lastCheckin ? `${lastCheckin.mood}/5` : "—"}
                  delta="Latest check-in"
                  tone="success"
                  micro={{ type: "dots", values: [0.5, 0.6, 0.7, 0.65, 0.75, 0.7, 0.72] }}
                />
              </View>
              <View style={styles.trackerTileWrap}>
                <TrackerTile
                  icon="exercise"
                  label="Adherence"
                  value={adherencePctNumber === null ? "—" : `${adherencePctNumber}%`}
                  delta="Exercise"
                  tone="accent"
                  micro={{ type: "ring", progress: clamp01((adherencePctNumber ?? 0) / 100) }}
                />
              </View>
              <View style={styles.trackerTileWrap}>
                <TrackerTile
                  icon="meds"
                  label="Meds"
                  value={
                    typeof medsTaken === "number" && typeof medsScheduled === "number"
                      ? `${medsTaken}/${medsScheduled}`
                      : "—"
                  }
                  delta="Today"
                  tone="primary"
                  micro={{ type: "ring", progress: medsProgress }}
                />
              </View>
            </View>

            <MediaCard
              variant="emphasis"
              leading={{ type: "icon", icon: "weekly", tone: "accent" }}
              title={weeklyHeadline || "Weekly summary"}
              subtitle={weeklyHighlights[0] ?? "Open the weekly summary when you want a clearer view of the patient’s recent recovery trends."}
              chips={weeklyPreviewChips}
              statusPill={{
                text: weeklyHeadline ? "This week" : "Waiting for summary",
                tone: weeklyHeadline ? "info" : "neutral",
              }}
              onPress={() => router.push("/caregiver-weekly-report" as Href)}
            />

            <View style={styles.twoColumnRow}>
              <View style={styles.twoColumnCell}>
                <MediaCard
                  variant="compact"
                  leading={{ type: "icon", icon: "exercise", tone: "primary" }}
                  title="Plan status"
                  subtitle={
                    summary?.plan?.statusLabel
                      ? `${summary.plan.statusLabel}${summary.plan.phaseTitle ? ` · ${summary.plan.phaseTitle}` : ""}`
                      : "No plan summary available"
                  }
                  chips={[
                    {
                      text:
                        typeof summary?.plan?.itemCount === "number"
                          ? `${summary.plan.itemCount} item${summary.plan.itemCount === 1 ? "" : "s"}`
                          : "Read-only",
                      tone: "muted",
                    },
                    ...(dueNowCount > 0
                      ? [{ text: `${dueNowCount} assessment${dueNowCount === 1 ? "" : "s"} due`, tone: "muted" as const }]
                      : []),
                  ]}
                />
              </View>

              <View style={styles.twoColumnCell}>
                <MediaCard
                  variant="compact"
                  leading={{ type: "icon", icon: "appointments", tone: "primary" }}
                  title="Next appointment"
                  subtitle={
                    summary?.nextAppointment?.startsAt
                      ? new Intl.DateTimeFormat(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        }).format(new Date(summary.nextAppointment.startsAt))
                      : "No upcoming appointment"
                  }
                  chips={[
                    {
                      text: summary?.nextAppointment?.modality === "video" ? "Video" : "Read-only",
                      tone: "muted",
                    },
                  ]}
                />
              </View>
            </View>

            <MediaCard
              leading={{ type: "icon", icon: "safety", tone: "warning" }}
              title="Safety follow-up"
              subtitle={`Open alerts: ${openAlertsCount} · High-risk (14d): ${highRiskAlertsCount}`}
              chips={[{ text: "Contact clinic if concerned", tone: "muted" }]}
              statusPill={{
                text: openAlertsCount > 0 ? "Needs attention" : "Stable",
                tone: openAlertsCount > 0 ? "warning" : "success",
              }}
            />

            <View style={styles.infoCard}>
              <View style={styles.infoCardHeader}>
                <Text style={styles.infoCardTitle}>Support guidance</Text>
                <StatusPill label="Read-only" variant="neutral" />
              </View>
              <Text style={styles.infoCardText}>
                {summary?.supportGuidance.clinicContact ??
                  "If something feels off or recovery changes, contact the clinic directly."}
              </Text>
              <Text style={styles.infoCardNote}>
                {summary?.supportGuidance.monitoringNote ??
                  "Caregiver access is read-only and does not replace clinician guidance."}
              </Text>
              <Text style={styles.infoCardNote}>
                {summary?.supportGuidance.urgentHelp ??
                  "If the patient may need urgent help, contact local emergency services right away."}
              </Text>
            </View>

            <View style={styles.actionsCard}>
              <Text style={styles.actionsTitle}>Do next</Text>
              <Text style={styles.actionsHelper}>
                {careState?.isHistorical
                  ? "Refresh this read-only historical view when you need the latest summary, or sign out when you’re done."
                  : "Refresh this read-only view when you need the latest caregiver summary, or sign out when you’re done."}
              </Text>
              <View style={styles.actionsRow}>
                <View style={styles.actionButtonWrap}>
                  <PrimaryButton
                    label={isRefreshing ? "Refreshing…" : "Refresh summary"}
                    disabled={isRefreshing || isOffline}
                    onPress={() => {
                      void loadCaregiverData("refresh");
                    }}
                  />
                </View>
                <View style={styles.actionButtonWrap}>
                  <SecondaryButton label="Sign out caregiver" onPress={handleSignOut} />
                </View>
              </View>
            </View>
          </View>
        }
      />
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    listContent: {
      paddingBottom: tokens.spacing.xxxl,
    },
    content: {
      gap: tokens.spacing.md,
    },
    headerMetaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    headerStoryCard: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surface,
      padding: tokens.spacing.md,
      gap: tokens.spacing.xs,
    },
    headerStoryTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    headerStoryText: {
      color: tokens.colors.text,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    headerStoryNote: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    sectionIntro: {
      gap: tokens.spacing.xs,
      paddingHorizontal: tokens.spacing.xs,
    },
    sectionTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    sectionHelper: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    infoCard: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surface,
      padding: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    infoCardHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    infoCardTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      flex: 1,
    },
    infoCardText: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    infoCardNote: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    infoChipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    trackerGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.md,
    },
    trackerTileWrap: {
      width: "48%",
      flexGrow: 1,
      minWidth: 150,
    },
    twoColumnRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.md,
    },
    twoColumnCell: {
      flex: 1,
      minWidth: 150,
    },
    actionsCard: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surface,
      padding: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    actionsTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    actionsHelper: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    actionsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    actionButtonWrap: {
      flex: 1,
      minWidth: 140,
    },
    devCard: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surface,
      padding: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    devRow: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
      borderRadius: tokens.radius.md,
    },
    devRowPressed: {
      opacity: 0.86,
    },
    devTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    devDetails: {
      gap: tokens.spacing.sm,
    },
  });
}
