import { Redirect, useRouter } from "expo-router";
import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionErrorEvent,
  type ExpoSpeechRecognitionResultEvent,
} from "expo-speech-recognition";
import React, { useCallback, useMemo, useState } from "react";
import { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import {
  deleteHydrationEntry,
  getHydrationToday,
  type HydrationEntry,
} from "@/src/api/patient";
import { isApiError, type ApiError } from "@/src/api/client";
import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
import { Card } from "@/src/components/Card";
import { EmptyState } from "@/src/components/EmptyState";
import { DomainIcon } from "@/src/components/IconSet";
import { HeroHeader } from "@/src/components/HeroHeader";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { MediaCard } from "@/src/components/MediaCard";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { ReadAloudButton } from "@/src/components/ReadAloudButton";
import { Screen } from "@/src/components/Screen";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { StatusPill } from "@/src/components/StatusPill";
import { TrackerTile } from "@/src/components/TrackerTile";
import { useAuth } from "@/src/state/auth";
import {
  getCachedHydrationDay,
  setCachedHydrationDay,
  setCachedHydrationToday,
} from "@/src/state/hydrationCache";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { useLastRefreshed } from "@/src/state/refresh";
import { getPendingItemCopy, getQueueableSyncSurface } from "@/src/sync/copy";
import { sendHydrationSync } from "@/src/sync/adapters/hydration";
import { createOperationId } from "@/src/sync/model";
import { flushPendingWrites, submitQueueableWrite } from "@/src/sync/runner";
import { selectPendingHydrationEntries, useSyncDomainSummary } from "@/src/sync/selectors";
import { removeSyncOperation, useSyncPatientState } from "@/src/sync/store";
import { useTokens } from "@/src/theme/tokens";
import { todayISO } from "@/src/utils/date";
import { normalizeUnknownError } from "@/src/utils/errors";
import { stopReadAloud } from "@/src/utils/readAloud";
import { parseVoiceHealthLogConfirmation } from "@/src/utils/voiceHealthLogConfirmation";

type NoticeState = {
  variant: "info" | "warning" | "error";
  title: string;
  message: string;
};

type TodayState = {
  date: string;
  totalMl: number;
  targetMl: number;
  entries: HydrationEntry[];
};

type HydrationQuickAddOutcome = {
  status: "logged" | "queued" | "validationBlocked" | "failed" | "ignored";
  message?: string;
};

type RenderableHydrationEntry = HydrationEntry & {
  syncStatus?: "queued" | "syncing" | "failed" | "blocked_offline";
  syncMessage?: string;
};

type VoiceHydrationLogState =
  | "draftReady"
  | "needsValue"
  | "reviewLog"
  | "awaitingVoiceConfirmation"
  | "confirmedLog"
  | "cancelled"
  | "logging"
  | "logged"
  | "offlineBlocked"
  | "validationBlocked"
  | "expired";

type VoiceHydrationSnapshot = {
  amountMl: 250 | 500 | 750;
  date: string;
  signature: string;
};

const SUPPORTED_VOICE_HYDRATION_AMOUNTS = [250, 500, 750] as const;

function toBannerVariant(variant: NoticeState["variant"]): "info" | "warning" | "danger" {
  return variant === "error" ? "danger" : variant;
}

function toFriendlyHydrationError(error: unknown, title: string): {
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
      message: "You’re offline. Entry saved locally and pending sync.",
      kind: "offline",
      retryable: true,
    };
  }
  if (appError.kind === "network") {
    return {
      title,
      message: "Couldn’t reach the server. Saved locally for sync.",
      kind: "network",
      retryable: true,
    };
  }
  if (appError.kind === "server") {
    return {
      title,
      message: "Server error. Try syncing again shortly.",
      kind: "server",
      retryable: true,
    };
  }
  if (appError.kind === "validation") {
    return {
      title,
      message: appError.message || "Invalid hydration entry.",
      kind: "validation",
      retryable: false,
    };
  }

  return {
    title,
    message: appError.message || "Something went wrong. Try again.",
    kind: "unknown",
    retryable: true,
  };
}

function formatTime(iso: string): string {
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) {
    return "Unknown time";
  }
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function toPendingHydrationEntry(entry: {
  localId: string;
  amountMl: number;
  createdAt: string;
  status: "queued" | "syncing" | "failed" | "blocked_offline";
  lastFailureMessage?: string;
}): RenderableHydrationEntry {
  return {
    id: entry.localId,
    amountMl: entry.amountMl,
    createdAt: entry.createdAt,
    pending: true,
    localId: entry.localId,
    syncStatus: entry.status,
    syncMessage: entry.lastFailureMessage,
  };
}

function toLastErrorKind(
  kind: "offline" | "network" | "server" | "validation" | "conflict" | "unknown"
): "offline" | "network" | "server" | "validation" | "unknown" {
  if (kind === "conflict") {
    return "validation";
  }
  return kind;
}

function isSupportedVoiceHydrationAmount(
  amountMl: number
): amountMl is VoiceHydrationSnapshot["amountMl"] {
  return SUPPORTED_VOICE_HYDRATION_AMOUNTS.includes(
    amountMl as VoiceHydrationSnapshot["amountMl"],
  );
}

function buildVoiceHydrationSignature(amountMl: number, date: string): string {
  return `${amountMl}:${date}`;
}

