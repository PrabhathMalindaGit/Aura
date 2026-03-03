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
import { getApprovedInsights, type ApprovedInsight } from "@/src/api/patient";
import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
import { EmptyState } from "@/src/components/EmptyState";
import { HeroHeader } from "@/src/components/HeroHeader";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { MediaCard } from "@/src/components/MediaCard";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { SegmentedControl } from "@/src/components/SegmentedControl";
import { useAuth } from "@/src/state/auth";
import { getCachedInsights, setCachedInsights } from "@/src/state/insightsCache";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { useLastRefreshed } from "@/src/state/refresh";
import { useTokens } from "@/src/theme/tokens";
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

function categoryIcon(category: ApprovedInsight["category"]) {
  if (category === "questionnaires") {
    return "proms" as const;
  }
  if (category === "recovery") {
    return "exercise" as const;
  }
  if (category === "adherence") {
    return "checkin" as const;
  }
  if (category === "safety") {
    return "safety" as const;
  }
  if (category === "symptoms") {
    return "insights" as const;
  }
  return "nutrition" as const;
}

function toBannerVariant(variant: NoticeState["variant"]): "info" | "warning" | "danger" {
  if (variant === "error") {
    return "danger";
  }
  return variant;
}

export default function InsightsScreen() {
  const router = useRouter();
  const auth = useAuth();
  const isOffline = useIsOffline();
  const insightsRefresh = useLastRefreshed("insights");
  const insightsLoadError = useLastError("insightsLoad");
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const patientId = auth.patient?.id ?? "";
  const [items, setItems] = useState<ApprovedInsight[]>([]);
  const [source, setSource] = useState<LoadSource>("none");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [showDevDiagnostics, setShowDevDiagnostics] = useState(false);
  const [segment, setSegment] = useState<"approved" | "priority">("approved");

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

  const filteredItems = useMemo(() => {
    if (segment === "priority") {
      return items.filter((insight) => insight.priority >= 2);
    }
    return items;
  }, [items, segment]);

  const latestItem = items[0];

  if (auth.status === "loading") {
    return (
      <Screen
        scroll={false}
        header={
          <HeroHeader
            variant="compact"
            title="Insights"
            subtitle="Loading"
            left={<Avatar size={40} name={auth.patient?.displayName ?? "Patient"} fallback="icon" iconKey="insights" />}
          />
        }
      >
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
    <Screen
      scroll={false}
      header={
        <HeroHeader
          variant="compact"
          title="Insights"
          subtitle={
            source === "live"
              ? "Clinician-approved guidance"
              : source === "cache"
                ? "Saved approved guidance"
                : "Guidance"
          }
          left={
            <Avatar
              size={40}
              name={auth.patient?.displayName ?? "Patient"}
              fallback="icon"
              iconKey="insights"
              ring={isOffline ? "attention" : "none"}
            />
          }
          rightActions={[
            {
              icon: "home",
              tone: "muted",
              accessibilityLabel: "Back to Home",
              onPress: () => router.push("/(tabs)" as never),
            },
            {
              icon: "safety",
              tone: "warning",
              accessibilityLabel: "Open Safety support",
              onPress: () => router.push("/safety" as never),
            },
          ]}
        />
      }
    >
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void loadInsights("refresh");
            }}
          />
        }
        renderItem={({ item }) => (
          <MediaCard
            leading={{ type: "icon", icon: categoryIcon(item.category), tone: "accent" }}
            title={item.title}
            subtitle={item.message}
            chips={[
              { text: categoryLabel(item.category), tone: "muted" },
              {
                text: `Confidence ${item.confidence}`,
                tone: item.confidence === "high" ? "success" : "info",
              },
              { text: formatISOToHuman(item.createdAt), tone: "muted" },
            ]}
            statusPill={{
              text: item.priority >= 3 ? "Priority" : "Approved",
              tone: item.priority >= 3 ? "warning" : "success",
            }}
          />
        )}
        ListHeaderComponent={
          <View style={styles.stack}>
            {__DEV__ ? (
              <View style={styles.devBlock}>
                <SecondaryButton
                  label={showDevDiagnostics ? "Hide diagnostics" : "Diagnostics (dev)"}
                  onPress={() => {
                    setShowDevDiagnostics((current) => !current);
                  }}
                />
                {showDevDiagnostics ? (
                  <View style={styles.devMetaWrap}>
                    <LastRefreshed value={insightsRefresh.label} compact />
                    <LastFailedAttempt
                      value={insightsLoadError.label}
                      title={insightsLoadError.lastError?.title}
                      message={insightsLoadError.lastError?.message}
                      onClear={insightsLoadError.lastError ? insightsLoadError.clear : undefined}
                      compact
                    />
                  </View>
                ) : null}
              </View>
            ) : null}

            {isOffline ? (
              <Banner
                variant="warning"
                title="Offline"
                message="Offline — showing saved approved insights when available."
              />
            ) : null}

            {source === "cache" && !isOffline ? (
              <Banner
                variant="warning"
                title="Showing saved data"
                message="Live refresh failed, so this screen is using cached approved insights."
              />
            ) : null}

            {notice ? (
              <Banner
                variant={toBannerVariant(notice.variant)}
                title={notice.title}
                message={notice.message}
                actionLabel={notice.actionLabel}
                onAction={notice.onAction}
              />
            ) : null}

            <SegmentedControl
              value={segment}
              onChange={(next) => {
                setSegment(next);
              }}
              options={[
                { value: "approved", label: "Approved", icon: "insights" },
                { value: "priority", label: "Priority", icon: "warning" },
              ]}
              accessibilityLabel="Insights filter"
            />

            <View style={styles.summaryRow}>
              <View style={styles.summaryCol}>
                <MediaCard
                  variant="compact"
                  leading={{ type: "icon", icon: "success", tone: "success" }}
                  title={`${items.length}`}
                  subtitle="Approved insights"
                  onPress={() => {
                    setSegment("approved");
                  }}
                />
              </View>
              <View style={styles.summaryCol}>
                <MediaCard
                  variant="compact"
                  leading={{ type: "icon", icon: "weekly", tone: "muted" }}
                  title={latestItem ? formatISOToHuman(latestItem.createdAt) : "—"}
                  subtitle="Last updated"
                />
              </View>
            </View>

            {isLoading ? (
              <View style={styles.centered}>
                <ActivityIndicator size="small" />
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState
              illustrationKey="today"
              title={segment === "priority" ? "No priority insights" : "No reviewed insights"}
              description="Refresh when online to check for new clinician-reviewed guidance."
              ctaLabel="Refresh insights"
              onCtaPress={() => {
                void loadInsights("refresh");
              }}
            />
          )
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <PrimaryButton
              label="Refresh insights"
              disabled={isRefreshing}
              loading={isRefreshing}
              onPress={() => {
                void loadInsights("refresh");
              }}
            />
          </View>
        }
      />
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      gap: tokens.spacing.md,
      paddingBottom: tokens.spacing.xxxl,
    },
    stack: {
      gap: tokens.spacing.md,
    },
    centered: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 120,
    },
    devBlock: {
      gap: tokens.spacing.sm,
      padding: tokens.spacing.sm,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.surfaceElevated,
    },
    devMetaWrap: {
      gap: tokens.spacing.xs,
    },
    summaryRow: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
    },
    summaryCol: {
      flex: 1,
      minWidth: 0,
    },
    footer: {
      paddingTop: tokens.spacing.xs,
      paddingBottom: tokens.spacing.md,
    },
  });
}
