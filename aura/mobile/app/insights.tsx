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
import { getApprovedInsights, type ApprovedInsight } from "@/src/api/patient";
import { InlineNotice } from "@/src/components/InlineNotice";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { Section } from "@/src/components/Section";
import { useAuth } from "@/src/state/auth";
import { getCachedInsights, setCachedInsights } from "@/src/state/insightsCache";
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
      title: "Couldn’t load insights",
      message: "You’re offline. Nothing was loaded.",
      kind: "offline",
      retryable: true,
    };
  }
  if (appError.kind === "network") {
    return {
      title: "Couldn’t load insights",
      message: "Couldn’t reach the service. Please try again.",
      kind: "network",
      retryable: true,
    };
  }
  if (appError.kind === "server") {
    return {
      title: "Couldn’t load insights",
      message: "Service unavailable. Please try again shortly.",
      kind: "server",
      retryable: true,
    };
  }
  if (appError.kind === "validation") {
    return {
      title: "Couldn’t load insights",
      message: appError.message || "Request could not be processed.",
      kind: "validation",
      retryable: false,
    };
  }
  return {
    title: "Couldn’t load insights",
    message: appError.message || "Please try again.",
    kind: "unknown",
    retryable: true,
  };
}

function categoryLabel(category: ApprovedInsight["category"]): string {
  if (category === "questionnaires") {
    return "Questionnaires";
  }
  if (category === "recovery") {
    return "Recovery";
  }
  if (category === "adherence") {
    return "Adherence";
  }
  if (category === "safety") {
    return "Safety";
  }
  if (category === "symptoms") {
    return "Symptoms";
  }
  return "Habits";
}

export default function InsightsScreen() {
  const auth = useAuth();
  const isOffline = useIsOffline();
  const insightsRefresh = useLastRefreshed("insights");
  const insightsLoadError = useLastError("insightsLoad");

  const patientId = auth.patient?.id ?? "";
  const [items, setItems] = useState<ApprovedInsight[]>([]);
  const [source, setSource] = useState<LoadSource>("none");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const loadInsights = useCallback(
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
        const cached = await getCachedInsights(patientId);
        if (cached) {
          setItems(cached.items);
          setSource("cache");
          setNotice({
            variant: "warning",
            title: "Offline",
            message: "Offline — showing saved approved insights.",
          });
        } else {
          setItems([]);
          setSource("none");
          setNotice({
            variant: "warning",
            title: "Offline",
            message: "Offline — no saved approved insights are available yet.",
          });
        }
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      try {
        const live = await getApprovedInsights(auth.token, 20);
        setItems(live);
        setSource("live");
        await setCachedInsights(patientId, live);
        await insightsRefresh.refreshLocal();
        await insightsLoadError.clear();
      } catch (error) {
        const friendly = toFriendlyError(error);
        await insightsLoadError.setLocalError({
          title: friendly.title,
          message: friendly.message,
          kind: friendly.kind,
          retryable: friendly.retryable,
        });

        const cached = await getCachedInsights(patientId);
        if (cached) {
          setItems(cached.items);
          setSource("cache");
          setNotice({
            variant: "warning",
            title: friendly.title,
            message: "Showing saved approved insights. Live refresh failed.",
            actionLabel: friendly.retryable ? "Retry" : undefined,
            onAction: friendly.retryable
              ? () => {
                  void loadInsights("refresh");
                }
              : undefined,
          });
        } else {
          setItems([]);
          setSource("none");
          setNotice({
            variant: "error",
            title: friendly.title,
            message: friendly.message,
            actionLabel: friendly.retryable ? "Retry" : undefined,
            onAction: friendly.retryable
              ? () => {
                  void loadInsights("refresh");
                }
              : undefined,
          });
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [auth.token, insightsLoadError, insightsRefresh, isOffline, patientId]
  );

  useFocusEffect(
    useCallback(() => {
      if (auth.status !== "signedIn") {
        return;
      }
      void loadInsights("initial");
      return undefined;
    }, [auth.status, loadInsights])
  );

  if (auth.status === "loading") {
    return (
      <Screen title="Insights">
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
    <Screen title="Insights">
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void loadInsights("refresh");
            }}
          />
        }
      >
        <LastRefreshed value={insightsRefresh.label} />
        <LastFailedAttempt
          value={insightsLoadError.label}
          title={insightsLoadError.lastError?.title}
          message={insightsLoadError.lastError?.message}
          onClear={insightsLoadError.lastError ? insightsLoadError.clear : undefined}
        />

        {isOffline ? (
          <InlineNotice
            variant="warning"
            title="Offline"
            message="Offline — showing saved approved insights when available."
          />
        ) : null}

        {source === "cache" && !isOffline ? (
          <InlineNotice
            variant="warning"
            title="Showing saved data"
            message="Live refresh failed, so this screen is using cached approved insights."
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

        <Section title="Approved insight cards">
          {isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="small" />
            </View>
          ) : items.length === 0 ? (
            <Text style={styles.mutedText}>No reviewed insights yet.</Text>
          ) : (
            items.map((insight) => (
              <View key={insight.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.category}>{categoryLabel(insight.category)}</Text>
                  <Text style={styles.meta}>Priority {insight.priority}</Text>
                </View>
                <Text style={styles.title}>{insight.title}</Text>
                <Text style={styles.message}>{insight.message}</Text>
                <Text style={styles.meta}>
                  Confidence: {insight.confidence} · Created {formatISOToHuman(insight.createdAt)}
                </Text>
              </View>
            ))
          )}
        </Section>

        <PrimaryButton
          label="Refresh insights"
          disabled={isRefreshing}
          onPress={() => {
            void loadInsights("refresh");
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
  mutedText: {
    fontSize: 13,
    color: "#6b7280",
  },
  card: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fff",
    gap: 6,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  category: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  message: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  meta: {
    fontSize: 12,
    color: "#6b7280",
  },
});
