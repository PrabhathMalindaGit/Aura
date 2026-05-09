import { Redirect, useRouter } from "expo-router";
import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionErrorEvent,
  type ExpoSpeechRecognitionResultEvent,
} from "expo-speech-recognition";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import {
  getNutritionRange,
  getNutritionToday,
  type NutritionEntry,
  type NutritionLogPayload,
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
  getCachedNutritionDay,
  getCachedNutritionRange,
  mergeCachedNutritionDays,
  setCachedNutritionDay,
  setCachedNutritionToday,
} from "@/src/state/nutritionCache";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { useLastRefreshed } from "@/src/state/refresh";
import { getQueueableSyncSurface } from "@/src/sync/copy";
import { sendNutritionSync } from "@/src/sync/adapters/nutrition";
import { createOperationId } from "@/src/sync/model";
import { flushPendingWrites, submitQueueableWrite } from "@/src/sync/runner";
import { selectPendingNutritionEntries, useSyncDomainSummary } from "@/src/sync/selectors";
import { useSyncPatientState } from "@/src/sync/store";
import { useTokens } from "@/src/theme/tokens";
import { addDaysISO, todayISO } from "@/src/utils/date";
import { normalizeUnknownError } from "@/src/utils/errors";
import { stopReadAloud } from "@/src/utils/readAloud";
import { parseVoiceHealthLogConfirmation } from "@/src/utils/voiceHealthLogConfirmation";

type NoticeState = {
  variant: "info" | "warning" | "error";
  title: string;
  message: string;
};

type FormState = {
  protein: "low" | "ok" | "high";
  fruitVegServings: number;
  antiInflammatoryFocus: boolean;
  mealRegularity: "irregular" | "mostly" | "regular";
  appetite: "low" | "normal" | "high" | null;
  notes: string;
};

type SummaryState = {
  trackedDays: number;
  avgFruitVegServings: number | null;
  proteinOkHighDays: number;
};

type NutritionSaveOutcome = {
  status: "logged" | "queued" | "validationBlocked" | "failed" | "ignored";
  message?: string;
};

type VoiceNutritionLogState =
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

type VoiceNutritionSnapshot = {
  payload: NutritionLogPayload;
  signature: string;
  summaryText: string;
};

function toBannerVariant(variant: NoticeState["variant"]): "info" | "warning" | "danger" {
  return variant === "error" ? "danger" : variant;
}

