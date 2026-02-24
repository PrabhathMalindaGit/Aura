import { Redirect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { isApiError, type ApiError } from "@/src/api/client";
import { getWeeklyReport, type WeeklyReport } from "@/src/api/patient";
import { InlineNotice } from "@/src/components/InlineNotice";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { useAuth } from "@/src/state/auth";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import {
  getCachedWeeklyReport,
  setCachedWeeklyReport,
} from "@/src/state/weeklyReportCache";
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
      message: appError.message || "Please review your request and try again.",
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

function buildShareText(report: WeeklyReport): string {
  const lines: string[] = [
    `Aura Weekly Report (${report.period.weekStart} to ${report.period.weekEnd})`,
    "",
    report.summary.headline,
    "",
    "Highlights:",
    ...report.summary.highlights.map((item) => `- ${item}`),
    "",
    `Check-ins: ${report.checkins.count}, avg pain ${numberOrDash(report.checkins.avgPain)}, avg mood ${numberOrDash(report.checkins.avgMood)}, exercises ${pctOrDash(report.checkins.avgExercisesPct)}`,
    `Sleep: tracked nights ${report.sleep.trackedNights}, avg hours ${numberOrDash(report.sleep.avgHours)}, avg quality ${numberOrDash(report.sleep.avgQuality)}`,
    `Hydration: tracked days ${report.hydration.trackedDays}, avg daily ${numberOrDash(report.hydration.avgDailyMl)} ml, total ${report.hydration.totalMl} ml, goal days ${report.hydration.daysMeetingTarget}/${report.hydration.trackedDays}`,
    `Nutrition: tracked days ${report.nutrition.trackedDays}, avg fruit/veg ${numberOrDash(report.nutrition.avgFruitVegServings)}, protein OK/high days ${report.nutrition.proteinOkHighDays}, anti-inflammatory days ${report.nutrition.antiInflammatoryDays}, regular meals days ${report.nutrition.regularMealsDays}`,
    `Medications: scheduled ${report.medications.scheduledDoses}, taken ${report.medications.takenDoses}, skipped ${report.medications.skippedDoses}, adherence ${pctOrDash(report.medications.adherencePct)}`,
    `Exercise sessions: ${report.exercises.sessionCount}, duration ${report.exercises.totalDurationMinutes} min, completion ${report.exercises.completedExercises}/${report.exercises.totalExercises}`,
    `PROMs: due now ${report.proms.dueNowCount}, completed this week ${report.proms.completedThisWeekCount}`,
    `Safety: alerts ${report.safety.alertsCreatedThisWeek}, high-risk ${report.safety.highRiskAlertsThisWeek}`,
    "",
    "Next steps:",
    ...report.summary.nextSteps.map((item) => `- ${item}`),
  ];

  return lines.join("\n");
}

export default function WeeklyReportScreen() {
  const auth = useAuth();
  const isOffline = useIsOffline();
  const weeklyRefresh = useLastRefreshed("weeklyReport");
  const weeklyLoadError = useLastError("weeklyReportLoad");

  const patientId = auth.patient?.id ?? "";
  const tzOffsetMinutes = -new Date().getTimezoneOffset();
  const thisWeekStart = useMemo(
    () => startOfWeekMondayISO(tzOffsetMinutes),
    [tzOffsetMinutes]
  );
  const lastWeekStart = useMemo(
    () => addDaysISO(thisWeekStart, -7),
    [thisWeekStart]
  );

  const [selectedWeek, setSelectedWeek] = useState<WeekPreset>("this");
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const activeWeekStart = selectedWeek === "this" ? thisWeekStart : lastWeekStart;

  const loadReport = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!auth.token || !patientId) {
        return;
      }

      if (mode === "refresh") {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      setNotice(null);

      if (isOffline) {
        const cached = await getCachedWeeklyReport(patientId, activeWeekStart);
        if (cached) {
          setReport(cached.report);
          setNotice({
            variant: "warning",
            title: "Offline",
            message: "Offline — showing saved weekly report.",
          });
        } else {
          setReport(null);
          setNotice({
            variant: "warning",
            title: "Offline",
            message: "Offline — no saved report is available for this week yet.",
          });
        }

        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      try {
        const live = await getWeeklyReport(auth.token, {
          weekStart: activeWeekStart,
          tzOffsetMinutes,
        });

        setReport(live);
        await setCachedWeeklyReport(patientId, activeWeekStart, live);
        await weeklyRefresh.refreshLocal();
        await weeklyLoadError.clear();
      } catch (error) {
        const friendly = toFriendlyError(error, "Couldn’t load weekly report");
        await weeklyLoadError.setLocalError({
          title: friendly.title,
          message: friendly.message,
          kind: friendly.kind,
          retryable: friendly.retryable,
        });

        const cached = await getCachedWeeklyReport(patientId, activeWeekStart);
        if (cached) {
          setReport(cached.report);
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
      auth.token,
      isOffline,
      patientId,
      tzOffsetMinutes,
      weeklyLoadError,
      weeklyRefresh,
    ]
  );

  useFocusEffect(
    useCallback(() => {
      if (auth.status !== "signedIn") {
        return;
      }
      void loadReport("initial");
      return undefined;
    }, [auth.status, loadReport])
  );

  useEffect(() => {
    if (auth.status !== "signedIn") {
      return;
    }
    void loadReport("initial");
  }, [activeWeekStart, auth.status, loadReport]);

  const shareReport = useCallback(async () => {
    if (!report) {
      return;
    }

    try {
      await Share.share({
        message: buildShareText(report),
      });
    } catch {
      setNotice({
        variant: "error",
        title: "Share failed",
        message: "Could not open share sheet. Please try again.",
      });
    }
  }, [report]);

  if (auth.status === "loading") {
    return (
      <Screen title="Weekly report">
        <View style={styles.centered}>
          <ActivityIndicator size="small" />
        </View>
      </Screen>
    );
  }

  if (auth.status === "signedOut") {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Screen title="Weekly report">
      <ScrollView contentContainerStyle={styles.container}>
        <LastRefreshed value={weeklyRefresh.label} />
        <LastFailedAttempt
          value={weeklyLoadError.label}
          title={weeklyLoadError.lastError?.title}
          message={weeklyLoadError.lastError?.message}
          onClear={weeklyLoadError.lastError ? weeklyLoadError.clear : undefined}
        />

        <View style={styles.selectorRow}>
          <Pressable
            style={({ pressed }) => [
              styles.selectorButton,
              selectedWeek === "this" ? styles.selectorButtonSelected : null,
              pressed ? styles.selectorButtonPressed : null,
            ]}
            onPress={() => {
              setSelectedWeek("this");
            }}
          >
            <Text
              style={
                selectedWeek === "this"
                  ? styles.selectorTextSelected
                  : styles.selectorText
              }
            >
              This week
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.selectorButton,
              selectedWeek === "last" ? styles.selectorButtonSelected : null,
              pressed ? styles.selectorButtonPressed : null,
            ]}
            onPress={() => {
              setSelectedWeek("last");
            }}
          >
            <Text
              style={
                selectedWeek === "last"
                  ? styles.selectorTextSelected
                  : styles.selectorText
              }
            >
              Last week
            </Text>
          </Pressable>
        </View>

        <PrimaryButton
          label={isRefreshing ? "Refreshing..." : "Refresh report"}
          loading={isRefreshing}
          disabled={isRefreshing}
          onPress={() => {
            void loadReport("refresh");
          }}
        />

        <PrimaryButton
          label="Share report"
          disabled={!report}
          onPress={() => {
            void shareReport();
          }}
        />

        {isOffline ? (
          <InlineNotice
            variant="warning"
            title="Offline"
            message="Offline — showing cached report when available."
          />
        ) : null}

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
        ) : !report ? (
          <InlineNotice
            variant="info"
            title="No report available"
            message="Connect online and refresh to load this weekly report."
          />
        ) : (
          <View style={styles.stack}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Summary</Text>
              <Text style={styles.bodyText}>{report.summary.headline}</Text>
              <Text style={styles.subTitle}>Highlights</Text>
              {report.summary.highlights.map((item) => (
                <Text key={item} style={styles.bulletText}>{`• ${item}`}</Text>
              ))}
              <Text style={styles.subTitle}>Next steps</Text>
              {report.summary.nextSteps.map((item) => (
                <Text key={item} style={styles.bulletText}>{`• ${item}`}</Text>
              ))}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Check-ins</Text>
              <Text style={styles.metaText}>Count: {report.checkins.count}</Text>
              <Text style={styles.metaText}>Average pain: {numberOrDash(report.checkins.avgPain)}</Text>
              <Text style={styles.metaText}>Average mood: {numberOrDash(report.checkins.avgMood)}</Text>
              <Text style={styles.metaText}>Exercise adherence: {pctOrDash(report.checkins.avgExercisesPct)}</Text>
              <Text style={styles.metaText}>Medication yes: {pctOrDash(report.checkins.medicationYesPct)}</Text>
              <Text style={styles.metaText}>Notes logged: {report.checkins.notesCount}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Sleep</Text>
              <Text style={styles.metaText}>Tracked nights: {report.sleep.trackedNights}</Text>
              <Text style={styles.metaText}>Average hours: {numberOrDash(report.sleep.avgHours)}</Text>
              <Text style={styles.metaText}>Average quality: {numberOrDash(report.sleep.avgQuality)}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Hydration</Text>
              <Text style={styles.metaText}>Tracked days: {report.hydration.trackedDays}</Text>
              <Text style={styles.metaText}>Average daily: {numberOrDash(report.hydration.avgDailyMl)} ml</Text>
              <Text style={styles.metaText}>Total: {report.hydration.totalMl} ml</Text>
              <Text style={styles.metaText}>
                Goal days: {report.hydration.daysMeetingTarget}/{report.hydration.trackedDays} (target {report.hydration.targetMl} ml)
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Nutrition</Text>
              <Text style={styles.metaText}>Tracked days: {report.nutrition.trackedDays}</Text>
              <Text style={styles.metaText}>
                Avg fruit/veg servings: {numberOrDash(report.nutrition.avgFruitVegServings)}
              </Text>
              <Text style={styles.metaText}>
                Protein OK/high days: {report.nutrition.proteinOkHighDays}
              </Text>
              <Text style={styles.metaText}>
                Anti-inflammatory days: {report.nutrition.antiInflammatoryDays}
              </Text>
              <Text style={styles.metaText}>
                Regular meals days: {report.nutrition.regularMealsDays}
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Medications</Text>
              <Text style={styles.metaText}>
                Scheduled doses: {report.medications.scheduledDoses}
              </Text>
              <Text style={styles.metaText}>
                Taken doses: {report.medications.takenDoses}
              </Text>
              <Text style={styles.metaText}>
                Skipped doses: {report.medications.skippedDoses}
              </Text>
              <Text style={styles.metaText}>
                Adherence: {pctOrDash(report.medications.adherencePct)}
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Exercise sessions</Text>
              <Text style={styles.metaText}>Sessions: {report.exercises.sessionCount}</Text>
              <Text style={styles.metaText}>Total duration: {report.exercises.totalDurationMinutes} min</Text>
              <Text style={styles.metaText}>
                Completion: {report.exercises.completedExercises}/{report.exercises.totalExercises}
              </Text>
              <Text style={styles.metaText}>
                Average pain during: {numberOrDash(report.exercises.avgPainDuring)}
              </Text>
              <Text style={styles.metaText}>
                Difficulty: easy {report.exercises.difficulty.easy}, ok {report.exercises.difficulty.ok}, hard {report.exercises.difficulty.hard}
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Questionnaires (PROMs)</Text>
              <Text style={styles.metaText}>Due now: {report.proms.dueNowCount}</Text>
              <Text style={styles.metaText}>
                Completed this week: {report.proms.completedThisWeekCount}
              </Text>
              <Text style={styles.metaText}>
                Latest: {report.proms.latestCompleted
                  ? `${report.proms.latestCompleted.normalized} (${report.proms.latestCompleted.bandLabel})`
                  : "—"}
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Safety</Text>
              <Text style={styles.metaText}>
                Alerts created this week: {report.safety.alertsCreatedThisWeek}
              </Text>
              <Text style={styles.metaText}>
                High-risk alerts this week: {report.safety.highRiskAlertsThisWeek}
              </Text>
              <Text style={styles.metaText}>
                Period: {report.period.weekStart} to {report.period.weekEnd}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingBottom: 28,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 120,
  },
  selectorRow: {
    flexDirection: "row",
    gap: 10,
  },
  selectorButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d0d7de",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  selectorButtonSelected: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  selectorButtonPressed: {
    opacity: 0.85,
  },
  selectorText: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "600",
  },
  selectorTextSelected: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  stack: {
    gap: 12,
  },
  card: {
    borderWidth: 1,
    borderColor: "#d0d7de",
    borderRadius: 12,
    padding: 12,
    gap: 6,
    backgroundColor: "#fff",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  subTitle: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#1f2937",
  },
  bulletText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#374151",
  },
  metaText: {
    fontSize: 13,
    color: "#4b5563",
  },
});
