import { Redirect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { isApiError, type ApiError } from "@/src/api/client";
import {
  getTodayExercisePlan,
  type ExercisePlanItem,
  type TodayPlanResponse,
} from "@/src/api/patient";
import { InlineNotice } from "@/src/components/InlineNotice";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { Section } from "@/src/components/Section";
import { useAuth } from "@/src/state/auth";
import {
  getCachedExercisePlan,
  setCachedExercisePlan,
} from "@/src/state/exercisePlanCache";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { useLastRefreshed } from "@/src/state/refresh";
import { formatISOToHuman } from "@/src/utils/date";
import { normalizeUnknownError } from "@/src/utils/errors";

type LoadSource = "live" | "cache" | "none";

type PlanNotice = {
  variant: "info" | "warning" | "error";
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toFriendlyError(error: unknown): {
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
      title: "Couldn’t load plan",
      message: "You’re offline. Nothing was loaded.",
      kind: "offline",
      retryable: true,
    };
  }

  if (appError.kind === "network") {
    return {
      title: "Couldn’t load plan",
      message: "Couldn’t reach the service. Please try again.",
      kind: "network",
      retryable: true,
    };
  }

  if (appError.kind === "server") {
    return {
      title: "Couldn’t load plan",
      message: "Service unavailable. Please try again shortly.",
      kind: "server",
      retryable: true,
    };
  }

  if (appError.kind === "validation") {
    return {
      title: "Couldn’t load plan",
      message: appError.message || "The request was invalid.",
      kind: "validation",
      retryable: false,
    };
  }

  return {
    title: "Couldn’t load plan",
    message: appError.message || "Please try again.",
    kind: "unknown",
    retryable: true,
  };
}

function formatDose(item: ExercisePlanItem): string {
  const parts: string[] = [];
  if (typeof item.sets === "number" && typeof item.reps === "number") {
    parts.push(`${item.sets} sets x ${item.reps} reps`);
  } else if (typeof item.reps === "number") {
    parts.push(`${item.reps} reps`);
  }

  if (typeof item.holdSeconds === "number" && item.holdSeconds > 0) {
    parts.push(`hold ${item.holdSeconds}s`);
  }
  if (typeof item.restSeconds === "number" && item.restSeconds > 0) {
    parts.push(`rest ${item.restSeconds}s`);
  }
  if (item.intensity) {
    parts.push(item.intensity);
  }

  return parts.join(" · ");
}

