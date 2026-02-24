import { Redirect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { isApiError, type ApiError } from "@/src/api/client";
import {
  getDueProms,
  getPromHistory,
  submitProm,
  type PromDueCard,
  type PromHistoryRow,
} from "@/src/api/patient";
import { InlineNotice } from "@/src/components/InlineNotice";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { Section } from "@/src/components/Section";
import { useAuth } from "@/src/state/auth";
import {
  getCachedProms,
  setCachedProms,
} from "@/src/state/promsCache";
import {
  getPendingPromSubmissions,
  removePendingPromSubmission,
  type PendingPromSubmission,
} from "@/src/state/pendingPromSubmissions";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { useLastRefreshed } from "@/src/state/refresh";
import { normalizeUnknownError } from "@/src/utils/errors";

type NoticeState = {
  variant: "info" | "warning" | "error";
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "--";
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return "--";
  }

  return parsed.toLocaleString();
}

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
      message: "You’re offline. Nothing was sent.",
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
      message: appError.message || "Please review your input and try again.",
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

export default function PromsScreen() {
  const router = useRouter();
  const auth = useAuth();
  const isOffline = useIsOffline();
  const promsRefresh = useLastRefreshed("proms");
  const promsLoadError = useLastError("promsLoad");
  const promSubmitError = useLastError("promSubmit");

  const patientId = auth.patient?.id ?? "";
  const [due, setDue] = useState<PromDueCard[]>([]);
  const [history, setHistory] = useState<PromHistoryRow[]>([]);
  const [pending, setPending] = useState<PendingPromSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmittingPending, setIsSubmittingPending] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const loadPending = useCallback(async () => {
    if (!patientId) {
      setPending([]);
      return;
    }

    const entries = await getPendingPromSubmissions(patientId);
    setPending(entries);
  }, [patientId]);

  const loadProms = useCallback(
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
        const cached = await getCachedProms(patientId);
        if (cached) {
          setDue(cached.dueCards);
          setHistory(cached.historyRows);
          setNotice({
            variant: "warning",
            title: "Offline",
            message: "Offline — showing saved questionnaires.",
          });
        } else {
          setDue([]);
          setHistory([]);
          setNotice({
            variant: "warning",
            title: "Offline",
            message: "Offline — no saved questionnaires are available yet.",
          });
        }

        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      try {
        const [liveDue, liveHistory] = await Promise.all([
          getDueProms(auth.token, 20),
          getPromHistory(auth.token, 20),
        ]);

        setDue(liveDue);
        setHistory(liveHistory);
        await setCachedProms(patientId, {
          dueCards: liveDue,
          historyRows: liveHistory,
        });
        await promsRefresh.refreshLocal();
        await promsLoadError.clear();
      } catch (error) {
        const friendly = toFriendlyError(error, "Couldn’t load questionnaires");
        await promsLoadError.setLocalError({
          title: friendly.title,
          message: friendly.message,
          kind: friendly.kind,
          retryable: friendly.retryable,
        });

        const cached = await getCachedProms(patientId);
        if (cached) {
          setDue(cached.dueCards);
          setHistory(cached.historyRows);
          setNotice({
            variant: "warning",
            title: friendly.title,
            message: "Showing saved questionnaires. Live refresh failed.",
            actionLabel: friendly.retryable ? "Retry" : undefined,
            onAction: friendly.retryable
              ? () => {
                  void loadProms("refresh");
                }
              : undefined,
          });
        } else {
          setDue([]);
          setHistory([]);
          setNotice({
            variant: "error",
            title: friendly.title,
            message: friendly.message,
            actionLabel: friendly.retryable ? "Retry" : undefined,
            onAction: friendly.retryable
              ? () => {
                  void loadProms("refresh");
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
      auth.token,
      isOffline,
      loadPending,
      patientId,
      promsLoadError,
      promsRefresh,
    ]
  );

  useFocusEffect(
    useCallback(() => {
      if (auth.status !== "signedIn") {
        return;
      }
      void loadProms("initial");
      return undefined;
    }, [auth.status, loadProms])
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
        message: "You’re offline. Pending submissions cannot be sent yet.",
      });
      return;
    }

    setIsSubmittingPending(true);
    setNotice(null);

    let submitted = 0;
    for (const entry of pending) {
      try {
        await submitProm(auth.token, entry.promId, entry.answers);
        await removePendingPromSubmission(patientId, entry.localId);
        submitted += 1;
      } catch (error) {
        const friendly = toFriendlyError(error, "Couldn’t submit pending questionnaires");
        await promSubmitError.setLocalError({
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
              ? `Submitted ${submitted} item(s). ${friendly.message}`
              : friendly.message,
        });
        setIsSubmittingPending(false);
        await loadPending();
        return;
      }
    }

    await promSubmitError.clear();
    await promsRefresh.refreshLocal();
    await loadPending();
    await loadProms("refresh");
    setNotice({
      variant: "info",
      title: "Pending submitted",
      message: "All pending questionnaires were submitted.",
    });
    setIsSubmittingPending(false);
  }, [
    auth.token,
    isOffline,
    loadPending,
    loadProms,
    patientId,
    pending,
    promSubmitError,
    promsRefresh,
    router,
  ]);

  if (auth.status === "loading") {
    return (
      <Screen title="Questionnaires">
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
    <Screen title="Questionnaires">
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void loadProms("refresh");
            }}
          />
        }
      >
        <LastRefreshed value={promsRefresh.label} />
        <LastFailedAttempt
          value={promsLoadError.label}
          title={promsLoadError.lastError?.title}
          message={promsLoadError.lastError?.message}
          onClear={promsLoadError.lastError ? promsLoadError.clear : undefined}
        />
        <LastFailedAttempt
          label="Last submit issue"
          value={promSubmitError.label}
          title={promSubmitError.lastError?.title}
          message={promSubmitError.lastError?.message}
          onClear={promSubmitError.lastError ? promSubmitError.clear : undefined}
        />

        <Section title="Pending submissions">
          <Text style={styles.metaText}>
            Pending uploads: {pending.length}
          </Text>
          <PrimaryButton
            label={isSubmittingPending ? "Submitting…" : "Submit pending"}
            loading={isSubmittingPending}
            disabled={pending.length === 0 || isSubmittingPending || isOffline}
            onPress={() => {
              void submitPending();
            }}
          />
        </Section>

        {isOffline ? (
          <InlineNotice
            variant="warning"
            title="Offline"
            message="Offline — showing saved questionnaires when available."
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
        ) : (
          <>
            <Section title="Due">
              {due.length === 0 ? (
                <Text style={styles.metaText}>No questionnaires due.</Text>
              ) : (
                <View style={styles.list}>
                  {due.map((item) => (
                    <Pressable
                      key={item.id}
                      style={({ pressed }) => [
                        styles.card,
                        pressed ? styles.cardPressed : null,
                      ]}
                      onPress={() => {
                        router.push({
                          pathname: "/prom-fill" as never,
                          params: { promId: item.id },
                        });
                      }}
                    >
                      <Text style={styles.cardTitle}>{item.title}</Text>
                      <Text style={styles.cardMeta}>Due: {formatDateTime(item.dueAt)}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </Section>

            <Section title="Completed">
              {history.length === 0 ? (
                <Text style={styles.metaText}>No completed questionnaires yet.</Text>
              ) : (
                <View style={styles.list}>
                  {history.map((item) => (
                    <View key={item.id} style={styles.card}>
                      <Text style={styles.cardTitle}>{item.title}</Text>
                      <Text style={styles.cardMeta}>
                        Completed: {formatDateTime(item.completedAt)}
                      </Text>
                      <Text style={styles.cardMeta}>
                        Score:{" "}
                        {item.score
                          ? `${item.score.normalized} (${item.score.bandLabel})`
                          : "--"}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </Section>
          </>
        )}
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
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  metaText: {
    fontSize: 13,
    color: "#4b5563",
    lineHeight: 18,
  },
  list: {
    gap: 10,
  },
  card: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#ffffff",
    gap: 4,
  },
  cardPressed: {
    opacity: 0.85,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  cardMeta: {
    fontSize: 13,
    color: "#4b5563",
  },
});
