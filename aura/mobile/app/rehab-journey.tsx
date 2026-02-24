import { Redirect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { isApiError, type ApiError } from "@/src/api/client";
import { getRehabPhases, type RehabPayload } from "@/src/api/patient";
import { InlineNotice } from "@/src/components/InlineNotice";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { Section } from "@/src/components/Section";
import { useAuth } from "@/src/state/auth";
import {
  getCachedRehabPhases,
  setCachedRehabPhases,
} from "@/src/state/rehabPhasesCache";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { useLastRefreshed } from "@/src/state/refresh";
import { formatISOToHuman } from "@/src/utils/date";
import { normalizeUnknownError } from "@/src/utils/errors";

type LoadSource = "live" | "cache" | "none";

type NoticeState = {
  variant: "info" | "warning" | "error";
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

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
      title: "Couldn’t load rehab journey",
      message: "You’re offline. Nothing was loaded.",
      kind: "offline",
      retryable: true,
    };
  }

  if (appError.kind === "network") {
    return {
      title: "Couldn’t load rehab journey",
      message: "Couldn’t reach the service. Please try again.",
      kind: "network",
      retryable: true,
    };
  }

  if (appError.kind === "server") {
    return {
      title: "Couldn’t load rehab journey",
      message: "Service unavailable. Please try again shortly.",
      kind: "server",
      retryable: true,
    };
  }

  if (appError.kind === "validation") {
    return {
      title: "Couldn’t load rehab journey",
      message: appError.message || "Request could not be processed.",
      kind: "validation",
      retryable: false,
    };
  }

  return {
    title: "Couldn’t load rehab journey",
    message: appError.message || "Please try again.",
    kind: "unknown",
    retryable: true,
  };
}

function currentPhaseLabel(rehab: RehabPayload | null): string {
  if (!rehab || rehab.phases.length === 0) {
    return "Not set";
  }

  const current =
    rehab.phases.find((phase) => phase.key === rehab.currentKey) ??
    rehab.phases.find((phase) => phase.status === "current") ??
    null;

  return current?.title ?? "Not set";
}

