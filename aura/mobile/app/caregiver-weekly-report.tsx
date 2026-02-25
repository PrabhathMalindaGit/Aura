import { Redirect, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { isApiError, type ApiError } from "@/src/api/client";
import { getCaregiverWeeklyReport } from "@/src/api/caregiver";
import type { WeeklyReport } from "@/src/api/patient";
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
  setCachedCaregiverWeeklyReport,
} from "@/src/state/caregiverCache";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { useLastRefreshed } from "@/src/state/refresh";
import { addDaysISO, startOfWeekMondayISO } from "@/src/utils/date";
import { normalizeUnknownError } from "@/src/utils/errors";

type WeekPreset = "this" | "last";

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

function numberOrDash(value: number | null): string {
  return value === null ? "—" : String(value);
}

function pctOrDash(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

export default function CaregiverWeeklyReportScreen() {
  const caregiverSession = useCaregiverSession();
  const isOffline = useIsOffline();
  const caregiverRefresh = useLastRefreshed("caregiver");
  const caregiverLoadError = useLastError("caregiverLoad");

  const [selectedWeek, setSelectedWeek] = useState<WeekPreset>("this");
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const tzOffsetMinutes = -new Date().getTimezoneOffset();
  const thisWeekStart = useMemo(
    () => startOfWeekMondayISO(tzOffsetMinutes),
    [tzOffsetMinutes]
  );
  const lastWeekStart = useMemo(
    () => addDaysISO(thisWeekStart, -7),
    [thisWeekStart]
  );
  const activeWeekStart = selectedWeek === "this" ? thisWeekStart : lastWeekStart;
  const patientId = caregiverSession.patient?.id ?? report?.patientId ?? "";

  const loadReport = useCallback(
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
        const cachedReport = getCachedCaregiverWeeklyReport(cached, selectedWeek);
        if (cachedReport) {
          setReport(cachedReport);
          setNotice({
            variant: "warning",
            title: "Offline",
            message: "Offline — showing saved info.",
          });
        } else {
          setReport(null);
          setNotice({
            variant: "warning",
            title: "Offline",
            message: "Offline — no saved report is available for this week.",
          });
        }
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      try {
        const live = await getCaregiverWeeklyReport(caregiverSession.token, {
          weekStart: activeWeekStart,
          tzOffsetMinutes,
        });

        setReport(live);
        const cachePatientId = patientId || live.patientId;
        await Promise.all([
          setCachedCaregiverWeeklyReport(cachePatientId, selectedWeek, live),
          caregiverRefresh.refreshLocal(),
          caregiverLoadError.clear(),
        ]);
      } catch (error) {
        const friendly = toFriendlyError(error, "Couldn’t load weekly report");
        await caregiverLoadError.setLocalError({
          title: friendly.title,
          message: friendly.message,
          kind: friendly.kind,
          retryable: friendly.retryable,
        });

        const cached = patientId ? await getCachedCaregiverData(patientId) : null;
        const cachedReport = getCachedCaregiverWeeklyReport(cached, selectedWeek);
        if (cachedReport) {
          setReport(cachedReport);
          setNotice({
            variant: "warning",
            title: friendly.title,
            message: "Showing saved report. Live refresh failed.",
            actionLabel: friendly.retryable ? "Retry" : undefined,
            onAction: friendly.retryable
              ? () => {
                  void loadReport("refresh");
                }
              : undefined,
          });
        } else {
          setReport(null);
          setNotice({
            variant: "error",
            title: friendly.title,
            message: friendly.message,
            actionLabel: friendly.retryable ? "Retry" : undefined,
            onAction: friendly.retryable
              ? () => {
                  void loadReport("refresh");
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
      activeWeekStart,
      caregiverLoadError,
      caregiverRefresh,
      caregiverSession.token,
      isOffline,
      patientId,
      selectedWeek,
      tzOffsetMinutes,
    ]
  );

  useFocusEffect(
    useCallback(() => {
      if (caregiverSession.status !== "signedIn") {
        return;
      }
      void loadReport("initial");
      return undefined;
    }, [caregiverSession.status, loadReport])
  );

  useEffect(() => {
    if (caregiverSession.status !== "signedIn") {
      return;
    }
    void loadReport("initial");
  }, [caregiverSession.status, loadReport, selectedWeek]);

  if (caregiverSession.status === "loading") {
    return (
      <Screen title="Caregiver weekly report">
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
    <Screen title="Caregiver weekly report">
      <ScrollView contentContainerStyle={styles.container}>
        <LastRefreshed value={caregiverRefresh.label} />
        <LastFailedAttempt
          value={caregiverLoadError.label}
          title={caregiverLoadError.lastError?.title}
          message={caregiverLoadError.lastError?.message}
          onClear={caregiverLoadError.lastError ? caregiverLoadError.clear : undefined}
        />

        <View style={styles.selectorRow}>
          <Pressable
            style={({ pressed }) => [
              styles.selectorButton,
              selectedWeek === "this" ? styles.selectorSelected : null,
              pressed ? styles.selectorPressed : null,
            ]}
            onPress={() => setSelectedWeek("this")}
          >
            <Text
              style={selectedWeek === "this" ? styles.selectorTextSelected : styles.selectorText}
            >
              This week
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.selectorButton,
              selectedWeek === "last" ? styles.selectorSelected : null,
              pressed ? styles.selectorPressed : null,
            ]}
            onPress={() => setSelectedWeek("last")}
          >
            <Text
              style={selectedWeek === "last" ? styles.selectorTextSelected : styles.selectorText}
            >
              Last week
            </Text>
          </Pressable>
        </View>

        {notice ? (
          <InlineNotice
            variant={notice.variant}
            title={notice.title}
            message={notice.message}
            actionLabel={notice.actionLabel}
            onAction={notice.onAction}
          />
        ) : null}

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="small" />
          </View>
        ) : report ? (
          <>
            <Section title="Summary">
              <Text style={styles.headline}>{report.summary.headline}</Text>
              {report.summary.highlights.map((item) => (
                <Text key={item} style={styles.line}>
                  • {item}
                </Text>
              ))}
            </Section>

            <Section title="Check-ins">
              <Text style={styles.line}>Count: {report.checkins.count}</Text>
              <Text style={styles.line}>Average pain: {numberOrDash(report.checkins.avgPain)}</Text>
              <Text style={styles.line}>Average mood: {numberOrDash(report.checkins.avgMood)}</Text>
            </Section>

            <Section title="Safety">
              <Text style={styles.line}>
                Opened alerts this week: {report.safety.alertsCreatedThisWeek}
              </Text>
              <Text style={styles.line}>
                High-risk alerts this week: {report.safety.highRiskAlertsThisWeek}
              </Text>
            </Section>

            <Section title="Questionnaires">
              <Text style={styles.line}>Due now: {report.proms.dueNowCount}</Text>
              <Text style={styles.line}>
                Completed this week: {report.proms.completedThisWeekCount}
              </Text>
              {report.proms.latestCompleted ? (
                <Text style={styles.line}>
                  Latest score: {report.proms.latestCompleted.normalized}/100 (
                  {report.proms.latestCompleted.bandLabel})
                </Text>
              ) : null}
            </Section>

            <Section title="Exercises">
              <Text style={styles.line}>Sessions: {report.exercises.sessionCount}</Text>
              <Text style={styles.line}>
                Completed exercises: {report.exercises.completedExercises}/
                {report.exercises.totalExercises}
              </Text>
              <Text style={styles.line}>
                Average pain during exercise: {numberOrDash(report.exercises.avgPainDuring)}
              </Text>
            </Section>

            <Section title="Hydration / Nutrition / Medications">
              <Text style={styles.line}>
                Hydration avg daily: {numberOrDash(report.hydration.avgDailyMl)} ml
              </Text>
              <Text style={styles.line}>
                Nutrition avg fruit/veg: {numberOrDash(report.nutrition.avgFruitVegServings)}
              </Text>
              <Text style={styles.line}>
                Medication adherence: {pctOrDash(report.medications.adherencePct)}
              </Text>
            </Section>
          </>
        ) : (
          <InlineNotice
            variant="info"
            title="No report"
            message="No weekly report is available for this week yet."
          />
        )}

        <PrimaryButton
          label={isRefreshing ? "Refreshing…" : "Refresh"}
          disabled={isRefreshing || isOffline}
          onPress={() => {
            void loadReport("refresh");
          }}
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
    alignItems: "center",
    justifyContent: "center",
    minHeight: 120,
  },
  selectorRow: {
    flexDirection: "row",
    gap: 8,
  },
  selectorButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  selectorSelected: {
    borderColor: "#111827",
    backgroundColor: "#111827",
  },
  selectorPressed: {
    opacity: 0.8,
  },
  selectorText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "600",
  },
  selectorTextSelected: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  headline: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  line: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 19,
  },
});