export default function HydrationScreen() {
  const auth = useAuth();
  const router = useRouter();
  const isOffline = useIsOffline();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const hydrationRefresh = useLastRefreshed("hydration");
  const hydrationLoadError = useLastError("hydrationLoad");
  const hydrationLogError = useLastError("hydrationLog");

  const [todayState, setTodayState] = useState<TodayState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const voiceHydrationExpiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceHydrationStateRef = useRef<VoiceHydrationLogState>("draftReady");
  const [voiceHydrationState, setVoiceHydrationState] =
    useState<VoiceHydrationLogState>("draftReady");
  const [voiceHydrationSnapshot, setVoiceHydrationSnapshot] =
    useState<VoiceHydrationSnapshot | null>(null);
  const [voiceHydrationMessage, setVoiceHydrationMessage] =
    useState<string | null>(null);
  const [isVoiceHydrationListening, setIsVoiceHydrationListening] = useState(false);

  const patientId = auth.patient?.id ?? "";
  const syncState = useSyncPatientState(patientId);
  const hydrationSyncSummary = useSyncDomainSummary(patientId, "hydration");
  const pendingEntries = useMemo(
    () => selectPendingHydrationEntries(syncState),
    [syncState]
  );
  const hydrationSyncSurface = useMemo(
    () => getQueueableSyncSurface(hydrationSyncSummary),
    [hydrationSyncSummary]
  );
  const today = useMemo(() => todayISO(), []);

  const pendingTodayEntries = useMemo(
    () => pendingEntries.filter((entry) => entry.date === today),
    [pendingEntries, today]
  );

  const mergedEntries = useMemo<RenderableHydrationEntry[]>(() => {
    const pendingMapped = pendingTodayEntries.map((entry) =>
      toPendingHydrationEntry(entry)
    );
    const serverEntries = todayState?.entries ?? [];
    return [...pendingMapped, ...serverEntries].sort(
      (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)
    );
  }, [pendingTodayEntries, todayState?.entries]);

  const totalTodayMl = useMemo(() => {
    const serverTotal = todayState?.totalMl ?? 0;
    const pendingTotal = pendingTodayEntries.reduce(
      (sum, entry) => sum + entry.amountMl,
      0
    );
    return serverTotal + pendingTotal;
  }, [pendingTodayEntries, todayState?.totalMl]);

  const targetMl = todayState?.targetMl ?? 2000;
  const progressPercent = Math.min(100, Math.round((totalTodayMl / targetMl) * 100));
  const progressRatio = targetMl > 0 ? Math.max(0, Math.min(1, totalTodayMl / targetMl)) : 0;
  const remainingMl = Math.max(0, targetMl - totalTodayMl);
  const hydrationStatusLabel =
    progressRatio >= 1 ? "Goal reached" : progressRatio >= 0.7 ? "On track" : "Keep sipping";
  const hydrationStatusTone =
    progressRatio >= 1 ? "success" : progressRatio >= 0.7 ? "info" : "warning";
  const hydrationStoryTitle =
    progressRatio >= 1
      ? "Today’s hydration is on target"
      : totalTodayMl > 0
        ? `${remainingMl} ml left to reach today’s goal`
        : "Start today’s hydration with one quick log";
  const hydrationStoryNote =
    progressRatio >= 1
      ? "You’ve reached today’s hydration target. Keep using the log if you want to capture additional water intake."
      : totalTodayMl > 0
        ? "Use quick add to keep today’s hydration moving steadily toward the target."
        : "Log the first glass when you’re ready. Today’s total and recent entries will build here.";

  const recentAmountSeries = useMemo(
    () =>
      mergedEntries
        .slice()
        .reverse()
        .slice(-7)
        .map((entry) => entry.amountMl)
        .filter((value) => Number.isFinite(value)),
    [mergedEntries]
  );

  const loadToday = useCallback(async () => {
    if (!auth.token || !patientId) {
      return;
    }
    setIsLoading(true);
    setNotice(null);

    if (isOffline) {
      const cached = await getCachedHydrationDay(patientId, today);
      if (cached) {
        setTodayState({
          date: cached.date,
          totalMl: cached.totalMl,
          targetMl: cached.targetMl,
          entries: cached.entries.filter((entry) => entry.pending !== true),
        });
      } else {
        setTodayState({
          date: today,
          totalMl: 0,
          targetMl: 2000,
          entries: [],
        });
      }
      setNotice({
        variant: "warning",
        title: "Offline",
        message: "Offline — hydration entries are queued and marked pending.",
      });
      setIsLoading(false);
      return;
    }

    try {
      const response = await getHydrationToday(auth.token, today);
      setTodayState({
        date: response.date,
        totalMl: response.totalMl,
        targetMl: response.targetMl,
        entries: response.entries,
      });
      await setCachedHydrationToday(patientId, response);
      await hydrationRefresh.refreshLocal();
      await hydrationLoadError.clear();
    } catch (error) {
      const friendly = toFriendlyHydrationError(error, "Couldn’t load hydration");
      await hydrationLoadError.setLocalError({
        title: friendly.title,
        message: friendly.message,
        kind: friendly.kind,
        retryable: friendly.retryable,
      });

      const cached = await getCachedHydrationDay(patientId, today);

      if (cached) {
        setTodayState({
          date: cached.date,
          totalMl: cached.totalMl,
          targetMl: cached.targetMl,
          entries: cached.entries.filter((entry) => entry.pending !== true),
        });
        setNotice({
          variant: "warning",
          title: friendly.title,
          message: "Showing saved hydration data.",
        });
      } else {
        setTodayState({
          date: today,
          totalMl: 0,
          targetMl: 2000,
          entries: [],
        });
        setNotice({
          variant: "error",
          title: friendly.title,
          message: friendly.message,
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    auth.token,
    hydrationLoadError,
    hydrationRefresh,
    isOffline,
    patientId,
    today,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (auth.status !== "signedIn") {
        return;
      }
      void loadToday();
      return undefined;
    }, [auth.status, loadToday])
  );

  const clearVoiceHydrationExpiryTimer = useCallback(() => {
    if (voiceHydrationExpiryTimerRef.current) {
      clearTimeout(voiceHydrationExpiryTimerRef.current);
      voiceHydrationExpiryTimerRef.current = null;
    }
  }, []);

  const updateVoiceHydrationState = useCallback((nextState: VoiceHydrationLogState) => {
    voiceHydrationStateRef.current = nextState;
    setVoiceHydrationState(nextState);
  }, []);

  const startVoiceHydrationExpiryTimer = useCallback(() => {
    clearVoiceHydrationExpiryTimer();
    voiceHydrationExpiryTimerRef.current = setTimeout(() => {
      setVoiceHydrationSnapshot(null);
      setIsVoiceHydrationListening(false);
      setVoiceHydrationMessage("Hydration voice log review expired. Review again before logging.");
      updateVoiceHydrationState("expired");
    }, 30_000);
  }, [clearVoiceHydrationExpiryTimer, updateVoiceHydrationState]);

  useEffect(
    () => () => {
      clearVoiceHydrationExpiryTimer();
    },
    [clearVoiceHydrationExpiryTimer],
  );

  const handleQuickAdd = useCallback(
    async (amountMl: number): Promise<HydrationQuickAddOutcome> => {
      if (!auth.token || !patientId) {
        return { status: "ignored" };
      }

      const payload = {
        date: today,
        amountMl,
        clientMutationId: createOperationId(),
      };

      try {
        const result = await submitQueueableWrite({
          patientId,
          token: auth.token,
          isOffline,
          domain: "hydration",
          payload,
          send: async (token, nextPayload) => {
            await sendHydrationSync(token, nextPayload);
            return true;
          },
        });

        if (result.kind === "synced") {
          await hydrationLogError.clear();
          await loadToday();
          setNotice({
            variant: "info",
            title: "Synced",
            message: `${amountMl} ml synced.`,
          });
          return { status: "logged", message: `${amountMl} ml synced.` };
        }

        const lastError = result.normalizedError;
        const title =
          result.operation.status === "failed"
            ? "Couldn’t sync"
            : "Saved on this device";
        const message =
          result.operation.status === "failed"
            ? "Saved on this device. Retry sync when you’re ready."
            : "Saved on this device. Sync when you’re back online.";

        await hydrationLogError.setLocalError({
          title,
          message: lastError?.message ?? message,
          kind: toLastErrorKind(lastError?.reason ?? "offline"),
          retryable: true,
        });
        setNotice({
          variant: "warning",
          title,
          message,
        });
        return { status: "queued", message };
      } catch (error) {
        const friendly = toFriendlyHydrationError(error, "Couldn’t save hydration");
        await hydrationLogError.setLocalError({
          title: friendly.title,
          message: friendly.message,
          kind: friendly.kind,
          retryable: friendly.retryable,
        });
        setNotice({
          variant: "error",
          title: friendly.title,
          message: friendly.message,
        });
        return {
          status: friendly.kind === "validation" ? "validationBlocked" : "failed",
          message: friendly.message,
        };
      }
    },
    [auth.token, hydrationLogError, isOffline, loadToday, patientId, today]
  );

  const handleSyncPending = useCallback(async () => {
    if (!auth.token || !patientId || isOffline || isSyncing) {
      return;
    }
    if (pendingEntries.length === 0) {
      return;
    }

    setIsSyncing(true);
    setNotice(null);

    try {
      const result = await flushPendingWrites({
        patientId,
        token: auth.token,
        isOnline: !isOffline,
        domains: ["hydration"],
      });

      if (
        result.synced === 0 &&
        result.failed === 0 &&
        result.blockedOffline === 0 &&
        result.discarded > 0
      ) {
        await hydrationLogError.clear();
        return;
      }

      if (result.failed > 0 || result.blockedOffline > 0) {
        const reason = result.lastError?.reason ?? "unknown";
        const title =
          result.blockedOffline > 0 ? "Saved on this device" : "Couldn’t sync";
        const message =
          result.blockedOffline > 0
            ? "Saved on this device. Sync when you’re back online."
            : "Saved on this device. Retry sync when you’re ready.";
        await hydrationLogError.setLocalError({
          title,
          message: result.lastError?.message ?? message,
          kind: toLastErrorKind(reason),
          retryable: true,
        });
        setNotice({
          variant: "warning",
          title,
          message,
        });
        return;
      }

      await hydrationLogError.clear();
      await hydrationRefresh.refreshLocal();
      await loadToday();
      setNotice({
        variant: "info",
        title: "Synced",
        message: "Hydration updates synced.",
      });
    } finally {
      setIsSyncing(false);
    }
  }, [
    auth.token,
    hydrationLogError,
    hydrationRefresh,
    isOffline,
    isSyncing,
    loadToday,
    pendingEntries.length,
    patientId,
  ]);

  const handleDeleteEntry = useCallback(
    async (entry: RenderableHydrationEntry) => {
      if (!patientId) {
        return;
      }

      if (entry.pending && entry.localId) {
        await removeSyncOperation(patientId, entry.localId);
        setNotice({
          variant: "info",
          title: "Removed",
          message: "Saved hydration entry removed from this device.",
        });
        return;
      }

      if (!auth.token) {
        return;
      }

      if (isOffline) {
        setNotice({
          variant: "warning",
          title: "Offline",
          message: "You can only remove server entries while online.",
        });
        return;
      }

      try {
        await deleteHydrationEntry(auth.token, entry.id);
        await loadToday();
      } catch (error) {
        const friendly = toFriendlyHydrationError(error, "Couldn’t delete entry");
        setNotice({
          variant: "error",
          title: friendly.title,
          message: friendly.message,
        });
      }
    },
    [auth.token, isOffline, loadToday, patientId]
  );

  const voiceHydrationSummaryText = voiceHydrationSnapshot
    ? `Hydration log: Add ${voiceHydrationSnapshot.amountMl} ml for today.`
    : "No hydration voice log is ready.";
  const canUseCurrentVoiceHydrationReview =
    voiceHydrationSnapshot !== null
      ? voiceHydrationSnapshot.signature ===
          buildVoiceHydrationSignature(voiceHydrationSnapshot.amountMl, today) &&
        (voiceHydrationState === "reviewLog" ||
          voiceHydrationState === "awaitingVoiceConfirmation" ||
          voiceHydrationState === "confirmedLog")
      : false;

  const handlePrepareVoiceHydrationReview = useCallback(
    (amountMl: number) => {
      if (!isSupportedVoiceHydrationAmount(amountMl)) {
        clearVoiceHydrationExpiryTimer();
        setVoiceHydrationSnapshot(null);
        setIsVoiceHydrationListening(false);
        setVoiceHydrationMessage("Choose 250 ml, 500 ml, or 750 ml before voice logging.");
        updateVoiceHydrationState("needsValue");
        return;
      }

      const previousAmount = voiceHydrationSnapshot?.amountMl;
      const nextSnapshot = {
        amountMl,
        date: today,
        signature: buildVoiceHydrationSignature(amountMl, today),
      };

      setVoiceHydrationSnapshot(nextSnapshot);
      setVoiceHydrationMessage(
        previousAmount && previousAmount !== amountMl
          ? "Hydration amount changed. Review this new summary, then say yes log or press Confirm log."
          : "Review this hydration log, then say yes log or press Confirm log.",
      );
      updateVoiceHydrationState("reviewLog");
      startVoiceHydrationExpiryTimer();
    },
    [
      clearVoiceHydrationExpiryTimer,
      startVoiceHydrationExpiryTimer,
      today,
      updateVoiceHydrationState,
      voiceHydrationSnapshot?.amountMl,
    ],
  );

  const handleCancelVoiceHydrationLog = useCallback(
    (message = "Hydration voice log cancelled.") => {
      clearVoiceHydrationExpiryTimer();
      setVoiceHydrationSnapshot(null);
      setIsVoiceHydrationListening(false);
      setVoiceHydrationMessage(message);
      updateVoiceHydrationState("cancelled");
      if (isVoiceHydrationListening) {
        ExpoSpeechRecognitionModule.abort();
      }
    },
    [
      clearVoiceHydrationExpiryTimer,
      isVoiceHydrationListening,
      updateVoiceHydrationState,
    ],
  );

  const submitReviewedVoiceHydrationLog = useCallback(async () => {
    if (!canUseCurrentVoiceHydrationReview || !voiceHydrationSnapshot) {
      setVoiceHydrationMessage("Choose 250 ml, 500 ml, or 750 ml before voice logging.");
      updateVoiceHydrationState("needsValue");
      return;
    }

    updateVoiceHydrationState("confirmedLog");
    setVoiceHydrationMessage("Hydration voice log confirmed.");
    clearVoiceHydrationExpiryTimer();
    setIsVoiceHydrationListening(false);
    updateVoiceHydrationState("logging");
    setVoiceHydrationMessage("Logging this reviewed hydration amount.");

    const outcome = await handleQuickAdd(voiceHydrationSnapshot.amountMl);

    if (outcome.status === "logged") {
      setVoiceHydrationSnapshot(null);
      setVoiceHydrationMessage(outcome.message ?? "Hydration logged.");
      updateVoiceHydrationState("logged");
      return;
    }

    if (outcome.status === "queued") {
      setVoiceHydrationSnapshot(null);
      setVoiceHydrationMessage(outcome.message ?? "Saved on this device.");
      updateVoiceHydrationState(isOffline ? "offlineBlocked" : "logged");
      return;
    }

    if (outcome.status === "validationBlocked") {
      setVoiceHydrationMessage(outcome.message ?? "Invalid hydration entry.");
      updateVoiceHydrationState("validationBlocked");
      return;
    }

    setVoiceHydrationMessage(outcome.message ?? "Hydration log could not be saved.");
    updateVoiceHydrationState("reviewLog");
  }, [
    canUseCurrentVoiceHydrationReview,
    clearVoiceHydrationExpiryTimer,
    handleQuickAdd,
    isOffline,
    updateVoiceHydrationState,
    voiceHydrationSnapshot,
  ]);

  const handleVoiceHydrationTranscript = useCallback(
    (transcript: string) => {
      setIsVoiceHydrationListening(false);
      if (voiceHydrationStateRef.current !== "awaitingVoiceConfirmation") {
        return;
      }

      if (
        !voiceHydrationSnapshot ||
        voiceHydrationSnapshot.signature !==
          buildVoiceHydrationSignature(voiceHydrationSnapshot.amountMl, today)
      ) {
        clearVoiceHydrationExpiryTimer();
        setVoiceHydrationSnapshot(null);
        setVoiceHydrationMessage("Hydration amount changed. Review again before voice logging.");
        updateVoiceHydrationState("draftReady");
        return;
      }

      const result = parseVoiceHealthLogConfirmation(transcript);
      if (result === "confirm") {
        void submitReviewedVoiceHydrationLog();
        return;
      }

      if (result === "cancel") {
        handleCancelVoiceHydrationLog();
        return;
      }

      setVoiceHydrationMessage(
        "That was not a clear log confirmation. Say yes log, confirm log, or log this.",
      );
      updateVoiceHydrationState("awaitingVoiceConfirmation");
    },
    [
      clearVoiceHydrationExpiryTimer,
      handleCancelVoiceHydrationLog,
      submitReviewedVoiceHydrationLog,
      today,
      updateVoiceHydrationState,
      voiceHydrationSnapshot,
    ],
  );

  const handleListenForVoiceHydrationConfirmation = useCallback(async () => {
    if (!canUseCurrentVoiceHydrationReview) {
      setVoiceHydrationMessage(
        voiceHydrationStateRef.current === "expired"
          ? "Hydration voice log review expired. Review again before logging."
          : "Review again before voice logging.",
      );
      updateVoiceHydrationState("expired");
      return;
    }

    updateVoiceHydrationState("awaitingVoiceConfirmation");
    setVoiceHydrationMessage("Listening for yes log, confirm log, or log this.");
    setIsVoiceHydrationListening(true);

    await stopReadAloud();

    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setIsVoiceHydrationListening(false);
      setVoiceHydrationMessage("Voice confirmation is not available on this device. Use Confirm log or manual quick add.");
      return;
    }

    if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
      setIsVoiceHydrationListening(false);
      setVoiceHydrationMessage("On-device voice confirmation is not available on this device. Use Confirm log or manual quick add.");
      return;
    }

    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setIsVoiceHydrationListening(false);
      setVoiceHydrationMessage("Microphone permission was denied. Use Confirm log or manual quick add.");
      return;
    }

    try {
      ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        continuous: false,
        interimResults: true,
        maxAlternatives: 1,
        requiresOnDeviceRecognition: true,
        recordingOptions: {
          persist: false,
        },
      });
    } catch {
      setIsVoiceHydrationListening(false);
      setVoiceHydrationMessage("Voice confirmation could not start. Nothing was logged.");
      updateVoiceHydrationState("reviewLog");
    }
  }, [canUseCurrentVoiceHydrationReview, updateVoiceHydrationState]);

  useEffect(() => {
    const startListener = ExpoSpeechRecognitionModule.addListener("start", () => {
      if (voiceHydrationStateRef.current === "awaitingVoiceConfirmation") {
        setIsVoiceHydrationListening(true);
      }
    });
    const endListener = ExpoSpeechRecognitionModule.addListener("end", () => {
      setIsVoiceHydrationListening(false);
    });
    const resultListener = ExpoSpeechRecognitionModule.addListener(
      "result",
      (event: ExpoSpeechRecognitionResultEvent) => {
        if (!event.isFinal || voiceHydrationStateRef.current !== "awaitingVoiceConfirmation") {
          return;
        }

        const transcript = event.results
          .map((result) => result.transcript.trim())
          .find((candidate) => candidate.length > 0);

        handleVoiceHydrationTranscript(transcript ?? "");
      },
    );
    const errorListener = ExpoSpeechRecognitionModule.addListener(
      "error",
      (_event: ExpoSpeechRecognitionErrorEvent) => {
        if (voiceHydrationStateRef.current === "awaitingVoiceConfirmation") {
          setIsVoiceHydrationListening(false);
          setVoiceHydrationMessage("That was not a clear log confirmation. Nothing was logged.");
        }
      },
    );
    const nomatchListener = ExpoSpeechRecognitionModule.addListener("nomatch", () => {
      if (voiceHydrationStateRef.current === "awaitingVoiceConfirmation") {
        setIsVoiceHydrationListening(false);
        setVoiceHydrationMessage("That was not a clear log confirmation. Nothing was logged.");
      }
    });

    return () => {
      startListener.remove();
      endListener.remove();
      resultListener.remove();
      errorListener.remove();
      nomatchListener.remove();
      if (voiceHydrationStateRef.current === "awaitingVoiceConfirmation") {
        ExpoSpeechRecognitionModule.abort();
      }
    };
  }, [handleVoiceHydrationTranscript]);

  const listHeader = useMemo(() => {
    const showNotice = Boolean(notice && !(isOffline && notice.title === "Offline"));
    const canReviewVoiceLog = canUseCurrentVoiceHydrationReview;
    const canListenForVoiceLog =
      canReviewVoiceLog && voiceHydrationState !== "confirmedLog";
    const voiceStatusRole =
      voiceHydrationState === "needsValue" ||
      voiceHydrationState === "offlineBlocked" ||
      voiceHydrationState === "validationBlocked" ||
      voiceHydrationState === "expired"
        ? "alert"
        : "text";

    return (
      <View style={styles.listHeader}>
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
                <LastRefreshed value={hydrationRefresh.label} compact />
                <LastFailedAttempt
                  label="Last load failure"
                  value={hydrationLoadError.label}
                  title={hydrationLoadError.lastError?.title}
                  message={hydrationLoadError.lastError?.message}
                  onClear={hydrationLoadError.lastError ? hydrationLoadError.clear : undefined}
                  compact
                />
                <LastFailedAttempt
                  label="Last log failure"
                  value={hydrationLogError.label}
                  title={hydrationLogError.lastError?.title}
                  message={hydrationLogError.lastError?.message}
                  onClear={hydrationLogError.lastError ? hydrationLogError.clear : undefined}
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
            message="New hydration updates are saved on this device until you reconnect."
          />
        ) : null}

        {showNotice && notice ? (
          <Banner
            variant={toBannerVariant(notice.variant)}
            title={notice.title}
            message={notice.message}
          />
        ) : null}

        <Card variant="outlined" padding={tokens.spacing.md}>
          <View style={styles.storyCard}>
            <View style={styles.storyHeader}>
              <View style={styles.storyHeaderText}>
                <Text style={styles.storyEyebrow}>Today&apos;s hydration</Text>
                <Text style={styles.storyTitle}>{hydrationStoryTitle}</Text>
              </View>
              <StatusPill label={hydrationStatusLabel} variant={hydrationStatusTone} />
            </View>
            <Text style={styles.storyNote}>{hydrationStoryNote}</Text>
          </View>
        </Card>

        <View style={styles.sectionIntro}>
          <Text style={styles.sectionTitle}>Today at a glance</Text>
          <Text style={styles.sectionHelper}>
            Start here to see how much you&apos;ve logged, what the target is, and whether anything
            is still waiting to sync.
          </Text>
        </View>

        <View style={styles.trackerGrid}>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="hydration"
              label="Today"
              value={`${totalTodayMl} ml`}
              delta="Current intake"
              tone="accent"
              micro={{ type: "ring", progress: progressRatio }}
            />
          </View>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="hydration"
              label="Goal"
              value={`${targetMl} ml`}
              delta="Target"
              tone="primary"
              micro={
                recentAmountSeries.length >= 2
                  ? { type: "bars", values: recentAmountSeries }
                  : { type: "dots", values: [0, 0, 0, 0, 0, 0, 0] }
              }
            />
          </View>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="progress"
              label="Progress"
              value={`${progressPercent}%`}
              delta="Toward daily target"
              tone="success"
              micro={{ type: "ring", progress: progressRatio }}
            />
          </View>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="warning"
              label="Pending"
              value={`${pendingEntries.length}`}
              delta={
                hydrationSyncSummary.failedCount > 0
                  ? "Couldn’t sync"
                  : "Saved on this device"
              }
              tone="warning"
              micro={{ type: "dots", values: [pendingEntries.length, 0, 0, 0, 0, 0, 0] }}
            />
          </View>
        </View>

        <Card variant="outlined" padding={tokens.spacing.md}>
          <View style={styles.quickAddCard}>
            <View style={styles.quickAddHeader}>
              <View style={styles.quickAddHeaderText}>
                <Text style={styles.cardTitle}>Add water</Text>
                <Text style={styles.cardHelper}>
                  Tap a quick amount to update today&apos;s total without opening a longer form.
                </Text>
              </View>
              <StatusPill
                label={pendingEntries.length > 0 ? hydrationSyncSurface.label : "Ready"}
                variant={pendingEntries.length > 0 ? hydrationSyncSurface.variant : "neutral"}
              />
            </View>
            <View style={styles.quickAddRow}>
              {[250, 500, 750].map((amount) => (
                <View key={`add-${amount}`} style={styles.quickButtonWrap}>
                  <SecondaryButton
                    label={`Add ${amount} ml`}
                    onPress={() => {
                      void handleQuickAdd(amount);
                    }}
                  />
                </View>
              ))}
            </View>
            <View style={styles.voiceLogPanel}>
              <View style={styles.voiceLogHeader}>
                <View style={styles.voiceLogHeaderText}>
                  <Text accessibilityRole="header" style={styles.cardTitle}>
                    Voice log review
                  </Text>
                  <Text style={styles.cardHelper}>
                    Choose one supported amount, review the exact hydration log, then confirm before anything is saved.
                  </Text>
                </View>
                <ReadAloudButton
                  text={voiceHydrationSummaryText}
                  label="Read hydration voice log summary"
                  sourceId="hydration-voice-log-summary"
                  testID="hydration-voice-log-read-summary"
                />
              </View>

              <View style={styles.quickAddRow}>
                {SUPPORTED_VOICE_HYDRATION_AMOUNTS.map((amount) => (
                  <View key={`voice-review-${amount}`} style={styles.quickButtonWrap}>
                    <SecondaryButton
                      label={`Review ${amount} ml`}
                      accessibilityLabel={`Review ${amount} ml hydration voice log`}
                      accessibilityHint="Shows the exact hydration log summary before any voice log can happen."
                      onPress={() => handlePrepareVoiceHydrationReview(amount)}
                    />
                  </View>
                ))}
              </View>

              {voiceHydrationSnapshot ? (
                <View
                  accessible
                  accessibilityRole="summary"
                  accessibilityLabel={`Hydration voice log summary. ${voiceHydrationSummaryText}`}
                  style={styles.voiceSummaryBox}
                >
                  <Text selectable style={styles.voiceSummaryText}>
                    {voiceHydrationSummaryText}
                  </Text>
                </View>
              ) : null}

              <Text style={styles.voiceSafetyCopy}>
                This logs hydration only. It does not change medication, treatment, or emergency support.
              </Text>

              <View
                accessible
                accessibilityRole={voiceStatusRole}
                accessibilityLiveRegion="polite"
                accessibilityLabel="Hydration voice log status"
                accessibilityHint={`State: ${voiceHydrationState}. ${voiceHydrationMessage ?? "Choose 250 ml, 500 ml, or 750 ml before voice logging."}`}
                style={[
                  styles.voiceStatusBox,
                  voiceStatusRole === "alert" ? styles.voiceStatusWarning : null,
                ]}
              >
                <Text style={styles.voiceStatusLabel}>Hydration voice log status</Text>
                <Text style={styles.cardHelper}>
                  {voiceHydrationMessage ?? "Choose 250 ml, 500 ml, or 750 ml before voice logging."}
                </Text>
              </View>

              <View style={styles.voiceActionRow}>
                <View style={styles.voiceActionWrap}>
                  <SecondaryButton
                    label={isVoiceHydrationListening ? "Listening..." : "Listen for confirmation"}
                    accessibilityLabel="Listen for hydration log confirmation"
                    accessibilityHint="Listens once for yes log, confirm log, or log this."
                    loading={isVoiceHydrationListening}
                    disabled={!canListenForVoiceLog}
                    onPress={() => {
                      void handleListenForVoiceHydrationConfirmation();
                    }}
                  />
                </View>
                <View style={styles.voiceActionWrap}>
                  <PrimaryButton
                    label={voiceHydrationState === "logging" ? "Logging..." : "Confirm log"}
                    accessibilityLabel="Confirm hydration voice log"
                    accessibilityHint="Logs the reviewed hydration amount through the same normal hydration path."
                    loading={voiceHydrationState === "logging"}
                    disabled={!canReviewVoiceLog}
                    onPress={() => {
                      void submitReviewedVoiceHydrationLog();
                    }}
                  />
                </View>
                <View style={styles.voiceActionWrap}>
                  <SecondaryButton
                    label="Cancel"
                    accessibilityLabel="Cancel hydration voice log"
                    accessibilityHint="Clears the current hydration voice log review without logging."
                    onPress={() => handleCancelVoiceHydrationLog()}
                  />
                </View>
              </View>
            </View>
            {pendingEntries.length > 0 ? (
              <PrimaryButton
                label={isSyncing ? "Syncing..." : hydrationSyncSummary.failedCount > 0 ? "Retry sync" : "Sync saved entries"}
                loading={isSyncing}
                disabled={isOffline || isSyncing}
                onPress={() => {
                  void handleSyncPending();
                }}
              />
            ) : null}
          </View>
        </Card>

        <View style={styles.sectionIntro}>
          <Text style={styles.sectionTitle}>Recent log</Text>
          <Text style={styles.sectionHelper}>
            These are the water entries recorded for today. Saved-on-device entries stay here until
            they sync.
          </Text>
        </View>
      </View>
    );
  }, [
    handleQuickAdd,
    handleCancelVoiceHydrationLog,
    handleListenForVoiceHydrationConfirmation,
    handlePrepareVoiceHydrationReview,
    handleSyncPending,
    hydrationLoadError.clear,
    hydrationLoadError.label,
    hydrationLoadError.lastError?.message,
    hydrationLoadError.lastError?.title,
    hydrationLogError.clear,
    hydrationLogError.label,
    hydrationLogError.lastError?.message,
    hydrationLogError.lastError?.title,
    hydrationRefresh.label,
    hydrationStatusLabel,
    hydrationStatusTone,
    hydrationSyncSummary.failedCount,
    hydrationSyncSurface.label,
    hydrationSyncSurface.variant,
    hydrationStoryNote,
    hydrationStoryTitle,
    isOffline,
    isSyncing,
    isVoiceHydrationListening,
    notice,
    pendingEntries.length,
    progressPercent,
    progressRatio,
    recentAmountSeries,
    showDiagnostics,
    styles.cardTitle,
    styles.cardHelper,
    styles.diagContent,
    styles.diagTitle,
    styles.diagTitleRow,
    styles.diagToggle,
    styles.listHeader,
    styles.pressed,
    styles.quickAddHeader,
    styles.quickAddHeaderText,
    styles.quickAddCard,
    styles.quickAddRow,
    styles.quickButtonWrap,
    styles.sectionHelper,
    styles.sectionIntro,
    styles.sectionTitle,
    styles.storyCard,
    styles.storyEyebrow,
    styles.storyHeader,
    styles.storyHeaderText,
    styles.storyNote,
    styles.storyTitle,
    styles.trackerGrid,
    styles.trackerTileWrap,
    styles.voiceActionRow,
    styles.voiceActionWrap,
    styles.voiceLogHeader,
    styles.voiceLogHeaderText,
    styles.voiceLogPanel,
    styles.voiceSafetyCopy,
    styles.voiceStatusBox,
    styles.voiceStatusLabel,
    styles.voiceStatusWarning,
    styles.voiceSummaryBox,
    styles.voiceSummaryText,
    submitReviewedVoiceHydrationLog,
    targetMl,
    tokens.spacing.md,
    totalTodayMl,
    voiceHydrationMessage,
    voiceHydrationSnapshot,
    voiceHydrationState,
    voiceHydrationSummaryText,
    canUseCurrentVoiceHydrationReview,
  ]);

  if (auth.status === "loading") {
    return (
      <Screen
        scroll={false}
        header={<HeroHeader variant="compact" title="Hydration" subtitle="Track water intake" />}
      >
        <EmptyState
          variant="compact"
          title="Loading hydration tracker"
          description="Preparing your saved hydration entries."
          illustration={<ActivityIndicator size="small" color={tokens.colors.primary} />}
        />
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
          title="Hydration"
          subtitle="Daily support"
          left={<Avatar size={40} name="Hydration" fallback="icon" iconKey="hydration" />}
          rightActions={[
            {
              icon: "progress",
              tone: "accent",
              accessibilityLabel: "Open Progress",
              onPress: () => {
                router.push("/(tabs)/progress");
              },
            },
            {
              icon: "safety",
              tone: "warning",
              accessibilityLabel: "Open Safety support",
              onPress: () => {
                router.push("/safety");
              },
            },
          ]}
        >
          <View style={styles.headerMetaRow}>
            <StatusPill label={`${totalTodayMl} ml today`} variant="info" />
            <StatusPill label={`${targetMl} ml goal`} variant="neutral" />
            <StatusPill label={isOffline ? "Offline" : hydrationStatusLabel} variant={isOffline ? "warning" : hydrationStatusTone} />
          </View>
        </HeroHeader>
      }
    >
      <FlatList
        data={mergedEntries}
        keyExtractor={(entry) => `${entry.id}:${entry.pending ? "pending" : "saved"}`}
        renderItem={({ item }) => (
          <MediaCard
            leading={{ type: "icon", icon: "hydration", tone: item.pending ? "warning" : "muted" }}
            title={`${item.amountMl} ml added`}
            subtitle={
              item.pending
                ? `Saved on this device at ${formatTime(item.createdAt)}`
                : `Logged at ${formatTime(item.createdAt)}`
            }
            chips={[
              item.pending
                ? {
                    text: getPendingItemCopy(item.syncStatus ?? "queued").helper,
                    tone: "warning",
                  }
                : {
                    text: "Included in today’s total",
                    tone: "muted",
                  },
            ]}
            statusPill={{
              text: item.pending
                ? getPendingItemCopy(item.syncStatus ?? "queued").label
                : "Synced",
              tone: item.pending
                ? getPendingItemCopy(item.syncStatus ?? "queued").variant
                : "info",
            }}
            actions={[
              {
                label: "Remove",
                kind: "secondary",
                onPress: () => {
                  Alert.alert("Remove entry?", "This action cannot be undone.", [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Remove",
                      style: "destructive",
                      onPress: () => {
                        void handleDeleteEntry(item);
                      },
                    },
                  ]);
                },
              },
            ]}
          />
        )}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="small" />
            </View>
          ) : (
            <Card variant="outlined" padding={tokens.spacing.md}>
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No water logged yet</Text>
                <Text style={styles.subText}>
                  Add the first glass when you&apos;re ready. Today&apos;s hydration entries will appear
                  here.
                </Text>
              </View>
            </Card>
          )
        }
        ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
        contentContainerStyle={styles.container}
      />
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      paddingBottom: tokens.spacing.xxxl,
      gap: tokens.spacing.md,
    },
    listHeader: {
      gap: tokens.spacing.md,
      marginBottom: tokens.spacing.md,
    },
    headerMetaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    listSeparator: {
      height: tokens.spacing.md,
    },
    centered: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: 96,
    },
    emptyCard: {
      gap: tokens.spacing.xs,
    },
    emptyTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    subText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    storyCard: {
      gap: tokens.spacing.sm,
    },
    storyHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    storyHeaderText: {
      flex: 1,
      gap: tokens.spacing.xs,
    },
    storyEyebrow: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    storyTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    storyNote: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    sectionIntro: {
      gap: tokens.spacing.xs,
      paddingHorizontal: tokens.spacing.xs,
    },
    sectionTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    sectionHelper: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    trackerGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.md,
    },
    trackerTileWrap: {
      width: "48%",
      minWidth: 0,
    },
    quickAddCard: {
      gap: tokens.spacing.md,
    },
    quickAddHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    quickAddHeaderText: {
      flex: 1,
      gap: tokens.spacing.xs,
    },
    quickAddRow: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
    },
    quickButtonWrap: {
      flex: 1,
      minWidth: 0,
    },
    cardTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    cardHelper: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    voiceLogPanel: {
      gap: tokens.spacing.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.md,
      padding: tokens.spacing.md,
      backgroundColor: tokens.colors.surfaceElevated,
    },
    voiceLogHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    voiceLogHeaderText: {
      flex: 1,
      gap: tokens.spacing.xs,
    },
    voiceSummaryBox: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.md,
      padding: tokens.spacing.md,
      backgroundColor: tokens.colors.surface,
    },
    voiceSummaryText: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    voiceSafetyCopy: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    voiceStatusBox: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.md,
      padding: tokens.spacing.md,
      gap: tokens.spacing.xs,
      backgroundColor: tokens.colors.surface,
    },
    voiceStatusWarning: {
      backgroundColor: tokens.colors.warningSoft,
    },
    voiceStatusLabel: {
      color: tokens.colors.text,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    voiceActionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    voiceActionWrap: {
      flexGrow: 1,
      flexBasis: "31%",
      minWidth: 148,
    },
    diagToggle: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    diagTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.xs,
    },
    diagTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    diagContent: {
      marginTop: tokens.spacing.sm,
      gap: tokens.spacing.xs,
    },
    pressed: {
      opacity: 0.84,
    },
  });
}
