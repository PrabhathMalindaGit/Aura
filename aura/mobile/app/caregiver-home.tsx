import { Redirect, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { isApiError, type ApiError } from "@/src/api/client";
import {
  getCaregiverSummary,
  getCaregiverWeeklyReport,
  type CaregiverSummary,
} from "@/src/api/caregiver";
import { InlineNotice } from "@/src/components/InlineNotice";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { Section } from "@/src/components/Section";
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

function formatPercent(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }
  return `${Math.round(value * 100)}%`;
}

export default function CaregiverHomeScreen() {
  const router = useRouter();
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

  if (caregiverSession.status === "loading") {
    return (
      <Screen title="Caregiver">
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
    <Screen title="Caregiver">
      <ScrollView contentContainerStyle={styles.container}>
        <LastRefreshed value={caregiverRefresh.label} />
        <LastFailedAttempt
          value={caregiverLoadError.label}
          title={caregiverLoadError.lastError?.title}
          message={caregiverLoadError.lastError?.message}
          onClear={caregiverLoadError.lastError ? caregiverLoadError.clear : undefined}
        />

        {notice ? (
          <InlineNotice
            variant={notice.variant}
            title={notice.title}
            message={notice.message}
            actionLabel={notice.actionLabel}
            onAction={notice.onAction}
          />
        ) : null}

        <Section title="Patient">
          <Text style={styles.primaryText}>
            {summary?.patient.displayName ?? caregiverSession.patient?.displayName ?? "Patient"}
          </Text>
          <Text style={styles.secondaryText}>
            ID: {summary?.patient.id ?? caregiverSession.patient?.id ?? "—"}
          </Text>
        </Section>

        <Section title="Status">
          {summary?.lastCheckin ? (
            <View style={styles.statusCard}>
              <Text style={styles.primaryText}>Last check-in: {summary.lastCheckin.date}</Text>
              <Text style={styles.secondaryText}>Pain: {summary.lastCheckin.pain}/10</Text>
              <Text style={styles.secondaryText}>Mood: {summary.lastCheckin.mood}/5</Text>
              <Text style={styles.secondaryText}>
                Exercise adherence: {formatPercent(summary.lastCheckin.adherence?.exercises)}
              </Text>
              {summary.lastCheckin.sleep?.hours !== undefined ? (
                <Text style={styles.secondaryText}>
                  Sleep: {summary.lastCheckin.sleep.hours}h
                  {summary.lastCheckin.sleep.quality !== undefined
                    ? ` (quality ${summary.lastCheckin.sleep.quality}/5)`
                    : ""}
                </Text>
              ) : null}
              {summary.lastCheckin.hydrationTodayMl !== undefined ? (
                <Text style={styles.secondaryText}>
                  Hydration: {summary.lastCheckin.hydrationTodayMl} ml
                </Text>
              ) : null}
              {summary.lastCheckin.nutritionToday ? (
                <Text style={styles.secondaryText}>
                  Nutrition: protein {summary.lastCheckin.nutritionToday.protein ?? "—"}, fruit/veg{" "}
                  {summary.lastCheckin.nutritionToday.fruitVegServings ?? "—"}
                </Text>
              ) : null}
              {summary.lastCheckin.medsToday ? (
                <Text style={styles.secondaryText}>
                  Medications: {summary.lastCheckin.medsToday.taken}/
                  {summary.lastCheckin.medsToday.scheduled} taken
                </Text>
              ) : null}
            </View>
          ) : (
            <Text style={styles.secondaryText}>No check-in snapshot available yet.</Text>
          )}
        </Section>

        <Section title="Safety">
          <View style={styles.statusCard}>
            <Text style={styles.secondaryText}>
              Open alerts: {summary?.safety.openAlertsCount ?? 0}
            </Text>
            <Text style={styles.secondaryText}>
              High-risk alerts (14d): {summary?.safety.highRiskAlerts14d ?? 0}
            </Text>
            <Text style={styles.noteText}>If you’re concerned, contact the clinic.</Text>
          </View>
        </Section>

        <Section title="Weekly report preview">
          {weeklyHeadline ? (
            <View style={styles.statusCard}>
              <Text style={styles.primaryText}>{weeklyHeadline}</Text>
              {weeklyHighlights.map((item) => (
                <Text key={item} style={styles.secondaryText}>
                  • {item}
                </Text>
              ))}
            </View>
          ) : (
            <Text style={styles.secondaryText}>No weekly report preview yet.</Text>
          )}
          <PrimaryButton
            label="Open weekly report"
            onPress={() => {
              router.push("/caregiver-weekly-report" as Href);
            }}
          />
        </Section>

        <Section title="Actions">
          <PrimaryButton
            label={isRefreshing ? "Refreshing…" : "Refresh"}
            disabled={isRefreshing || isOffline}
            onPress={() => {
              void loadCaregiverData("refresh");
            }}
          />
          <PrimaryButton
            label="Sign out"
            onPress={() => {
              void caregiverSession.signOut().then(() => {
                router.replace("/caregiver-login" as Href);
              });
            }}
          />
        </Section>
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
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  statusCard: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  primaryText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  secondaryText: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 19,
  },
  noteText: {
    fontSize: 12,
    color: "#4b5563",
    marginTop: 2,
  },
});
