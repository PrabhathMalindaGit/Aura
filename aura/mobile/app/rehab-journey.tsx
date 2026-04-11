import { Redirect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { isApiError, type ApiError } from "@/src/api/client";
import { getRehabPhases, type RehabPayload, type RehabPhase } from "@/src/api/patient";
import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
import { Card } from "@/src/components/Card";
import { DomainIcon } from "@/src/components/IconSet";
import { EmptyState } from "@/src/components/EmptyState";
import { HeroHeader } from "@/src/components/HeroHeader";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { MediaCard } from "@/src/components/MediaCard";
import { Screen } from "@/src/components/Screen";
import { StatusPill } from "@/src/components/StatusPill";
import { TrackerTile } from "@/src/components/TrackerTile";
import { useAuth } from "@/src/state/auth";
import { getCachedRehabPhases, setCachedRehabPhases } from "@/src/state/rehabPhasesCache";
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

function getCurrentPhase(rehab: RehabPayload | null): RehabPhase | null {
  if (!rehab || rehab.phases.length === 0) {
    return null;
  }

  return (
    rehab.phases.find((phase) => phase.key === rehab.currentKey) ??
    rehab.phases.find((phase) => phase.status === "current") ??
    null
  );
}

function getNextPhase(rehab: RehabPayload | null): RehabPhase | null {
  if (!rehab || rehab.phases.length === 0) {
    return null;
  }

  const sorted = [...rehab.phases].sort((left, right) => left.order - right.order);
  const current = getCurrentPhase(rehab);
  if (!current) {
    return sorted.find((phase) => phase.status === "locked") ?? null;
  }

  return sorted.find((phase) => phase.order > current.order) ?? null;
}

function toBannerVariant(value: NoticeState["variant"]): "info" | "warning" | "danger" {
  return value === "error" ? "danger" : value;
}

function phaseStatusLabel(phase: RehabPhase): string {
  if (phase.status === "done") {
    return "Done";
  }
  if (phase.status === "current") {
    return "Current";
  }
  return "Locked";
}

function phaseSupportText(phase: RehabPhase): string {
  if (phase.status === "done") {
    return phase.completedAt
      ? `Completed ${formatISOToHuman(phase.completedAt)}`
      : "Completed and ready for reference";
  }

  if (phase.status === "current") {
    return phase.startedAt
      ? `Current focus since ${formatISOToHuman(phase.startedAt)}`
      : "Current focus in your recovery plan";
  }

  return "This stage opens after the earlier phase is completed.";
}

export default function RehabJourneyScreen() {
  const auth = useAuth();
  const router = useRouter();
  const isOffline = useIsOffline();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const rehabRefresh = useLastRefreshed("rehabPhases");
  const rehabLoadError = useLastError("rehabPhasesLoad");

  const patientId = auth.patient?.id ?? "";
  const patientName = auth.patient?.displayName ?? auth.patient?.id ?? "Patient";
  const [rehab, setRehab] = useState<RehabPayload | null>(null);
  const [source, setSource] = useState<LoadSource>("none");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

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
    [auth.token, isOffline, patientId, rehabLoadError, rehabRefresh],
  );

  useFocusEffect(
    useCallback(() => {
      if (auth.status !== "signedIn") {
        return;
      }
      void loadRehab("initial");
      return undefined;
    }, [auth.status, loadRehab]),
  );

  if (auth.status === "loading") {
    return (
      <Screen scroll={false}>
        <View style={styles.centeredFull}>
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
  const currentPhase = getCurrentPhase(rehab);
  const nextPhase = getNextPhase(rehab);
  const doneCount = phases.filter((phase) => phase.status === "done").length;
  const lockedCount = phases.filter((phase) => phase.status === "locked").length;
  const progressRatio = phases.length > 0 ? doneCount / phases.length : 0;

  const listHeader = (
    <View style={styles.headerStack}>
      {false ? (
        <Card variant="outlined" padding={tokens.spacing.md}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Toggle diagnostics"
            onPress={() => {
              setShowDiagnostics((current) => !current);
            }}
            style={({ pressed }) => [styles.diagToggle, pressed ? styles.pressed : null]}
          >
            <View style={styles.diagTitleRow}>
              <View accessible={false} importantForAccessibility="no">
                <DomainIcon icon="info" tone="muted" accessibilityLabel="Diagnostics icon" />
              </View>
              <Text style={styles.diagTitle}>Diagnostics (dev)</Text>
            </View>
            <StatusPill label={showDiagnostics ? "Open" : "Closed"} variant="neutral" accessible={false} />
          </Pressable>
          {showDiagnostics ? (
            <View style={styles.diagContent}>
              <LastRefreshed value={rehabRefresh.label} compact />
              <LastFailedAttempt
                value={rehabLoadError.label}
                title={rehabLoadError.lastError?.title}
                message={rehabLoadError.lastError?.message}
                onClear={rehabLoadError.lastError ? rehabLoadError.clear : undefined}
                compact
              />
            </View>
          ) : null}
        </Card>
      ) : null}

      {isOffline ? (
        <Banner
          variant="warning"
          title="Offline"
          message="Offline — showing saved journey when available."
        />
      ) : null}

      {source === "cache" && !isOffline ? (
        <Banner
          variant="info"
          title="Saved data"
          message="Showing saved journey while live refresh is unavailable."
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

      <Card variant="outlined" padding={tokens.spacing.md} style={styles.storyCard}>
        <Text style={styles.storyEyebrow}>Recovery path</Text>
        <Text style={styles.storyTitle}>
          {currentPhase
            ? `You’re currently in ${currentPhase.title}`
            : phases.length > 0
              ? "Your recovery pathway is ready"
              : "Your recovery pathway will appear here"}
        </Text>
        <Text style={styles.storyText}>
          {currentPhase && nextPhase
            ? `Keep working through this stage. Next up is ${nextPhase.title}.`
            : currentPhase
              ? "Keep focusing on your current stage. Your next phase will unlock as you progress."
              : phases.length > 0
                ? "Your care team has outlined the phases in your recovery pathway."
                : "Your clinician will set your rehab phases here once your plan is ready."}
        </Text>
      </Card>

      <View style={styles.pillRow}>
        <StatusPill label={phaseLabel !== "Not set" ? phaseLabel : "Phase not set"} variant="info" />
        <StatusPill
          label={source === "live" ? "Live" : source === "cache" ? "Saved" : "Not set"}
          variant={source === "live" ? "success" : source === "cache" ? "info" : "neutral"}
        />
        {isOffline ? <StatusPill label="Offline" variant="warning" /> : null}
      </View>

      <MediaCard
        leading={{
          type: "icon",
          icon: currentPhase ? "rehabJourney" : "info",
          tone: currentPhase ? "accent" : "muted",
        }}
        title={currentPhase?.title ?? "Current phase not set"}
        subtitle={
          currentPhase
            ? phaseSupportText(currentPhase)
            : rehab?.updatedAt
              ? `Plan updated ${formatISOToHuman(rehab.updatedAt)}`
              : "Your clinician will outline the next stage here."
        }
        chips={[
          nextPhase ? { text: `Next: ${nextPhase.title}`, tone: "info" as const } : { text: "Pathway overview", tone: "muted" as const },
          ...(rehab?.updatedAt ? [{ text: `Updated ${formatISOToHuman(rehab.updatedAt)}`, tone: "muted" as const }] : []),
        ].slice(0, 3)}
        variant={currentPhase ? "emphasis" : "default"}
      />

      <View style={styles.trackerRow}>
        <View style={styles.trackerWrap}>
          <TrackerTile
            variant="compact"
            icon="rehabJourney"
            tone="accent"
            label="Phases"
            value={`${doneCount}/${phases.length || 0}`}
            delta="Completed"
            micro={{ type: "ring", progress: progressRatio }}
          />
        </View>
        <View style={styles.trackerWrap}>
          <TrackerTile
            variant="compact"
            icon={lockedCount > 0 ? "rehabJourney" : "success"}
            tone={lockedCount > 0 ? "warning" : "success"}
            label="Next steps"
            value={lockedCount > 0 ? `${lockedCount}` : "Open"}
            delta={lockedCount > 0 ? "Stages ahead" : "All visible"}
            micro={{ type: "dots", values: lockedCount > 0 ? [1, 1, 0, 0, 0, 0, 0] : [1, 1, 1, 1, 1, 1, 1] }}
          />
        </View>
      </View>

      <Card variant="outlined" padding={tokens.spacing.md} style={styles.sectionIntroCard}>
        <Text style={styles.sectionEyebrow}>Pathway overview</Text>
        <Text style={styles.sectionTitle}>See where you are now and what comes next</Text>
        <Text style={styles.sectionText}>
          Review the current stage first, then use the full pathway below for the bigger recovery picture.
        </Text>
      </Card>
    </View>
  );

  return (
    <Screen
      scroll={false}
      header={
        <HeroHeader
          variant="compact"
          title="Rehab journey"
          subtitle={currentPhase ? `Current phase · ${currentPhase.title}` : "Your guided recovery pathway"}
          left={
            <Avatar
              size={40}
              name={patientName}
              fallback="icon"
              iconKey="rehabJourney"
              ring={isOffline ? "attention" : "none"}
            />
          }
          rightActions={[
            {
              icon: "safety",
              tone: "warning",
              accessibilityLabel: "Open Safety support",
              onPress: () => {
                router.push("/safety" as never);
              },
            },
            {
              icon: "progress",
              tone: "muted",
              accessibilityLabel: "Open Progress",
              onPress: () => {
                router.push("/(tabs)/progress" as never);
              },
            },
          ]}
        >
          <View style={styles.headerPills}>
            <StatusPill label={`${doneCount}/${phases.length || 0} completed`} variant="success" />
            {nextPhase ? <StatusPill label={`Next: ${nextPhase.title}`} variant="info" /> : null}
            <StatusPill label={isOffline ? "Offline" : "Up to date"} variant={isOffline ? "warning" : "neutral"} />
          </View>
        </HeroHeader>
      }
    >
      <FlatList
        data={phases}
        keyExtractor={(phase) => phase.key}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void loadRehab("refresh");
            }}
          />
        }
        ListHeaderComponent={listHeader}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const statusLabel = phaseStatusLabel(item);
          const phaseChipTone: "success" | "muted" | "info" =
            item.status === "done" ? "success" : "muted";

          return (
            <View style={styles.phaseItemWrap}>
              <MediaCard
                variant={item.status === "current" ? "emphasis" : "default"}
                leading={{
                  type: "icon",
                  icon:
                    item.status === "done"
                      ? "success"
                      : item.status === "current"
                        ? "rehabJourney"
                        : "info",
                  tone:
                    item.status === "done"
                      ? "success"
                      : item.status === "current"
                        ? "accent"
                        : "muted",
                }}
                title={item.title}
                subtitle={item.description ?? phaseSupportText(item)}
                statusPill={{
                  text: statusLabel,
                  tone:
                    item.status === "done"
                      ? "success"
                      : item.status === "current"
                        ? "warning"
                        : "info",
                }}
                chips={[
                  {
                    text:
                      item.status === "current"
                        ? "Focus now"
                        : item.status === "done"
                          ? "Completed"
                          : "Coming up",
                    tone: (item.status === "current" ? "info" : phaseChipTone) as "info" | "success" | "muted",
                  },
                  ...(item.status === "done" && item.completedAt
                    ? [{ text: `Completed ${formatISOToHuman(item.completedAt)}`, tone: "info" as const }]
                    : item.status === "current" && item.startedAt
                      ? [{ text: `Started ${formatISOToHuman(item.startedAt)}`, tone: "muted" as const }]
                      : []),
                ].slice(0, 3)}
                showChevron={false}
              />
            </View>
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="small" />
            </View>
          ) : (
            <EmptyState
              variant="compact"
              illustrationKey={isOffline ? "offline" : "today"}
              title="No rehab pathway yet"
              description="Your clinician will outline your recovery stages here when the plan is ready."
              ctaLabel="Retry"
              onCtaPress={() => {
                void loadRehab("refresh");
              }}
            />
          )
        }
        ListFooterComponent={
          <Text style={styles.footerText}>
            If pain increases sharply or you feel unsafe, use Check-in or open Safety support right away.
          </Text>
        }
      />
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    centeredFull: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    centered: {
      minHeight: 140,
      alignItems: "center",
      justifyContent: "center",
    },
    listContent: {
      paddingBottom: tokens.spacing.xl,
      gap: tokens.spacing.sm,
    },
    headerPills: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    headerStack: {
      gap: tokens.spacing.md,
      marginBottom: tokens.spacing.md,
    },
    storyCard: {
      gap: tokens.spacing.xs,
    },
    storyEyebrow: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    storyTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    storyText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    pillRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    diagToggle: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    diagTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
    },
    diagTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    diagContent: {
      marginTop: tokens.spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: tokens.colors.border,
      paddingTop: tokens.spacing.sm,
      gap: tokens.spacing.xs,
    },
    pressed: {
      opacity: 0.85,
    },
    trackerRow: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
    },
    trackerWrap: {
      flex: 1,
      minWidth: 0,
    },
    sectionIntroCard: {
      gap: tokens.spacing.xs,
    },
    sectionEyebrow: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    sectionTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    sectionText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    phaseItemWrap: {
      marginBottom: tokens.spacing.sm,
    },
    footerText: {
      marginTop: tokens.spacing.sm,
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
  });
}