function toFriendlyNutritionError(error: unknown, title: string): {
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
      message: "You’re offline. Nutrition log was queued for sync.",
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
      message: appError.message || "Invalid nutrition values.",
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

function toPendingEntry(pending: {
  localId: string;
  date: string;
  createdAt: string;
  payload: NutritionLogPayload;
}): NutritionEntry {
  return {
    id: pending.localId,
    localId: pending.localId,
    pending: true,
    date: pending.date,
    protein: pending.payload.protein,
    fruitVegServings: pending.payload.fruitVegServings,
    antiInflammatoryFocus: pending.payload.antiInflammatoryFocus,
    mealRegularity: pending.payload.mealRegularity,
    appetite: pending.payload.appetite,
    notes: pending.payload.notes,
    createdAt: pending.createdAt,
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

function toFormState(entry: NutritionEntry | null): FormState {
  if (!entry) {
    return {
      protein: "ok",
      fruitVegServings: 2,
      antiInflammatoryFocus: false,
      mealRegularity: "mostly",
      appetite: null,
      notes: "",
    };
  }

  return {
    protein: entry.protein,
    fruitVegServings: entry.fruitVegServings,
    antiInflammatoryFocus: entry.antiInflammatoryFocus,
    mealRegularity: entry.mealRegularity,
    appetite: entry.appetite ?? null,
    notes: entry.notes ?? "",
  };
}

function computeSummary(days: Array<{ date: string; entry: NutritionEntry | null }>): SummaryState {
  const withEntry = days.filter((day) => day.entry !== null);
  if (withEntry.length === 0) {
    return {
      trackedDays: 0,
      avgFruitVegServings: null,
      proteinOkHighDays: 0,
    };
  }

  const fruitVegTotal = withEntry.reduce(
    (sum, day) => sum + (day.entry?.fruitVegServings ?? 0),
    0
  );
  const proteinOkHighDays = withEntry.filter((day) => {
    const protein = day.entry?.protein;
    return protein === "ok" || protein === "high";
  }).length;

  return {
    trackedDays: withEntry.length,
    avgFruitVegServings: Math.round((fruitVegTotal / withEntry.length) * 10) / 10,
    proteinOkHighDays,
  };
}

function formatTime(iso: string): string {
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) {
    return "Unknown";
  }
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function yesNo(value: boolean): "yes" | "no" {
  return value ? "yes" : "no";
}

function formatVoiceNutritionSummary(payload: NutritionLogPayload): string {
  return [
    "Nutrition log for today:",
    `protein ${payload.protein},`,
    `fruit and veg ${payload.fruitVegServings} servings,`,
    `anti-inflammatory focus ${yesNo(payload.antiInflammatoryFocus)},`,
    `meal regularity ${payload.mealRegularity},`,
    `appetite ${payload.appetite ?? "not set"},`,
    `notes ${payload.notes ?? "none"}.`,
  ].join(" ");
}

function buildVoiceNutritionSignature(payload: NutritionLogPayload): string {
  return JSON.stringify({
    date: payload.date ?? null,
    protein: payload.protein,
    fruitVegServings: payload.fruitVegServings,
    antiInflammatoryFocus: payload.antiInflammatoryFocus,
    mealRegularity: payload.mealRegularity,
    appetite: payload.appetite ?? null,
    notes: payload.notes ?? null,
  });
}

export default function NutritionScreen() {
  const auth = useAuth();
  const router = useRouter();
  const isOffline = useIsOffline();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const nutritionRefresh = useLastRefreshed("nutrition");
  const nutritionLoadError = useLastError("nutritionLoad");
  const nutritionLogError = useLastError("nutritionLog");

  const [todayEntry, setTodayEntry] = useState<NutritionEntry | null>(null);
  const [summary, setSummary] = useState<SummaryState>({
    trackedDays: 0,
    avgFruitVegServings: null,
    proteinOkHighDays: 0,
  });
  const [form, setForm] = useState<FormState>(toFormState(null));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const voiceNutritionExpiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceNutritionStateRef = useRef<VoiceNutritionLogState>("draftReady");
  const [voiceNutritionState, setVoiceNutritionState] =
    useState<VoiceNutritionLogState>("draftReady");
  const [voiceNutritionSnapshot, setVoiceNutritionSnapshot] =
    useState<VoiceNutritionSnapshot | null>(null);
  const [voiceNutritionMessage, setVoiceNutritionMessage] =
    useState<string | null>(null);
  const [isVoiceNutritionListening, setIsVoiceNutritionListening] = useState(false);

  const today = useMemo(() => todayISO(), []);
  const rangeFrom = useMemo(() => addDaysISO(today, -6), [today]);
  const patientId = auth.patient?.id ?? "";
  const syncState = useSyncPatientState(patientId);
  const nutritionSyncSummary = useSyncDomainSummary(patientId, "nutrition");
  const nutritionSyncSurface = useMemo(
    () => getQueueableSyncSurface(nutritionSyncSummary),
    [nutritionSyncSummary]
  );
  const pendingEntries = useMemo(
    () => selectPendingNutritionEntries(syncState),
    [syncState]
  );
  const todayPending = useMemo(
    () => pendingEntries.filter((entry) => entry.date === today),
    [pendingEntries, today]
  );

  const currentEntry = useMemo(() => {
    if (todayPending.length > 0) {
      return toPendingEntry(todayPending[todayPending.length - 1]);
    }
    return todayEntry;
  }, [todayEntry, todayPending]);
  const trackedRatio = Math.max(0, Math.min(1, summary.trackedDays / 7));
  const todayLoggedRatio = currentEntry ? 1 : 0;
  const pendingCount = pendingEntries.length;
  const nutritionStatusLabel = currentEntry
    ? currentEntry.pending
      ? nutritionSyncSurface.label
      : "Logged today"
    : pendingCount > 0
      ? nutritionSyncSurface.label
      : "Ready to log";
  const nutritionStatusTone = currentEntry
    ? currentEntry.pending
      ? "warning"
      : "success"
    : pendingCount > 0
      ? "warning"
      : "info";
  const nutritionStoryTitle = currentEntry
    ? "Today’s nutrition check is saved"
    : "Log today’s meals in one short check";
  const nutritionStoryNote = currentEntry
    ? `Fruit and veg ${currentEntry.fruitVegServings} · protein ${currentEntry.protein} · meals ${currentEntry.mealRegularity}${currentEntry.pending ? " · waiting to sync" : ""}.`
    : "A short daily nutrition check helps you notice patterns in protein, fruit and veg, meal regularity, and appetite.";

  const loadNutrition = useCallback(async () => {
    if (!auth.token || !patientId) {
      return;
    }

    setIsLoading(true);
    setNotice(null);

    if (isOffline) {
      const [cachedToday, cachedRange] = await Promise.all([
        getCachedNutritionDay(patientId, today),
        getCachedNutritionRange(patientId, rangeFrom, today),
      ]);
      setTodayEntry(cachedToday?.entry ?? null);
      setSummary(computeSummary(cachedRange?.days ?? []));
      setNotice({
        variant: "warning",
        title: "Offline",
        message: "Offline — showing saved nutrition data when available.",
      });
      setIsLoading(false);
      return;
    }

    try {
      const [todayResponse, rangeResponse] = await Promise.all([
        getNutritionToday(auth.token, today),
        getNutritionRange(auth.token, { from: rangeFrom, to: today }),
      ]);

      setTodayEntry(todayResponse.entry);
      setForm((previous) =>
        previous.notes.trim().length > 0 ? previous : toFormState(todayResponse.entry)
      );
      setSummary(computeSummary(rangeResponse.days));

      await Promise.all([
        setCachedNutritionToday(patientId, todayResponse),
        mergeCachedNutritionDays(patientId, rangeResponse.days),
        nutritionRefresh.refreshLocal(),
        nutritionLoadError.clear(),
      ]);
    } catch (error) {
      const friendly = toFriendlyNutritionError(error, "Couldn’t load nutrition");
      await nutritionLoadError.setLocalError({
        title: friendly.title,
        message: friendly.message,
        kind: friendly.kind,
        retryable: friendly.retryable,
      });

      const [cachedToday, cachedRange] = await Promise.all([
        getCachedNutritionDay(patientId, today),
        getCachedNutritionRange(patientId, rangeFrom, today),
      ]);
      setTodayEntry(cachedToday?.entry ?? null);
      setSummary(computeSummary(cachedRange?.days ?? []));
      setNotice({
        variant: cachedToday || cachedRange ? "warning" : "error",
        title: friendly.title,
        message:
          cachedToday || cachedRange
            ? "Showing saved nutrition data."
            : friendly.message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    auth.token,
    isOffline,
    nutritionLoadError,
    nutritionRefresh,
    patientId,
    rangeFrom,
    today,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (auth.status !== "signedIn") {
        return;
      }
      void loadNutrition();
      return undefined;
    }, [auth.status, loadNutrition])
  );

  const buildPayload = useCallback((): NutritionLogPayload => {
    const notes = form.notes.trim();
    return {
      date: today,
      protein: form.protein,
      fruitVegServings: form.fruitVegServings,
      antiInflammatoryFocus: form.antiInflammatoryFocus,
      mealRegularity: form.mealRegularity,
      appetite: form.appetite ?? undefined,
      notes: notes ? notes.slice(0, 280) : undefined,
    };
  }, [form, today]);

  const currentVoiceNutritionSignature = useMemo(
    () => buildVoiceNutritionSignature(buildPayload()),
    [buildPayload],
  );

  const clearVoiceNutritionExpiryTimer = useCallback(() => {
    if (voiceNutritionExpiryTimerRef.current) {
      clearTimeout(voiceNutritionExpiryTimerRef.current);
      voiceNutritionExpiryTimerRef.current = null;
    }
  }, []);

  const updateVoiceNutritionState = useCallback((nextState: VoiceNutritionLogState) => {
    voiceNutritionStateRef.current = nextState;
    setVoiceNutritionState(nextState);
  }, []);

  const startVoiceNutritionExpiryTimer = useCallback(() => {
    clearVoiceNutritionExpiryTimer();
    voiceNutritionExpiryTimerRef.current = setTimeout(() => {
      setVoiceNutritionSnapshot(null);
      setIsVoiceNutritionListening(false);
      setVoiceNutritionMessage("Nutrition voice log review expired. Review again before logging.");
      updateVoiceNutritionState("expired");
    }, 30_000);
  }, [clearVoiceNutritionExpiryTimer, updateVoiceNutritionState]);

  useEffect(
    () => () => {
      clearVoiceNutritionExpiryTimer();
    },
    [clearVoiceNutritionExpiryTimer],
  );

  useEffect(() => {
    if (
      voiceNutritionSnapshot &&
      voiceNutritionSnapshot.signature !== currentVoiceNutritionSignature &&
      (voiceNutritionStateRef.current === "reviewLog" ||
        voiceNutritionStateRef.current === "awaitingVoiceConfirmation" ||
        voiceNutritionStateRef.current === "confirmedLog")
    ) {
      clearVoiceNutritionExpiryTimer();
      setVoiceNutritionSnapshot(null);
      setIsVoiceNutritionListening(false);
      setVoiceNutritionMessage("Nutrition form changed. Review again before voice logging.");
      updateVoiceNutritionState("draftReady");
      if (isVoiceNutritionListening) {
        ExpoSpeechRecognitionModule.abort();
      }
    }
  }, [
    clearVoiceNutritionExpiryTimer,
    currentVoiceNutritionSignature,
    isVoiceNutritionListening,
    updateVoiceNutritionState,
    voiceNutritionSnapshot,
  ]);

  const saveNutritionPayload = useCallback(async (
    basePayload: NutritionLogPayload
  ): Promise<NutritionSaveOutcome> => {
    if (!auth.token || !patientId) {
      return { status: "ignored" };
    }
    const payload = {
      ...basePayload,
      clientMutationId: createOperationId(),
    };
    setIsSaving(true);

    try {
      const result = await submitQueueableWrite({
        patientId,
        token: auth.token,
        isOffline,
        domain: "nutrition",
        payload: {
          ...payload,
          date: payload.date ?? today,
        },
        send: sendNutritionSync,
      });

      if (result.kind === "synced") {
        await nutritionLogError.clear();
        setNotice({
          variant: "info",
          title: "Synced",
          message: "Today’s nutrition log synced.",
        });
        await loadNutrition();
        return { status: "logged", message: "Today’s nutrition log synced." };
      } else {
        const lastError = result.normalizedError;
        const title =
          result.operation.status === "failed"
            ? "Couldn’t sync"
            : "Saved on this device";
        const message =
          result.operation.status === "failed"
            ? "Saved on this device. Retry sync when you’re ready."
            : "Saved on this device. Sync when you’re back online.";

        await nutritionLogError.setLocalError({
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
      }
    } catch (error) {
      const friendly = toFriendlyNutritionError(error, "Couldn’t save nutrition");
      await nutritionLogError.setLocalError({
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
    } finally {
      setIsSaving(false);
    }
  }, [
    auth.token,
    isOffline,
    loadNutrition,
    patientId,
    nutritionLogError,
    today,
  ]);

  const handleSaveToday = useCallback(async () => {
    if (isSaving) {
      return;
    }
    await saveNutritionPayload(buildPayload());
  }, [buildPayload, isSaving, saveNutritionPayload]);

  const voiceNutritionSummaryText =
    voiceNutritionSnapshot?.summaryText ?? "No nutrition voice log is ready.";
  const canUseCurrentVoiceNutritionReview =
    voiceNutritionSnapshot !== null
      ? voiceNutritionSnapshot.signature === currentVoiceNutritionSignature &&
        (voiceNutritionState === "reviewLog" ||
          voiceNutritionState === "awaitingVoiceConfirmation" ||
          voiceNutritionState === "confirmedLog")
      : false;

  const handlePrepareVoiceNutritionReview = useCallback(() => {
    const payload = buildPayload();
    const signature = buildVoiceNutritionSignature(payload);

    setVoiceNutritionSnapshot({
      payload,
      signature,
      summaryText: formatVoiceNutritionSummary(payload),
    });
    setVoiceNutritionMessage(
      "Review this nutrition log, then say yes log or press Confirm log.",
    );
    updateVoiceNutritionState("reviewLog");
    startVoiceNutritionExpiryTimer();
  }, [buildPayload, startVoiceNutritionExpiryTimer, updateVoiceNutritionState]);

  const handleCancelVoiceNutritionLog = useCallback(
    (message = "Nutrition voice log cancelled.") => {
      clearVoiceNutritionExpiryTimer();
      setVoiceNutritionSnapshot(null);
      setIsVoiceNutritionListening(false);
      setVoiceNutritionMessage(message);
      updateVoiceNutritionState("cancelled");
      if (isVoiceNutritionListening) {
        ExpoSpeechRecognitionModule.abort();
      }
    },
    [
      clearVoiceNutritionExpiryTimer,
      isVoiceNutritionListening,
      updateVoiceNutritionState,
    ],
  );

  const submitReviewedVoiceNutritionLog = useCallback(async () => {
    if (!canUseCurrentVoiceNutritionReview || !voiceNutritionSnapshot) {
      setVoiceNutritionMessage(
        voiceNutritionStateRef.current === "expired"
          ? "Nutrition voice log review expired. Review again before logging."
          : "Nutrition form changed. Review again before voice logging.",
      );
      updateVoiceNutritionState(
        voiceNutritionStateRef.current === "expired" ? "expired" : "needsValue",
      );
      return;
    }

    updateVoiceNutritionState("confirmedLog");
    setVoiceNutritionMessage("Nutrition voice log confirmed.");
    clearVoiceNutritionExpiryTimer();
    setIsVoiceNutritionListening(false);
    updateVoiceNutritionState("logging");
    setVoiceNutritionMessage("Logging this reviewed nutrition form.");

    const outcome = await saveNutritionPayload(voiceNutritionSnapshot.payload);

    if (outcome.status === "logged") {
      setVoiceNutritionSnapshot(null);
      setVoiceNutritionMessage(outcome.message ?? "Nutrition logged.");
      updateVoiceNutritionState("logged");
      return;
    }

    if (outcome.status === "queued") {
      setVoiceNutritionSnapshot(null);
      setVoiceNutritionMessage(outcome.message ?? "Saved on this device.");
      updateVoiceNutritionState(isOffline ? "offlineBlocked" : "logged");
      return;
    }

    if (outcome.status === "validationBlocked") {
      setVoiceNutritionMessage(outcome.message ?? "Invalid nutrition values.");
      updateVoiceNutritionState("validationBlocked");
      return;
    }

    setVoiceNutritionMessage(outcome.message ?? "Nutrition log could not be saved.");
    updateVoiceNutritionState("reviewLog");
  }, [
    canUseCurrentVoiceNutritionReview,
    clearVoiceNutritionExpiryTimer,
    isOffline,
    saveNutritionPayload,
    updateVoiceNutritionState,
    voiceNutritionSnapshot,
  ]);

  const handleVoiceNutritionTranscript = useCallback(
    (transcript: string) => {
      setIsVoiceNutritionListening(false);
      if (voiceNutritionStateRef.current !== "awaitingVoiceConfirmation") {
        return;
      }

      if (
        !voiceNutritionSnapshot ||
        voiceNutritionSnapshot.signature !== currentVoiceNutritionSignature
      ) {
        clearVoiceNutritionExpiryTimer();
        setVoiceNutritionSnapshot(null);
        setVoiceNutritionMessage("Nutrition form changed. Review again before voice logging.");
        updateVoiceNutritionState("draftReady");
        return;
      }

      const result = parseVoiceHealthLogConfirmation(transcript);
      if (result === "confirm") {
        void submitReviewedVoiceNutritionLog();
        return;
      }

      if (result === "cancel") {
        handleCancelVoiceNutritionLog();
        return;
      }

      setVoiceNutritionMessage(
        "That was not a clear log confirmation. Say yes log, confirm log, or log this.",
      );
      updateVoiceNutritionState("awaitingVoiceConfirmation");
    },
    [
      clearVoiceNutritionExpiryTimer,
      currentVoiceNutritionSignature,
      handleCancelVoiceNutritionLog,
      submitReviewedVoiceNutritionLog,
      updateVoiceNutritionState,
      voiceNutritionSnapshot,
    ],
  );

  const handleListenForVoiceNutritionConfirmation = useCallback(async () => {
    if (!canUseCurrentVoiceNutritionReview) {
      setVoiceNutritionMessage(
        voiceNutritionStateRef.current === "expired"
          ? "Nutrition voice log review expired. Review again before logging."
          : "Review again before voice logging.",
      );
      updateVoiceNutritionState("expired");
      return;
    }

    updateVoiceNutritionState("awaitingVoiceConfirmation");
    setVoiceNutritionMessage("Listening for yes log, confirm log, or log this.");
    setIsVoiceNutritionListening(true);

    await stopReadAloud();

    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setIsVoiceNutritionListening(false);
      setVoiceNutritionMessage("Voice confirmation is not available on this device. Use Confirm log or manual save.");
      return;
    }

    if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
      setIsVoiceNutritionListening(false);
      setVoiceNutritionMessage("On-device voice confirmation is not available on this device. Use Confirm log or manual save.");
      return;
    }

    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setIsVoiceNutritionListening(false);
      setVoiceNutritionMessage("Microphone permission was denied. Use Confirm log or manual save.");
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
      setIsVoiceNutritionListening(false);
      setVoiceNutritionMessage("Voice confirmation could not start. Nothing was logged.");
      updateVoiceNutritionState("reviewLog");
    }
  }, [canUseCurrentVoiceNutritionReview, updateVoiceNutritionState]);

  useEffect(() => {
    const startListener = ExpoSpeechRecognitionModule.addListener("start", () => {
      if (voiceNutritionStateRef.current === "awaitingVoiceConfirmation") {
        setIsVoiceNutritionListening(true);
      }
    });
    const endListener = ExpoSpeechRecognitionModule.addListener("end", () => {
      setIsVoiceNutritionListening(false);
    });
    const resultListener = ExpoSpeechRecognitionModule.addListener(
      "result",
      (event: ExpoSpeechRecognitionResultEvent) => {
        if (!event.isFinal || voiceNutritionStateRef.current !== "awaitingVoiceConfirmation") {
          return;
        }

        const transcript = event.results
          .map((result) => result.transcript.trim())
          .find((candidate) => candidate.length > 0);

        handleVoiceNutritionTranscript(transcript ?? "");
      },
    );
    const errorListener = ExpoSpeechRecognitionModule.addListener(
      "error",
      (_event: ExpoSpeechRecognitionErrorEvent) => {
        if (voiceNutritionStateRef.current === "awaitingVoiceConfirmation") {
          setIsVoiceNutritionListening(false);
          setVoiceNutritionMessage("That was not a clear log confirmation. Nothing was logged.");
        }
      },
    );
    const nomatchListener = ExpoSpeechRecognitionModule.addListener("nomatch", () => {
      if (voiceNutritionStateRef.current === "awaitingVoiceConfirmation") {
        setIsVoiceNutritionListening(false);
        setVoiceNutritionMessage("That was not a clear log confirmation. Nothing was logged.");
      }
    });

    return () => {
      startListener.remove();
      endListener.remove();
      resultListener.remove();
      errorListener.remove();
      nomatchListener.remove();
      if (voiceNutritionStateRef.current === "awaitingVoiceConfirmation") {
        ExpoSpeechRecognitionModule.abort();
      }
    };
  }, [handleVoiceNutritionTranscript]);

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
        domains: ["nutrition"],
      });

      if (
        result.synced === 0 &&
        result.failed === 0 &&
        result.blockedOffline === 0 &&
        result.discarded > 0
      ) {
        await nutritionLogError.clear();
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
        await nutritionLogError.setLocalError({
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

      await Promise.all([
        nutritionLogError.clear(),
        nutritionRefresh.refreshLocal(),
        loadNutrition(),
      ]);
      setNotice({
        variant: "info",
        title: "Synced",
        message: "Nutrition updates synced.",
      });
    } finally {
      setIsSyncing(false);
    }
  }, [
    auth.token,
    isOffline,
    isSyncing,
    loadNutrition,
    pendingEntries.length,
    nutritionLogError,
    nutritionRefresh,
    patientId,
  ]);

  const listHeader = useMemo(() => {
    const showNotice = Boolean(notice && !(isOffline && notice.title === "Offline"));
    const canReviewVoiceLog = canUseCurrentVoiceNutritionReview;
    const canListenForVoiceLog =
      canReviewVoiceLog && voiceNutritionState !== "confirmedLog";
    const voiceStatusRole =
      voiceNutritionState === "needsValue" ||
      voiceNutritionState === "offlineBlocked" ||
      voiceNutritionState === "validationBlocked" ||
      voiceNutritionState === "expired"
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
                <LastRefreshed value={nutritionRefresh.label} compact />
                <LastFailedAttempt
                  label="Last load failure"
                  value={nutritionLoadError.label}
                  title={nutritionLoadError.lastError?.title}
                  message={nutritionLoadError.lastError?.message}
                  onClear={nutritionLoadError.lastError ? nutritionLoadError.clear : undefined}
                  compact
                />
                <LastFailedAttempt
                  label="Last log failure"
                  value={nutritionLogError.label}
                  title={nutritionLogError.lastError?.title}
                  message={nutritionLogError.lastError?.message}
                  onClear={nutritionLogError.lastError ? nutritionLogError.clear : undefined}
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
            message="New nutrition updates are saved on this device until you reconnect."
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
                <Text style={styles.storyEyebrow}>Today’s nutrition</Text>
                <Text style={styles.storyTitle}>{nutritionStoryTitle}</Text>
              </View>
              <StatusPill label={nutritionStatusLabel} variant={nutritionStatusTone} />
            </View>
            <Text style={styles.storyNote}>{nutritionStoryNote}</Text>
          </View>
        </Card>

        <View style={styles.sectionIntro}>
          <Text style={styles.sectionTitle}>Today at a glance</Text>
          <Text style={styles.sectionHelper}>
            Start here to see whether today is logged, how often you&apos;ve tracked nutrition this
            week, and whether anything is still waiting to sync.
          </Text>
        </View>

        <View style={styles.trackerGrid}>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="nutrition"
              label="Today logged"
              value={currentEntry ? "Yes" : "No"}
              delta="Daily log"
              tone={currentEntry ? "success" : "muted"}
              micro={{ type: "ring", progress: todayLoggedRatio }}
            />
          </View>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="warning"
              label="Pending"
              value={`${pendingCount}`}
              delta={
                nutritionSyncSummary.failedCount > 0
                  ? "Couldn’t sync"
                  : "Saved on this device"
              }
              tone="warning"
              micro={{ type: "dots", values: [pendingCount, 0, 0, 0, 0, 0, 0] }}
            />
          </View>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="progress"
              label="Tracked days"
              value={`${summary.trackedDays}/7`}
              delta="Last week"
              tone="accent"
              micro={{ type: "ring", progress: trackedRatio }}
            />
          </View>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="nutrition"
              label="Avg fruit/veg"
              value={summary.avgFruitVegServings !== null ? `${summary.avgFruitVegServings}` : "—"}
              delta="Servings/day"
              tone="primary"
              micro={{ type: "dots", values: [summary.trackedDays, summary.proteinOkHighDays, 1, 2, 3, 4, 5] }}
            />
          </View>
        </View>

        <MediaCard
          leading={{ type: "icon", icon: "nutrition", tone: "accent" }}
          title="Today’s nutrition"
          subtitle={
            currentEntry
              ? `Saved at ${formatTime(currentEntry.createdAt)}${currentEntry.pending ? " on this device" : ""}`
              : "No nutrition check saved for today yet."
          }
          chips={[
            {
              text:
                pendingCount > 0
                  ? `${nutritionSyncSurface.label} · ${pendingCount}`
                  : `Tracking from ${today}`,
              tone: pendingCount > 0 ? "warning" : "muted",
            },
          ]}
          statusPill={{ text: nutritionStatusLabel, tone: nutritionStatusTone }}
        />

        <Card variant="outlined" padding={tokens.spacing.md}>
          <View style={styles.formCard}>
            <View style={styles.formHeader}>
              <View style={styles.formHeaderText}>
                <Text style={styles.cardTitle}>Log today’s meals</Text>
                <Text style={styles.cardHelper}>
                  Capture a quick picture of how meals felt today. This stays short and focuses on
                  what supports recovery.
                </Text>
              </View>
              <StatusPill
                label={pendingCount > 0 ? nutritionSyncSurface.label : "Daily check"}
                variant={pendingCount > 0 ? "warning" : "neutral"}
              />
            </View>

            <Text style={styles.label}>Protein today</Text>
            <View style={styles.chipRow}>
              {(["low", "ok", "high"] as const).map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityLabel={`Protein ${option}`}
                  style={({ pressed }) => [
                    styles.chip,
                    form.protein === option ? styles.chipSelected : null,
                    pressed ? styles.pressed : null,
                  ]}
                  onPress={() => setForm((prev) => ({ ...prev, protein: option }))}
                >
                  <Text style={form.protein === option ? styles.chipTextSelected : styles.chipText}>
                    {option.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Fruit and veg servings</Text>
            <View style={styles.stepperRow}>
              <View style={styles.stepperButtonWrap}>
                <SecondaryButton
                  label="-"
                  disabled={form.fruitVegServings <= 0}
                  onPress={() =>
                    setForm((prev) => ({
                      ...prev,
                      fruitVegServings: Math.max(0, prev.fruitVegServings - 1),
                    }))
                  }
                />
              </View>
              <Text style={styles.stepperValue}>{form.fruitVegServings}</Text>
              <View style={styles.stepperButtonWrap}>
                <SecondaryButton
                  label="+"
                  disabled={form.fruitVegServings >= 6}
                  onPress={() =>
                    setForm((prev) => ({
                      ...prev,
                      fruitVegServings: Math.min(6, prev.fruitVegServings + 1),
                    }))
                  }
                />
              </View>
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.label}>Anti-inflammatory focus</Text>
              <Switch
                value={form.antiInflammatoryFocus}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, antiInflammatoryFocus: value }))
                }
              />
            </View>

            <Text style={styles.label}>Meal regularity today</Text>
            <View style={styles.chipRow}>
              {(["irregular", "mostly", "regular"] as const).map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityLabel={`Meal regularity ${option}`}
                  style={({ pressed }) => [
                    styles.chip,
                    form.mealRegularity === option ? styles.chipSelected : null,
                    pressed ? styles.pressed : null,
                  ]}
                  onPress={() =>
                    setForm((prev) => ({ ...prev, mealRegularity: option }))
                  }
                >
                  <Text
                    style={
                      form.mealRegularity === option ? styles.chipTextSelected : styles.chipText
                    }
                  >
                    {option}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Appetite today (optional)</Text>
            <View style={styles.chipRow}>
              {(["low", "normal", "high"] as const).map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  accessibilityLabel={`Appetite ${option}`}
                  style={({ pressed }) => [
                    styles.chip,
                    form.appetite === option ? styles.chipSelected : null,
                    pressed ? styles.pressed : null,
                  ]}
                  onPress={() =>
                    setForm((prev) => ({
                      ...prev,
                      appetite: prev.appetite === option ? null : option,
                    }))
                  }
                >
                  <Text style={form.appetite === option ? styles.chipTextSelected : styles.chipText}>
                    {option}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Add a short note (optional)</Text>
            <TextInput
              value={form.notes}
              onChangeText={(value) =>
                setForm((prev) => ({ ...prev, notes: value.slice(0, 280) }))
              }
              multiline
              maxLength={280}
              placeholder="Optional short note"
              placeholderTextColor={tokens.colors.textMuted}
              style={styles.notesInput}
            />
            <Text style={styles.metaText}>{form.notes.length}/280</Text>

            <View style={styles.voiceLogPanel}>
              <View style={styles.voiceLogHeader}>
                <View style={styles.voiceLogHeaderText}>
                  <Text accessibilityRole="header" style={styles.cardTitle}>
                    Voice nutrition review
                  </Text>
                  <Text style={styles.cardHelper}>
                    Review the exact current form summary, then confirm before anything is saved.
                  </Text>
                </View>
                <ReadAloudButton
                  text={voiceNutritionSummaryText}
                  label="Read nutrition voice log summary"
                  sourceId="nutrition-voice-log-summary"
                  testID="nutrition-voice-log-read-summary"
                />
              </View>

              <SecondaryButton
                label="Review for voice log"
                accessibilityLabel="Review nutrition voice log"
                accessibilityHint="Shows the exact nutrition log summary from the current form before any voice log can happen."
                onPress={() => handlePrepareVoiceNutritionReview()}
              />

              {voiceNutritionSnapshot ? (
                <View
                  accessible
                  accessibilityRole="summary"
                  accessibilityLabel={`Nutrition voice log summary. ${voiceNutritionSummaryText}`}
                  style={styles.voiceSummaryBox}
                >
                  <Text selectable style={styles.voiceSummaryText}>
                    {voiceNutritionSummaryText}
                  </Text>
                </View>
              ) : null}

              <Text style={styles.voiceSafetyCopy}>
                This logs nutrition only. It does not give diet advice, diagnosis, treatment advice, or emergency support.
              </Text>

              <View
                accessible
                accessibilityRole={voiceStatusRole}
                accessibilityLiveRegion="polite"
                accessibilityLabel="Nutrition voice log status"
                accessibilityHint={`State: ${voiceNutritionState}. ${voiceNutritionMessage ?? "Review the current nutrition form before voice logging."}`}
                style={[
                  styles.voiceStatusBox,
                  voiceStatusRole === "alert" ? styles.voiceStatusWarning : null,
                ]}
              >
                <Text style={styles.voiceStatusLabel}>Nutrition voice log status</Text>
                <Text style={styles.cardHelper}>
                  {voiceNutritionMessage ?? "Review the current nutrition form before voice logging."}
                </Text>
              </View>

              <View style={styles.voiceActionRow}>
                <View style={styles.voiceActionWrap}>
                  <SecondaryButton
                    label={isVoiceNutritionListening ? "Listening..." : "Listen for log confirmation"}
                    accessibilityLabel="Listen for nutrition log confirmation"
                    accessibilityHint="Listens once for yes log, confirm log, or log this."
                    loading={isVoiceNutritionListening}
                    disabled={!canListenForVoiceLog}
                    onPress={() => {
                      void handleListenForVoiceNutritionConfirmation();
                    }}
                  />
                </View>
                <View style={styles.voiceActionWrap}>
                  <PrimaryButton
                    label={voiceNutritionState === "logging" ? "Logging..." : "Confirm log"}
                    accessibilityLabel="Confirm nutrition voice log"
                    accessibilityHint="Logs the reviewed nutrition form through the same normal nutrition path."
                    loading={voiceNutritionState === "logging"}
                    disabled={!canReviewVoiceLog}
                    onPress={() => {
                      void submitReviewedVoiceNutritionLog();
                    }}
                  />
                </View>
                <View style={styles.voiceActionWrap}>
                  <SecondaryButton
                    label="Cancel"
                    accessibilityLabel="Cancel nutrition voice log"
                    accessibilityHint="Clears the current nutrition voice log review without logging."
                    onPress={() => handleCancelVoiceNutritionLog()}
                  />
                </View>
              </View>
            </View>

            <PrimaryButton
              label={isSaving ? "Saving..." : "Save today’s log"}
              loading={isSaving}
              disabled={isSaving}
              onPress={() => {
                void handleSaveToday();
              }}
            />
            <SecondaryButton
              label="Clear today’s draft"
              onPress={() => {
                setForm(toFormState(null));
              }}
            />
            {pendingCount > 0 ? (
              <PrimaryButton
                label={isSyncing ? "Syncing..." : nutritionSyncSummary.failedCount > 0 ? "Retry sync" : "Sync saved logs"}
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
          <Text style={styles.sectionTitle}>Recent pattern</Text>
          <Text style={styles.sectionHelper}>
            These weekly markers help you see consistency over the last seven days without turning
            today’s check into a long report.
          </Text>
        </View>

        <Card variant="outlined" padding={tokens.spacing.md}>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryTileWrap}>
              <TrackerTile
                icon="progress"
                label="Tracked days"
                value={`${summary.trackedDays}`}
                delta="Last 7 days"
                tone="accent"
                micro={{ type: "ring", progress: trackedRatio }}
                variant="compact"
              />
            </View>
            <View style={styles.summaryTileWrap}>
              <TrackerTile
                icon="nutrition"
                label="Avg fruit/veg"
                value={summary.avgFruitVegServings !== null ? `${summary.avgFruitVegServings}` : "—"}
                delta="Servings/day"
                tone="primary"
                micro={{ type: "dots", values: [1, 2, 3, 4, 5, 6, summary.trackedDays] }}
                variant="compact"
              />
            </View>
            <View style={styles.summaryTileWrap}>
              <TrackerTile
                icon="success"
                label="Protein OK/high"
                value={`${summary.proteinOkHighDays}`}
                delta="Last 7 days"
                tone="success"
                micro={{ type: "bars", values: [summary.proteinOkHighDays, summary.trackedDays, 2, 3, 4, 1, 5] }}
                variant="compact"
              />
            </View>
          </View>
        </Card>
      </View>
    );
  }, [
    currentEntry,
    form.antiInflammatoryFocus,
    form.appetite,
    form.fruitVegServings,
    form.mealRegularity,
    form.notes,
    form.protein,
    canUseCurrentVoiceNutritionReview,
    handleCancelVoiceNutritionLog,
    handleListenForVoiceNutritionConfirmation,
    handlePrepareVoiceNutritionReview,
    handleSaveToday,
    handleSyncPending,
    isOffline,
    isSaving,
    isSyncing,
    isVoiceNutritionListening,
    notice,
    nutritionStatusLabel,
    nutritionStatusTone,
    nutritionStoryNote,
    nutritionStoryTitle,
    nutritionSyncSummary.failedCount,
    nutritionSyncSurface.label,
    nutritionLoadError.clear,
    nutritionLoadError.label,
    nutritionLoadError.lastError?.message,
    nutritionLoadError.lastError?.title,
    nutritionLogError.clear,
    nutritionLogError.label,
    nutritionLogError.lastError?.message,
    nutritionLogError.lastError?.title,
    nutritionRefresh.label,
    pendingCount,
    showDiagnostics,
    styles.chip,
    styles.chipRow,
    styles.chipSelected,
    styles.chipText,
    styles.chipTextSelected,
    styles.cardHelper,
    styles.cardTitle,
    styles.diagContent,
    styles.diagTitle,
    styles.diagTitleRow,
    styles.diagToggle,
    styles.formCard,
    styles.formHeader,
    styles.formHeaderText,
    styles.label,
    styles.listHeader,
    styles.metaText,
    styles.notesInput,
    styles.pressed,
    styles.sectionHelper,
    styles.sectionIntro,
    styles.sectionTitle,
    styles.storyCard,
    styles.storyEyebrow,
    styles.storyHeader,
    styles.storyHeaderText,
    styles.storyNote,
    styles.storyTitle,
    styles.stepperButtonWrap,
    styles.stepperRow,
    styles.stepperValue,
    styles.summaryGrid,
    styles.summaryTileWrap,
    styles.switchRow,
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
    submitReviewedVoiceNutritionLog,
    summary.avgFruitVegServings,
    summary.proteinOkHighDays,
    summary.trackedDays,
    tokens.colors.textMuted,
    tokens.spacing.md,
    today,
    todayLoggedRatio,
    trackedRatio,
    voiceNutritionMessage,
    voiceNutritionSnapshot,
    voiceNutritionState,
    voiceNutritionSummaryText,
  ]);

  if (auth.status === "loading") {
    return (
      <Screen
        scroll={false}
        header={<HeroHeader variant="compact" title="Nutrition" subtitle="Quick daily log" />}
      >
        <EmptyState
          variant="compact"
          title="Loading nutrition tracker"
          description="Preparing your recent nutrition entries."
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
          title="Nutrition"
          subtitle="Daily support"
          left={<Avatar size={40} name="Nutrition" fallback="icon" iconKey="nutrition" />}
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
            <StatusPill label={nutritionStatusLabel} variant={nutritionStatusTone} />
            <StatusPill label={`${summary.trackedDays}/7 tracked`} variant="info" />
            <StatusPill label={isOffline ? "Offline" : `${pendingCount} pending`} variant={isOffline ? "warning" : pendingCount > 0 ? "warning" : "neutral"} />
          </View>
        </HeroHeader>
      }
    >
      <FlatList
        data={[]}
        renderItem={() => null}
        ListHeaderComponent={listHeader}
        ListFooterComponent={
          isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="small" />
            </View>
          ) : null
        }
        keyExtractor={(_item, index) => `nutrition-${index}`}
        contentContainerStyle={styles.container}
      />
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      paddingBottom: tokens.spacing.xxxl,
    },
    listHeader: {
      gap: tokens.spacing.md,
    },
    headerMetaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    centered: {
      minHeight: 100,
      alignItems: "center",
      justifyContent: "center",
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
    summaryGrid: {
      gap: tokens.spacing.sm,
    },
    summaryTileWrap: {
      width: "100%",
      minWidth: 0,
    },
    formCard: {
      gap: tokens.spacing.sm,
    },
    formHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
      marginBottom: tokens.spacing.xs,
    },
    formHeaderText: {
      flex: 1,
      gap: tokens.spacing.xs,
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
    label: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
      marginBottom: tokens.spacing.xs,
    },
    chip: {
      minHeight: 44,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: 999,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      backgroundColor: tokens.colors.surfaceElevated,
      alignItems: "center",
      justifyContent: "center",
    },
    chipSelected: {
      backgroundColor: tokens.colors.primary,
      borderColor: tokens.colors.primary,
    },
    chipText: {
      color: tokens.colors.text,
      fontWeight: tokens.typography.weights.semibold,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    chipTextSelected: {
      color: tokens.colors.primaryTextOn,
      fontWeight: tokens.typography.weights.semibold,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    stepperRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
      marginBottom: tokens.spacing.xs,
    },
    stepperButtonWrap: {
      flex: 1,
    },
    stepperValue: {
      minWidth: 52,
      textAlign: "center",
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      color: tokens.colors.text,
    },
    switchRow: {
      marginBottom: tokens.spacing.xs,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.md,
    },
    notesInput: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.md,
      minHeight: 92,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm + 2,
      textAlignVertical: "top",
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      color: tokens.colors.text,
      backgroundColor: tokens.colors.surface,
    },
    metaText: {
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      color: tokens.colors.textMuted,
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