export default function RehabJourneyScreen() {
  const auth = useAuth();
  const isOffline = useIsOffline();
  const rehabRefresh = useLastRefreshed("rehabPhases");
  const rehabLoadError = useLastError("rehabPhasesLoad");

  const patientId = auth.patient?.id ?? "";
  const [rehab, setRehab] = useState<RehabPayload | null>(null);
  const [source, setSource] = useState<LoadSource>("none");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const loadRehab = useCallback(
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
        const cached = await getCachedRehabPhases(patientId);
        if (cached) {
          setRehab(cached.rehab);
          setSource("cache");
          setNotice({
            variant: "warning",
            title: "Offline",
            message: "Offline — showing saved journey.",
          });
        } else {
          setRehab(null);
          setSource("none");
          setNotice({
            variant: "warning",
            title: "Offline",
            message: "Offline — no saved rehab journey is available yet.",
          });
        }

        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      try {
        const live = await getRehabPhases(auth.token);
        setRehab(live);
        setSource("live");
        await setCachedRehabPhases(patientId, live);
        await rehabRefresh.refreshLocal();
        await rehabLoadError.clear();
      } catch (error) {
        const friendly = toFriendlyError(error);
        await rehabLoadError.setLocalError({
          title: friendly.title,
          message: friendly.message,
          kind: friendly.kind,
          retryable: friendly.retryable,
        });

        const cached = await getCachedRehabPhases(patientId);
        if (cached) {
          setRehab(cached.rehab);
          setSource("cache");
          setNotice({
            variant: "warning",
            title: friendly.title,
            message: "Showing saved journey. Live refresh failed.",
            actionLabel: friendly.retryable ? "Retry" : undefined,
            onAction: friendly.retryable
              ? () => {
                  void loadRehab("refresh");
                }
              : undefined,
          });
        } else {
          setRehab(null);
          setSource("none");
          setNotice({
            variant: "error",
            title: friendly.title,
            message: friendly.message,
            actionLabel: friendly.retryable ? "Retry" : undefined,
            onAction: friendly.retryable
              ? () => {
                  void loadRehab("refresh");
                }
              : undefined,
          });
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [auth.token, isOffline, patientId, rehabLoadError, rehabRefresh]
  );

  useFocusEffect(
    useCallback(() => {
      if (auth.status !== "signedIn") {
        return;
      }
      void loadRehab("initial");
      return undefined;
    }, [auth.status, loadRehab])
  );

  if (auth.status === "loading") {
    return (
      <Screen title="Rehab journey">
        <View style={styles.centered}>
          <ActivityIndicator size="small" />
        </View>
      </Screen>
    );
  }

  if (auth.status === "signedOut") {
    return <Redirect href="/(auth)/login" />;
  }

  const phases = rehab?.phases ?? [];
  const phaseLabel = currentPhaseLabel(rehab);

  return (
    <Screen title="Rehab journey">
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void loadRehab("refresh");
            }}
          />
        }
      >
        <LastRefreshed value={rehabRefresh.label} />
        <LastFailedAttempt
          value={rehabLoadError.label}
          title={rehabLoadError.lastError?.title}
          message={rehabLoadError.lastError?.message}
          onClear={rehabLoadError.lastError ? rehabLoadError.clear : undefined}
        />

        {isOffline ? (
          <InlineNotice
            variant="warning"
            title="Offline"
            message="Offline — showing saved journey when available."
          />
        ) : null}

        {source === "cache" && !isOffline ? (
          <InlineNotice
            variant="info"
            title="Saved data"
            message="Showing saved journey while live refresh is unavailable."
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

        <Section title="Current phase">
          <Text style={styles.currentLabel}>{phaseLabel}</Text>
          {rehab?.updatedAt ? (
            <Text style={styles.metaText}>Updated {formatISOToHuman(rehab.updatedAt)}</Text>
          ) : null}
        </Section>

        {isLoading && !rehab ? (
          <View style={styles.centered}>
            <ActivityIndicator size="small" />
          </View>
        ) : phases.length === 0 ? (
          <Section title="Timeline">
            <Text style={styles.emptyText}>
              Your clinician will set your rehab plan soon.
            </Text>
            <PrimaryButton
              label="Retry"
              onPress={() => {
                void loadRehab("refresh");
              }}
            />
          </Section>
        ) : (
          <Section title="Timeline">
            <View style={styles.timelineList}>
              {phases.map((phase) => {
                const statusIcon =
                  phase.status === "done"
                    ? "✓"
                    : phase.status === "current"
                      ? "●"
                      : "🔒";

                return (
                  <View key={phase.key} style={styles.timelineItem}>
                    <Text style={styles.timelineIcon}>{statusIcon}</Text>
                    <View style={styles.timelineContent}>
                      <Text style={styles.timelineTitle}>{phase.title}</Text>
                      <Text style={styles.timelineStatus}>
                        {phase.status === "done"
                          ? "Done"
                          : phase.status === "current"
                            ? "Current"
                            : "Locked"}
                      </Text>
                      {phase.description ? (
                        <Text style={styles.timelineDescription}>{phase.description}</Text>
                      ) : null}
                      {phase.status === "done" && phase.completedAt ? (
                        <Text style={styles.timelineMeta}>
                          Completed {formatISOToHuman(phase.completedAt)}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          </Section>
        )}

        <Text style={styles.footerText}>
          If pain increases sharply or you feel unsafe, use Check-in or contact your clinician.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
    paddingBottom: 16,
  },
  centered: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  currentLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  metaText: {
    fontSize: 12,
    color: "#6b7280",
  },
  emptyText: {
    fontSize: 14,
    color: "#374151",
    marginBottom: 8,
  },
  timelineList: {
    gap: 10,
  },
  timelineItem: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    backgroundColor: "#ffffff",
    padding: 10,
  },
  timelineIcon: {
    fontSize: 18,
    lineHeight: 20,
    minWidth: 18,
    textAlign: "center",
  },
  timelineContent: {
    flex: 1,
    gap: 2,
  },
  timelineTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  timelineStatus: {
    fontSize: 12,
    color: "#1f2937",
    fontWeight: "600",
  },
  timelineDescription: {
    fontSize: 13,
    color: "#374151",
  },
  timelineMeta: {
    fontSize: 12,
    color: "#6b7280",
  },
  footerText: {
    fontSize: 12,
    color: "#6b7280",
  },
});