export default function ExercisePlanScreen() {
  const router = useRouter();
  const auth = useAuth();
  const isOffline = useIsOffline();
  const exercisePlanRefresh = useLastRefreshed("exercisePlan");
  const exercisePlanError = useLastError("exercisePlanLoad");

  const patientId = auth.patient?.id ?? "";
  const [response, setResponse] = useState<TodayPlanResponse | null>(null);
  const [source, setSource] = useState<LoadSource>("none");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notice, setNotice] = useState<PlanNotice | null>(null);

  const loadPlan = useCallback(
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
        const cached = await getCachedExercisePlan(patientId);
        if (cached) {
          setResponse(cached.response);
          setSource("cache");
          setNotice({
            variant: "warning",
            title: "Offline",
            message: "Offline — showing saved plan.",
          });
        } else {
          setResponse(null);
          setSource("none");
          setNotice({
            variant: "warning",
            title: "Offline",
            message: "Offline — no saved plan is available yet.",
          });
        }

        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      try {
        const livePlan = await getTodayExercisePlan(auth.token, {
          tzOffsetMinutes: -new Date().getTimezoneOffset(),
        });
        setResponse(livePlan);
        setSource("live");
        await setCachedExercisePlan(patientId, livePlan);
        await exercisePlanRefresh.refreshLocal();
        await exercisePlanError.clear();
      } catch (error) {
        const friendly = toFriendlyError(error);
        await exercisePlanError.setLocalError({
          title: friendly.title,
          message: friendly.message,
          kind: friendly.kind,
          retryable: friendly.retryable,
        });

        const cached = await getCachedExercisePlan(patientId);
        if (cached) {
          setResponse(cached.response);
          setSource("cache");
          setNotice({
            variant: "warning",
            title: friendly.title,
            message: "Showing saved plan. Live refresh failed.",
            actionLabel: friendly.retryable ? "Retry" : undefined,
            onAction: friendly.retryable
              ? () => {
                  void loadPlan("refresh");
                }
              : undefined,
          });
        } else {
          setResponse(null);
          setSource("none");
          setNotice({
            variant: "error",
            title: friendly.title,
            message: friendly.message,
            actionLabel: friendly.retryable ? "Retry" : undefined,
            onAction: friendly.retryable
              ? () => {
                  void loadPlan("refresh");
                }
              : undefined,
          });
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [auth.token, exercisePlanError, exercisePlanRefresh, isOffline, patientId]
  );

  useEffect(() => {
    if (auth.status !== "signedIn") {
      return;
    }
    void loadPlan("initial");
  }, [auth.status, loadPlan]);

  const openVideo = async (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) {
      return;
    }

    const canOpen = await Linking.canOpenURL(trimmed);
    if (!canOpen) {
      setNotice({
        variant: "warning",
        title: "Video unavailable",
        message: "Could not open the video link on this device.",
      });
      return;
    }

    await Linking.openURL(trimmed);
  };

  if (auth.status === "loading") {
    return (
      <Screen title="Today’s plan">
        <View style={styles.centered}>
          <ActivityIndicator size="small" />
        </View>
      </Screen>
    );
  }

  if (auth.status === "signedOut") {
    return <Redirect href="/(auth)/login" />;
  }

  const plan = response?.plan ?? null;
  const dayLabel =
    response && response.dayOfWeek >= 0 && response.dayOfWeek <= 6
      ? DAY_LABELS[response.dayOfWeek]
      : null;

  return (
    <Screen title="Today’s plan">
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void loadPlan("refresh");
            }}
          />
        }
      >
        <LastRefreshed value={exercisePlanRefresh.label} />
        <LastFailedAttempt
          value={exercisePlanError.label}
          title={exercisePlanError.lastError?.title}
          message={exercisePlanError.lastError?.message}
          onClear={exercisePlanError.lastError ? exercisePlanError.clear : undefined}
        />

        {isOffline ? (
          <InlineNotice
            variant="warning"
            title="Offline"
            message="Offline — showing saved plan."
          />
        ) : null}

        {source === "cache" && !isOffline ? (
          <InlineNotice
            variant="info"
            title="Saved data"
            message="Showing saved plan while live refresh is unavailable."
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

        {isLoading && !response ? (
          <View style={styles.centered}>
            <ActivityIndicator size="small" />
          </View>
        ) : !plan ? (
          <Section title="Today’s plan">
            <Text style={styles.emptyText}>
              No plan assigned yet. Your clinician will add one soon.
            </Text>
          </Section>
        ) : (
          <Section title={plan.title}>
            <Text style={styles.metaText}>
              {dayLabel ? `${dayLabel} · ` : ""}
              {response?.date ? formatISOToHuman(response.date) : "--"}
            </Text>
            <Text style={styles.metaText}>
              Version {plan.version} · Updated {formatISOToHuman(plan.updatedAt)}
            </Text>

            <View style={styles.actionsRow}>
              <PrimaryButton
                label="Start session"
                onPress={() => {
                  router.push("/exercise-session");
                }}
              />
              <PrimaryButton
                label="View sessions"
                onPress={() => {
                  router.push("/exercise-sessions");
                }}
              />
            </View>

            <View style={styles.itemList}>
              {plan.items.map((item) => (
                <View key={item.key} style={styles.itemCard}>
                  <Text style={styles.itemTitle}>{item.name}</Text>
                  {formatDose(item) ? (
                    <Text style={styles.itemDose}>{formatDose(item)}</Text>
                  ) : null}
                  <Text style={styles.itemInstructions}>{item.instructions}</Text>
                  {item.videoUrl ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        void openVideo(item.videoUrl ?? "");
                      }}
                      style={({ pressed }) => [
                        styles.videoButton,
                        pressed ? styles.videoButtonPressed : null,
                      ]}
                    >
                      <Text style={styles.videoButtonText}>Open video</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
          </Section>
        )}

        <Text style={styles.footerNote}>
          If pain increases sharply, stop and contact your clinician.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingBottom: 20,
  },
  centered: {
    minHeight: 120,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 15,
    color: "#374151",
    lineHeight: 22,
  },
  metaText: {
    fontSize: 13,
    color: "#4b5563",
    marginBottom: 4,
  },
  itemList: {
    gap: 10,
  },
  actionsRow: {
    gap: 8,
    marginBottom: 4,
  },
  itemCard: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    padding: 12,
    gap: 6,
    backgroundColor: "#ffffff",
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  itemDose: {
    fontSize: 13,
    color: "#1f2937",
    fontWeight: "500",
  },
  itemInstructions: {
    fontSize: 14,
    lineHeight: 20,
    color: "#374151",
  },
  videoButton: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "#e5e7eb",
  },
  videoButtonPressed: {
    opacity: 0.75,
  },
  videoButtonText: {
    fontSize: 13,
    color: "#1f2937",
    fontWeight: "600",
  },
  footerNote: {
    fontSize: 13,
    color: "#6b7280",
    lineHeight: 19,
  },
});
