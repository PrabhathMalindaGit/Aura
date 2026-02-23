import { Redirect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { isApiError, type ApiError } from "@/src/api/client";
import {
  createExerciseSession,
  listExerciseSessions,
  type ExerciseSessionListItem,
} from "@/src/api/patient";
import { InlineNotice } from "@/src/components/InlineNotice";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { useAuth } from "@/src/state/auth";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { getPending, removePending, type PendingExerciseSession } from "@/src/state/pendingSessions";
import { useLastRefreshed } from "@/src/state/refresh";
import { formatISOToHuman } from "@/src/utils/date";
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
      message: appError.message || "Please review input and try again.",
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

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}

export default function ExerciseSessionsScreen() {
  const router = useRouter();
  const auth = useAuth();
  const isOffline = useIsOffline();
  const sessionsRefresh = useLastRefreshed("exerciseSessions");
  const sessionsLoadError = useLastError("exerciseSessionsLoad");
  const saveSessionError = useLastError("exerciseSessionSave");

  const patientId = auth.patient?.id ?? "";
  const [sessions, setSessions] = useState<ExerciseSessionListItem[]>([]);
  const [pending, setPending] = useState<PendingExerciseSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmittingPending, setIsSubmittingPending] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const pendingCount = pending.length;

  const loadPending = useCallback(async () => {
    if (!patientId) {
      setPending([]);
      return;
    }
    const next = await getPending(patientId);
    setPending(next);
  }, [patientId]);

  const loadSessions = useCallback(
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
      await loadPending();

      if (isOffline) {
        setNotice({
          variant: "warning",
          title: "Offline",
          message: "Offline — pending uploads are shown. Connect to load recent sessions.",
        });
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      try {
        const response = await listExerciseSessions(auth.token, 30);
        setSessions(response);
        await sessionsRefresh.refreshLocal();
        await sessionsLoadError.clear();
      } catch (error) {
        const friendly = toFriendlyError(error, "Couldn’t load sessions");
        await sessionsLoadError.setLocalError({
          title: friendly.title,
          message: friendly.message,
          kind: friendly.kind,
          retryable: friendly.retryable,
        });
        setNotice({
          variant: "error",
          title: friendly.title,
          message: friendly.message,
          actionLabel: friendly.retryable ? "Retry" : undefined,
          onAction: friendly.retryable
            ? () => {
                void loadSessions("refresh");
              }
            : undefined,
        });
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [
      auth.token,
      isOffline,
      loadPending,
      patientId,
      sessionsLoadError,
      sessionsRefresh,
    ]
  );

  useFocusEffect(
    useCallback(() => {
      if (auth.status !== "signedIn") {
        return;
      }
      void loadSessions("initial");
    }, [auth.status, loadSessions])
  );

  const submitPending = useCallback(async () => {
    if (!auth.token || !patientId) {
      router.replace("/(auth)/login");
      return;
    }

    if (pending.length === 0) {
      return;
    }

    if (isOffline) {
      setNotice({
        variant: "warning",
        title: "Offline",
        message: "You’re offline. Pending sessions cannot be submitted yet.",
      });
      return;
    }

    setIsSubmittingPending(true);
    setNotice(null);

    let submitted = 0;
    for (const entry of pending) {
      try {
        await createExerciseSession(auth.token, entry.payload);
        await removePending(patientId, entry.localId);
        submitted += 1;
      } catch (error) {
        const friendly = toFriendlyError(error, "Couldn’t submit pending sessions");
        await saveSessionError.setLocalError({
          title: friendly.title,
          message: friendly.message,
          kind: friendly.kind,
          retryable: friendly.retryable,
        });
        setNotice({
          variant: "error",
          title: friendly.title,
          message:
            submitted > 0
              ? `Submitted ${submitted} session(s). ${friendly.message}`
              : friendly.message,
        });
        setIsSubmittingPending(false);
        await loadPending();
        return;
      }
    }

    await saveSessionError.clear();
    await sessionsRefresh.refreshLocal();
    await loadPending();
    await loadSessions("refresh");
    setNotice({
      variant: "info",
      title: "Pending submitted",
      message: "All pending sessions were submitted successfully.",
    });
    setIsSubmittingPending(false);
  }, [
    auth.token,
    isOffline,
    loadPending,
    loadSessions,
    patientId,
    pending,
    router,
    saveSessionError,
    sessionsRefresh,
  ]);

  const pendingSummary = useMemo(() => {
    if (pendingCount === 0) {
      return "No pending uploads.";
    }
    return `${pendingCount} pending upload${pendingCount === 1 ? "" : "s"}.`;
  }, [pendingCount]);

  if (auth.status === "loading") {
    return (
      <Screen title="Exercise sessions">
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
    <Screen title="Exercise sessions">
      <View style={styles.container}>
        <LastRefreshed value={sessionsRefresh.label} />
        <LastFailedAttempt
          value={sessionsLoadError.label}
          title={sessionsLoadError.lastError?.title}
          message={sessionsLoadError.lastError?.message}
          onClear={sessionsLoadError.lastError ? sessionsLoadError.clear : undefined}
        />
        <LastFailedAttempt
          label="Last session save issue"
          value={saveSessionError.label}
          title={saveSessionError.lastError?.title}
          message={saveSessionError.lastError?.message}
          onClear={saveSessionError.lastError ? saveSessionError.clear : undefined}
        />

        <View style={styles.pendingCard}>
          <Text style={styles.pendingTitle}>Pending uploads: {pendingSummary}</Text>
          <PrimaryButton
            label={isSubmittingPending ? "Submitting…" : "Submit pending"}
            loading={isSubmittingPending}
            disabled={pendingCount === 0 || isSubmittingPending || isOffline}
            onPress={() => {
              void submitPending();
            }}
          />
        </View>

        {isOffline ? (
          <InlineNotice
            variant="warning"
            title="Offline"
            message="Offline — pending sessions are safe locally. Connect to load or submit."
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
        ) : sessions.length === 0 ? (
          <InlineNotice
            variant="info"
            title="No sessions yet"
            message="Start a session from Today’s plan to see it here."
          />
        ) : (
          <FlatList
            data={sessions}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => {
                  void loadSessions("refresh");
                }}
              />
            }
            renderItem={({ item }) => (
              <PrimaryButton
                label={`${formatISOToHuman(item.startedAt)} · ${formatDuration(
                  item.durationSeconds
                )} · ${item.completedCount}/${item.exerciseCount} done${
                  typeof item.avgPainDuring === "number"
                    ? ` · pain ${item.avgPainDuring}/5`
                    : ""
                }`}
                onPress={() => {
                  router.push({
                    pathname: "/exercise-session-detail",
                    params: { id: item.id },
                  });
                }}
              />
            )}
            contentContainerStyle={styles.list}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 10,
  },
  centered: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  pendingCard: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    backgroundColor: "#ffffff",
    padding: 12,
    gap: 8,
  },
  pendingTitle: {
    fontSize: 14,
    color: "#111827",
    fontWeight: "600",
  },
  list: {
    gap: 8,
    paddingBottom: 16,
  },
});
