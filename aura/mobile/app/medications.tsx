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
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { isApiError, type ApiError } from "@/src/api/client";
import {
  getMedications,
  getMedicationToday,
  type MedicationDose,
  type MedicationLogPayload,
  type MedicationTodayResponse,
} from "@/src/api/patient";
import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
import { Card } from "@/src/components/Card";
import { DomainIcon } from "@/src/components/IconSet";
import { HeroHeader } from "@/src/components/HeroHeader";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { MediaCard } from "@/src/components/MediaCard";
import { ReadAloudButton } from "@/src/components/ReadAloudButton";
import { Screen } from "@/src/components/Screen";
import { StatusPill } from "@/src/components/StatusPill";
import { TrackerTile } from "@/src/components/TrackerTile";
import { useAuth } from "@/src/state/auth";
import {
  getCachedMedicationToday,
  setCachedMedicationToday,
} from "@/src/state/medicationTodayCache";
import {
  getCachedMedications,
  setCachedMedications,
} from "@/src/state/medicationsCache";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { useLastRefreshed } from "@/src/state/refresh";
import { getQueueableSyncSurface } from "@/src/sync/copy";
import { sendMedicationSync } from "@/src/sync/adapters/medications";
import { flushPendingWrites, submitQueueableWrite } from "@/src/sync/runner";
import { selectPendingMedicationEntries, useSyncDomainSummary } from "@/src/sync/selectors";
import { useSyncPatientState } from "@/src/sync/store";
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

type MedicationDoseOutcome = {
  status: "logged" | "queued" | "validationBlocked" | "failed" | "ignored";
  message?: string;
};

type VoiceMedicationLogState =
  | "draftReady"
  | "needsDose"
  | "needsStatus"
  | "reviewLog"
  | "awaitingVoiceConfirmation"
  | "confirmedLog"
  | "cancelled"
  | "logging"
  | "logged"
  | "offlineBlocked"
  | "validationBlocked"
  | "expired";

type VoiceMedicationSnapshot = {
  medicationId: string;
  name: string;
  time: string;
  timeLabel: string;
  status: "taken" | "skipped";
  note?: string;
  signature: string;
};

function toBannerVariant(variant: NoticeState["variant"]): "info" | "warning" | "danger" {
  return variant === "error" ? "danger" : variant;
}

function toFriendlyMedicationError(error: unknown, title: string): {
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
      message: "You’re offline. Dose log was queued for sync.",
      kind: "offline",
      retryable: true,
    };
  }
  if (appError.kind === "network") {
    return {
      title,
      message: "Couldn’t reach the service. Dose log was queued.",
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
      message: appError.message || "Dose log values were invalid.",
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

function applyPendingToToday(
  base: MedicationTodayResponse | null,
  pending: Array<{
    createdAt: string;
    localId: string;
    payload: {
      medicationId: string;
      date: string;
      time: string;
      status: "taken" | "skipped";
    };
  }>,
  date: string
): MedicationTodayResponse | null {
  if (!base) {
    return null;
  }

  const nextItems = base.items.map((item) => ({
    ...item,
    doses: item.doses.map((dose) => ({ ...dose })),
  }));

  const relevant = pending
    .filter((entry) => entry.payload.date === date)
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));

  for (const entry of relevant) {
    const medication = nextItems.find(
      (item) => item.medicationId === entry.payload.medicationId
    );
    const dose = medication?.doses.find(
      (candidate) => candidate.time === entry.payload.time
    );
    if (!dose) {
      continue;
    }
    dose.status = entry.payload.status;
    dose.pending = true;
    dose.localId = entry.localId;
    dose.loggedAt = entry.createdAt;
  }

  return {
    ...base,
    items: nextItems,
  };
}

function buildFallbackTodayFromMedications(
  date: string,
  cachedList: Awaited<ReturnType<typeof getCachedMedications>>
): MedicationTodayResponse | null {
  if (!cachedList || cachedList.medications.length === 0) {
    return null;
  }

  return {
    ok: true,
    date,
    items: cachedList.medications.map((item) => ({
      medicationId: item.id,
      name: item.name,
      type: item.type,
      instructions: item.instructions,
      doses: item.schedule.times.map((time) => ({
        time,
        status: "due",
      })),
    })),
  };
}

function applyDoseUpdate(
  base: MedicationTodayResponse | null,
  payload: {
    medicationId: string;
    time: string;
    status: "taken" | "skipped";
    loggedAt?: string;
    pending?: boolean;
    localId?: string;
  }
): MedicationTodayResponse | null {
  if (!base) {
    return null;
  }

  return {
    ...base,
    items: base.items.map((item) => {
      if (item.medicationId !== payload.medicationId) {
        return item;
      }
      return {
        ...item,
        doses: item.doses.map((dose) =>
          dose.time === payload.time
            ? {
                ...dose,
                status: payload.status,
                loggedAt: payload.loggedAt ?? new Date().toISOString(),
                pending: payload.pending,
                localId: payload.localId,
              }
            : dose
        ),
      };
    }),
  };
}

function toDosePillVariant(status: MedicationDose["status"]): "neutral" | "success" | "warning" {
  if (status === "taken") {
    return "success";
  }
  if (status === "skipped") {
    return "warning";
  }
  return "neutral";
}

function formatTimeLabel(value: string): string {
  const [hourString, minuteString] = value.split(":");
  const hour = Number.parseInt(hourString ?? "", 10);
  const minute = Number.parseInt(minuteString ?? "", 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return value;
  }
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function buildVoiceMedicationSignature(input: {
  medicationId: string;
  time: string;
  status: "taken" | "skipped";
  note?: string;
}): string {
  return [
    input.medicationId,
    input.time,
    input.status,
    input.note?.trim().slice(0, 280) ?? "",
  ].join("::");
}

function formatTime(iso: string): string {
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) {
    return "Unknown";
  }
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function toDoseStatusLabel(dose: MedicationDose): string {
  if (dose.pending) {
    return dose.status === "taken"
      ? "Saved on this device"
      : dose.status === "skipped"
        ? "Saved on this device"
        : "Syncing";
  }
  if (dose.status === "taken") {
    return "Taken";
  }
  if (dose.status === "skipped") {
    return "Skipped";
  }
  return "Due";
}

function toLastErrorKind(
  kind: "offline" | "network" | "server" | "validation" | "conflict" | "unknown"
): "offline" | "network" | "server" | "validation" | "unknown" {
  if (kind === "conflict") {
    return "validation";
  }
  return kind;
}

export default function MedicationsScreen() {
  const auth = useAuth();
  const router = useRouter();
  const isOffline = useIsOffline();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const medicationsRefresh = useLastRefreshed("medications");
  const medicationsLoadError = useLastError("medicationsLoad");
  const medicationLogError = useLastError("medicationLog");

  const patientId = auth.patient?.id ?? "";
  const today = useMemo(() => todayISO(), []);
  const tzOffsetMinutes = -new Date().getTimezoneOffset();
  const syncState = useSyncPatientState(patientId);
  const medicationSyncSummary = useSyncDomainSummary(patientId, "medications");
  const medicationSyncSurface = useMemo(
    () => getQueueableSyncSurface(medicationSyncSummary),
    [medicationSyncSummary]
  );
  const pendingLogs = useMemo(
    () => selectPendingMedicationEntries(syncState),
    [syncState]
  );

  const [baseTodayChecklist, setBaseTodayChecklist] =
    useState<MedicationTodayResponse | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeDoseKey, setActiveDoseKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [voiceMedicationState, setVoiceMedicationState] =
    useState<VoiceMedicationLogState>("draftReady");
  const [voiceMedicationMessage, setVoiceMedicationMessage] = useState<string | null>(null);
  const [voiceMedicationSnapshot, setVoiceMedicationSnapshot] =
    useState<VoiceMedicationSnapshot | null>(null);
  const [isVoiceMedicationListening, setIsVoiceMedicationListening] = useState(false);
  const voiceMedicationStateRef = useRef<VoiceMedicationLogState>("draftReady");
  const voiceMedicationExpiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const todayChecklist = useMemo(
    () => applyPendingToToday(baseTodayChecklist, pendingLogs, today),
    [baseTodayChecklist, pendingLogs, today]
  );
  const pendingCount = pendingLogs.length;
  const takenCount = useMemo(
    () =>
      todayChecklist?.items.reduce(
        (sum, item) => sum + item.doses.filter((dose) => dose.status === "taken").length,
        0
      ) ?? 0,
    [todayChecklist]
  );
  const totalDoses = useMemo(
    () =>
      todayChecklist?.items.reduce((sum, item) => sum + item.doses.length, 0) ?? 0,
    [todayChecklist]
  );
  const doseProgress = totalDoses > 0 ? Math.max(0, Math.min(1, takenCount / totalDoses)) : 0;
  const dueCount = useMemo(
    () =>
      todayChecklist?.items.reduce(
        (sum, item) => sum + item.doses.filter((dose) => dose.status === "due").length,
        0
      ) ?? 0,
    [todayChecklist]
  );
  const medicationsStatusLabel =
    totalDoses === 0
      ? "Nothing due"
      : dueCount === 0
        ? "All checked"
        : dueCount === 1
          ? "1 dose due"
          : `${dueCount} doses due`;
  const medicationsStatusTone =
    totalDoses === 0 ? "neutral" : dueCount === 0 ? "success" : pendingCount > 0 ? "warning" : "info";
  const medicationsStoryTitle =
    totalDoses === 0
      ? "No medications scheduled for today"
      : dueCount === 0
        ? "Today’s medication checklist is complete"
        : `Next step: review ${dueCount === 1 ? "the due dose" : `${dueCount} due doses`}`;
  const medicationsStoryNote =
    totalDoses === 0
      ? "This checklist will show scheduled doses here when they’re available for today."
      : dueCount === 0
        ? "All scheduled doses have been logged. You can still review times, notes, and any pending sync items below."
        : "Mark each scheduled dose as taken or skipped so today’s checklist stays accurate and easy to follow.";

  const loadToday = useCallback(async () => {
    if (!auth.token || !patientId) {
      return;
    }

    setIsLoading(true);
    setNotice(null);

    if (isOffline) {
      const [cached, cachedList] = await Promise.all([
        getCachedMedicationToday(patientId, today),
        getCachedMedications(patientId),
      ]);
      setBaseTodayChecklist(
        cached
          ? {
              ok: true,
              date: cached.date,
              items: cached.items,
            }
          : buildFallbackTodayFromMedications(today, cachedList)
      );
      setNotice({
        variant: "warning",
        title: "Offline",
        message: "Offline — showing saved medication checklist when available.",
      });
      setIsLoading(false);
      return;
    }

    try {
      const [live, list] = await Promise.all([
        getMedicationToday(auth.token, { date: today, tzOffsetMinutes }),
        getMedications(auth.token),
      ]);
      setBaseTodayChecklist(live);
      await Promise.all([setCachedMedicationToday(patientId, live), setCachedMedications(patientId, list)]);
      await medicationsRefresh.refreshLocal();
      await medicationsLoadError.clear();
    } catch (error) {
      const friendly = toFriendlyMedicationError(error, "Couldn’t load medications");
      await medicationsLoadError.setLocalError({
        title: friendly.title,
        message: friendly.message,
        kind: friendly.kind,
        retryable: friendly.retryable,
      });

      const [cached, cachedList] = await Promise.all([
        getCachedMedicationToday(patientId, today),
        getCachedMedications(patientId),
      ]);
      setBaseTodayChecklist(
        cached
          ? {
              ok: true,
              date: cached.date,
              items: cached.items,
            }
          : buildFallbackTodayFromMedications(today, cachedList)
      );
      setNotice({
        variant: cached ? "warning" : "error",
        title: friendly.title,
        message: cached ? "Showing saved checklist." : friendly.message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    auth.token,
    isOffline,
    medicationsLoadError,
    medicationsRefresh,
    patientId,
    today,
    tzOffsetMinutes,
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

  const clearVoiceMedicationExpiryTimer = useCallback(() => {
    if (voiceMedicationExpiryTimerRef.current) {
      clearTimeout(voiceMedicationExpiryTimerRef.current);
      voiceMedicationExpiryTimerRef.current = null;
    }
  }, []);

  const updateVoiceMedicationState = useCallback((nextState: VoiceMedicationLogState) => {
    voiceMedicationStateRef.current = nextState;
    setVoiceMedicationState(nextState);
  }, []);

  const startVoiceMedicationExpiryTimer = useCallback(() => {
    clearVoiceMedicationExpiryTimer();
    voiceMedicationExpiryTimerRef.current = setTimeout(() => {
      setVoiceMedicationSnapshot(null);
      setIsVoiceMedicationListening(false);
      setVoiceMedicationMessage("Medication voice log review expired. Review again before logging.");
      updateVoiceMedicationState("expired");
    }, 30_000);
  }, [clearVoiceMedicationExpiryTimer, updateVoiceMedicationState]);

  useEffect(
    () => () => {
      clearVoiceMedicationExpiryTimer();
    },
    [clearVoiceMedicationExpiryTimer],
  );

  const handleDoseAction = useCallback(
    async (payload: MedicationLogPayload): Promise<MedicationDoseOutcome> => {
      if (!auth.token || !patientId) {
        return { status: "ignored" };
      }

      const doseKey = `${payload.medicationId}:${payload.time}`;
      setActiveDoseKey(doseKey);
      const note = noteDraft.trim();
      const finalPayload = {
        ...payload,
        note: note ? note.slice(0, 280) : undefined,
      };

      try {
        const result = await submitQueueableWrite({
          patientId,
          token: auth.token,
          isOffline,
          domain: "medications",
          payload: {
            ...finalPayload,
            date: finalPayload.date ?? today,
          },
          send: sendMedicationSync,
        });

        if (result.kind === "synced") {
          const nextChecklist = applyDoseUpdate(baseTodayChecklist, {
            medicationId: payload.medicationId,
            time: payload.time,
            status: payload.status,
            loggedAt: new Date().toISOString(),
          });
          setBaseTodayChecklist(nextChecklist);
          if (nextChecklist) {
            await setCachedMedicationToday(patientId, nextChecklist);
          }
          await medicationLogError.clear();
          await medicationsRefresh.refreshLocal();
          setNotice({
            variant: "info",
            title: "Synced",
            message: "Dose update synced.",
          });
          setNoteDraft("");
          return { status: "logged", message: "Dose update synced." };
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
          await medicationLogError.setLocalError({
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
        const friendly = toFriendlyMedicationError(error, "Couldn’t save medication log");
        await medicationLogError.setLocalError({
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
        setActiveDoseKey(null);
      }
    },
    [
      auth.token,
      baseTodayChecklist,
      isOffline,
      medicationLogError,
      medicationsRefresh,
      noteDraft,
      patientId,
      today,
    ]
  );

  const currentVoiceMedicationSignature = voiceMedicationSnapshot
    ? buildVoiceMedicationSignature({
        medicationId: voiceMedicationSnapshot.medicationId,
        time: voiceMedicationSnapshot.time,
        status: voiceMedicationSnapshot.status,
        note: noteDraft,
      })
    : "";
  const voiceMedicationSummaryText = voiceMedicationSnapshot
    ? `Medication log: Mark ${voiceMedicationSnapshot.name} scheduled at ${voiceMedicationSnapshot.timeLabel} today as ${voiceMedicationSnapshot.status}.`
    : "No medication voice log is ready.";
  const canUseCurrentVoiceMedicationReview =
    voiceMedicationSnapshot !== null
      ? voiceMedicationSnapshot.signature === currentVoiceMedicationSignature &&
        (voiceMedicationState === "reviewLog" ||
          voiceMedicationState === "awaitingVoiceConfirmation" ||
          voiceMedicationState === "confirmedLog")
      : false;

  const handlePrepareVoiceMedicationReview = useCallback(
    (input: {
      medicationId: string;
      name: string;
      time: string;
      timeLabel: string;
      status: "taken" | "skipped";
    }) => {
      if (!input.medicationId || !input.time) {
        clearVoiceMedicationExpiryTimer();
        setVoiceMedicationSnapshot(null);
        setIsVoiceMedicationListening(false);
        setVoiceMedicationMessage("Choose a scheduled dose before voice logging.");
        updateVoiceMedicationState("needsDose");
        return;
      }

      if (input.status !== "taken" && input.status !== "skipped") {
        clearVoiceMedicationExpiryTimer();
        setVoiceMedicationSnapshot(null);
        setIsVoiceMedicationListening(false);
        setVoiceMedicationMessage("Choose taken or skipped before voice logging.");
        updateVoiceMedicationState("needsStatus");
        return;
      }

      const note = noteDraft.trim().slice(0, 280);
      const nextSignature = buildVoiceMedicationSignature({
        medicationId: input.medicationId,
        time: input.time,
        status: input.status,
        note,
      });
      const previousSnapshot = voiceMedicationSnapshot;

      setVoiceMedicationSnapshot({
        ...input,
        note: note ? note : undefined,
        signature: nextSignature,
      });
      setVoiceMedicationMessage(
        previousSnapshot &&
          (previousSnapshot.medicationId !== input.medicationId ||
            previousSnapshot.time !== input.time ||
            previousSnapshot.status !== input.status)
          ? "Medication selection changed. Review this new summary, then say yes log or press Confirm log."
          : "Review this medication log, then say yes log or press Confirm log.",
      );
      updateVoiceMedicationState("reviewLog");
      startVoiceMedicationExpiryTimer();
    },
    [
      clearVoiceMedicationExpiryTimer,
      noteDraft,
      startVoiceMedicationExpiryTimer,
      updateVoiceMedicationState,
      voiceMedicationSnapshot,
    ],
  );

  const handleCancelVoiceMedicationLog = useCallback(
    (message = "Medication voice log cancelled.") => {
      clearVoiceMedicationExpiryTimer();
      setVoiceMedicationSnapshot(null);
      setIsVoiceMedicationListening(false);
      setVoiceMedicationMessage(message);
      updateVoiceMedicationState("cancelled");
      if (isVoiceMedicationListening) {
        ExpoSpeechRecognitionModule.abort();
      }
    },
    [
      clearVoiceMedicationExpiryTimer,
      isVoiceMedicationListening,
      updateVoiceMedicationState,
    ],
  );

  const submitReviewedVoiceMedicationLog = useCallback(async () => {
    if (!voiceMedicationSnapshot) {
      setVoiceMedicationMessage("Choose a scheduled dose and status before voice logging.");
      updateVoiceMedicationState("needsDose");
      return;
    }

    if (!canUseCurrentVoiceMedicationReview) {
      setVoiceMedicationMessage("Medication selection changed. Review again before voice logging.");
      updateVoiceMedicationState("draftReady");
      return;
    }

    updateVoiceMedicationState("confirmedLog");
    setVoiceMedicationMessage("Medication voice log confirmed.");
    clearVoiceMedicationExpiryTimer();
    setIsVoiceMedicationListening(false);
    updateVoiceMedicationState("logging");
    setVoiceMedicationMessage("Logging this reviewed medication status.");

    const outcome = await handleDoseAction({
      medicationId: voiceMedicationSnapshot.medicationId,
      date: today,
      time: voiceMedicationSnapshot.time,
      status: voiceMedicationSnapshot.status,
    });

    if (outcome.status === "logged") {
      setVoiceMedicationSnapshot(null);
      setVoiceMedicationMessage(outcome.message ?? "Medication status logged.");
      updateVoiceMedicationState("logged");
      return;
    }

    if (outcome.status === "queued") {
      setVoiceMedicationSnapshot(null);
      setVoiceMedicationMessage(outcome.message ?? "Saved on this device.");
      updateVoiceMedicationState(isOffline ? "offlineBlocked" : "logged");
      return;
    }

    if (outcome.status === "validationBlocked") {
      setVoiceMedicationMessage(outcome.message ?? "Invalid medication log.");
      updateVoiceMedicationState("validationBlocked");
      return;
    }

    setVoiceMedicationMessage(outcome.message ?? "Medication log could not be saved.");
    updateVoiceMedicationState("reviewLog");
  }, [
    canUseCurrentVoiceMedicationReview,
    clearVoiceMedicationExpiryTimer,
    handleDoseAction,
    isOffline,
    today,
    updateVoiceMedicationState,
    voiceMedicationSnapshot,
  ]);

  const handleVoiceMedicationTranscript = useCallback(
    (transcript: string) => {
      setIsVoiceMedicationListening(false);
      if (voiceMedicationStateRef.current !== "awaitingVoiceConfirmation") {
        return;
      }

      if (
        !voiceMedicationSnapshot ||
        voiceMedicationSnapshot.signature !== currentVoiceMedicationSignature
      ) {
        clearVoiceMedicationExpiryTimer();
        setVoiceMedicationSnapshot(null);
        setVoiceMedicationMessage("Medication selection changed. Review again before voice logging.");
        updateVoiceMedicationState("draftReady");
        return;
      }

      const result = parseVoiceHealthLogConfirmation(transcript);
      if (result === "confirm") {
        void submitReviewedVoiceMedicationLog();
        return;
      }

      if (result === "cancel") {
        handleCancelVoiceMedicationLog();
        return;
      }

      setVoiceMedicationMessage(
        "That was not a clear log confirmation. Say yes log, confirm log, or log this.",
      );
      updateVoiceMedicationState("awaitingVoiceConfirmation");
    },
    [
      clearVoiceMedicationExpiryTimer,
      currentVoiceMedicationSignature,
      handleCancelVoiceMedicationLog,
      submitReviewedVoiceMedicationLog,
      updateVoiceMedicationState,
      voiceMedicationSnapshot,
    ],
  );

  const handleListenForVoiceMedicationConfirmation = useCallback(async () => {
    if (!canUseCurrentVoiceMedicationReview) {
      setVoiceMedicationMessage(
        voiceMedicationStateRef.current === "expired"
          ? "Medication voice log review expired. Review again before logging."
          : "Review again before voice logging.",
      );
      updateVoiceMedicationState("expired");
      return;
    }

    updateVoiceMedicationState("awaitingVoiceConfirmation");
    setVoiceMedicationMessage("Listening for yes log, confirm log, or log this.");
    setIsVoiceMedicationListening(true);

    await stopReadAloud();

    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setIsVoiceMedicationListening(false);
      setVoiceMedicationMessage("Voice confirmation is not available on this device. Use Confirm log or manual dose buttons.");
      return;
    }

    if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
      setIsVoiceMedicationListening(false);
      setVoiceMedicationMessage("On-device voice confirmation is not available on this device. Use Confirm log or manual dose buttons.");
      return;
    }

    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setIsVoiceMedicationListening(false);
      setVoiceMedicationMessage("Microphone permission was denied. Use Confirm log or manual dose buttons.");
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
      setIsVoiceMedicationListening(false);
      setVoiceMedicationMessage("Voice confirmation could not start. Nothing was logged.");
      updateVoiceMedicationState("reviewLog");
    }
  }, [canUseCurrentVoiceMedicationReview, updateVoiceMedicationState]);

  useEffect(() => {
    const startListener = ExpoSpeechRecognitionModule.addListener("start", () => {
      if (voiceMedicationStateRef.current === "awaitingVoiceConfirmation") {
        setIsVoiceMedicationListening(true);
      }
    });
    const endListener = ExpoSpeechRecognitionModule.addListener("end", () => {
      setIsVoiceMedicationListening(false);
    });
    const resultListener = ExpoSpeechRecognitionModule.addListener(
      "result",
      (event: ExpoSpeechRecognitionResultEvent) => {
        if (!event.isFinal || voiceMedicationStateRef.current !== "awaitingVoiceConfirmation") {
          return;
        }

        const transcript = event.results
          .map((result) => result.transcript.trim())
          .find((candidate) => candidate.length > 0);

        handleVoiceMedicationTranscript(transcript ?? "");
      },
    );
    const errorListener = ExpoSpeechRecognitionModule.addListener(
      "error",
      (_event: ExpoSpeechRecognitionErrorEvent) => {
        if (voiceMedicationStateRef.current === "awaitingVoiceConfirmation") {
          setIsVoiceMedicationListening(false);
          setVoiceMedicationMessage("That was not a clear log confirmation. Nothing was logged.");
        }
      },
    );
    const nomatchListener = ExpoSpeechRecognitionModule.addListener("nomatch", () => {
      if (voiceMedicationStateRef.current === "awaitingVoiceConfirmation") {
        setIsVoiceMedicationListening(false);
        setVoiceMedicationMessage("That was not a clear log confirmation. Nothing was logged.");
      }
    });

    return () => {
      startListener.remove();
      endListener.remove();
      resultListener.remove();
      errorListener.remove();
      nomatchListener.remove();
      if (voiceMedicationStateRef.current === "awaitingVoiceConfirmation") {
        ExpoSpeechRecognitionModule.abort();
      }
    };
  }, [handleVoiceMedicationTranscript]);

  const syncPending = useCallback(async () => {
    if (!auth.token || !patientId || isOffline || isSyncing) {
      return;
    }
    if (pendingLogs.length === 0) {
      return;
    }

    setIsSyncing(true);
    setNotice(null);

    try {
      const result = await flushPendingWrites({
        patientId,
        token: auth.token,
        isOnline: !isOffline,
        domains: ["medications"],
      });

      if (
        result.synced === 0 &&
        result.failed === 0 &&
        result.blockedOffline === 0 &&
        result.discarded > 0
      ) {
        await medicationLogError.clear();
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
        await medicationLogError.setLocalError({
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
        medicationLogError.clear(),
        medicationsRefresh.refreshLocal(),
      ]);
      await loadToday();
      setNotice({
        variant: "info",
        title: "Synced",
        message: "Medication updates synced.",
      });
    } finally {
      setIsSyncing(false);
    }
  }, [
    auth.token,
    isOffline,
    isSyncing,
    loadToday,
    medicationLogError,
    medicationsRefresh,
    pendingLogs.length,
    patientId,
  ]);

  const listHeader = useMemo(() => {
    const showNotice = Boolean(notice && !(isOffline && notice.title === "Offline"));
    const canReviewVoiceMedicationLog = canUseCurrentVoiceMedicationReview;
    const canListenForVoiceMedicationLog =
      canReviewVoiceMedicationLog && voiceMedicationState !== "confirmedLog";
    const voiceMedicationStatusRole =
      voiceMedicationState === "needsDose" ||
      voiceMedicationState === "needsStatus" ||
      voiceMedicationState === "offlineBlocked" ||
      voiceMedicationState === "validationBlocked" ||
      voiceMedicationState === "expired"
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
                <LastRefreshed value={medicationsRefresh.label} compact />
                <LastFailedAttempt
                  label="Last load failure"
                  value={medicationsLoadError.label}
                  title={medicationsLoadError.lastError?.title}
                  message={medicationsLoadError.lastError?.message}
                  onClear={medicationsLoadError.lastError ? medicationsLoadError.clear : undefined}
                  compact
                />
                <LastFailedAttempt
                  label="Last log failure"
                  value={medicationLogError.label}
                  title={medicationLogError.lastError?.title}
                  message={medicationLogError.lastError?.message}
                  onClear={medicationLogError.lastError ? medicationLogError.clear : undefined}
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
            message="New dose updates are saved on this device until you reconnect."
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
                <Text style={styles.storyEyebrow}>Today’s medication plan</Text>
                <Text style={styles.storyTitle}>{medicationsStoryTitle}</Text>
              </View>
              <StatusPill label={medicationsStatusLabel} variant={medicationsStatusTone} />
            </View>
            <Text style={styles.storyNote}>{medicationsStoryNote}</Text>
          </View>
        </Card>

        <View style={styles.sectionIntro}>
          <Text style={styles.sectionTitle}>Today at a glance</Text>
          <Text style={styles.sectionHelper}>
            Start here to see how many doses are complete, whether anything still needs attention,
            and if any updates are still waiting to sync.
          </Text>
        </View>

        <View style={styles.trackerGrid}>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="meds"
              label="Taken"
              value={`${takenCount}/${totalDoses}`}
              delta="Today's doses"
              tone="success"
              micro={{ type: "ring", progress: doseProgress }}
            />
          </View>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="warning"
              label="Pending"
              value={`${pendingCount}`}
              delta={
                medicationSyncSummary.failedCount > 0
                  ? "Couldn’t sync"
                  : "Saved on this device"
              }
              tone="warning"
              micro={{ type: "dots", values: [pendingCount, 0, 0, 0, 0, 0, 0] }}
            />
          </View>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="info"
              label="Today"
              value={today}
              delta="Checklist date"
              tone="muted"
              micro={{ type: "dots", values: [1, 2, 3, 4, 5, 6, 7] }}
            />
          </View>
          <View style={styles.trackerTileWrap}>
            <TrackerTile
              icon="progress"
              label="Sync"
              value={isOffline ? "Offline" : "Ready"}
              delta="Medication logs"
              tone={isOffline ? "warning" : "accent"}
              micro={{ type: "dots", values: [pendingCount, takenCount, totalDoses, 0, 0, 0, 0] }}
            />
          </View>
        </View>

        {pendingCount > 0 ? (
          <MediaCard
            leading={{ type: "icon", icon: "warning", tone: "warning" }}
            title={medicationSyncSurface.label}
            subtitle={`${pendingCount} medication update${pendingCount === 1 ? "" : "s"} saved on this device`}
            actions={[
              {
                label: isSyncing ? "Syncing..." : medicationSyncSummary.failedCount > 0 ? "Retry sync" : "Sync now",
                kind: "primary",
                disabled: isOffline || isSyncing,
                onPress: () => {
                  void syncPending();
                },
              },
            ]}
            statusPill={{ text: medicationSyncSurface.label, tone: "warning" }}
          />
        ) : null}

        <Card variant="outlined" padding={tokens.spacing.md}>
          <View style={styles.noteCard}>
            <View style={styles.noteHeader}>
              <View style={styles.noteHeaderText}>
                <Text style={styles.noteTitle}>Dose note</Text>
                <Text style={styles.noteHelper}>
                  Add a short note before you log the next dose if there’s anything you want to
                  remember.
                </Text>
              </View>
              <StatusPill
                label={noteDraft.trim().length > 0 ? "Draft note" : "Optional"}
                variant={noteDraft.trim().length > 0 ? "info" : "neutral"}
              />
            </View>
            <TextInput
              value={noteDraft}
              onChangeText={(value) => setNoteDraft(value.slice(0, 280))}
              multiline
              maxLength={280}
              placeholder="Optional short note"
              placeholderTextColor={tokens.colors.textMuted}
              style={styles.noteInput}
            />
            <Text style={styles.metaText}>{noteDraft.length}/280</Text>
          </View>
        </Card>

        <Card variant="outlined" padding={tokens.spacing.md}>
          <View style={styles.voiceLogPanel}>
            <View style={styles.voiceLogHeader}>
              <View style={styles.voiceLogHeaderText}>
                <Text accessibilityRole="header" style={styles.noteTitle}>
                  Voice medication review
                </Text>
                <Text style={styles.noteHelper}>
                  Choose Review mark taken or Review mark skipped on a scheduled dose, review the exact log, then confirm before anything is saved.
                </Text>
              </View>
              <ReadAloudButton
                text={voiceMedicationSummaryText}
                label="Read medication voice log summary"
                sourceId="medication-voice-log-summary"
                testID="medication-voice-log-read-summary"
              />
            </View>

            {voiceMedicationSnapshot ? (
              <View
                accessible
                accessibilityRole="summary"
                accessibilityLabel={`Medication voice log summary. ${voiceMedicationSummaryText}`}
                style={styles.voiceSummaryBox}
              >
                <Text selectable style={styles.voiceSummaryText}>
                  {voiceMedicationSummaryText}
                </Text>
              </View>
            ) : null}

            <Text style={styles.voiceSafetyCopy}>
              This only records medication status. It does not change your medication plan, dose, or schedule.
            </Text>

            <View
              accessible
              accessibilityRole={voiceMedicationStatusRole}
              accessibilityLiveRegion="polite"
              accessibilityLabel="Medication voice log status"
              accessibilityHint={`State: ${voiceMedicationState}. ${voiceMedicationMessage ?? "Choose a scheduled dose and status before voice logging."}`}
              style={[
                styles.voiceStatusBox,
                voiceMedicationStatusRole === "alert" ? styles.voiceStatusWarning : null,
              ]}
            >
              <Text style={styles.voiceStatusLabel}>Medication voice log status</Text>
              <Text style={styles.noteHelper}>
                {voiceMedicationMessage ?? "Choose a scheduled dose and status before voice logging."}
              </Text>
            </View>

            <View style={styles.voiceActionRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Listen for medication log confirmation"
                accessibilityHint="Listens once for yes log, confirm log, or log this."
                accessibilityState={{ disabled: !canListenForVoiceMedicationLog, busy: isVoiceMedicationListening }}
                disabled={!canListenForVoiceMedicationLog}
                onPress={() => {
                  void handleListenForVoiceMedicationConfirmation();
                }}
                style={({ pressed }) => [
                  styles.actionButtonSecondary,
                  !canListenForVoiceMedicationLog ? styles.actionButtonDisabled : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={styles.actionButtonSecondaryText}>
                  {isVoiceMedicationListening ? "Listening..." : "Listen for log confirmation"}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Confirm medication voice log"
                accessibilityHint="Logs the reviewed medication status through the same normal medication path."
                accessibilityState={{ disabled: !canReviewVoiceMedicationLog, busy: voiceMedicationState === "logging" }}
                disabled={!canReviewVoiceMedicationLog}
                onPress={() => {
                  void submitReviewedVoiceMedicationLog();
                }}
                style={({ pressed }) => [
                  styles.actionButton,
                  !canReviewVoiceMedicationLog ? styles.actionButtonDisabled : null,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={styles.actionButtonText}>
                  {voiceMedicationState === "logging" ? "Logging..." : "Confirm log"}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel medication voice log"
                accessibilityHint="Clears the current medication voice log review without logging."
                onPress={() => handleCancelVoiceMedicationLog()}
                style={({ pressed }) => [
                  styles.actionButtonSecondary,
                  pressed ? styles.pressed : null,
                ]}
              >
                <Text style={styles.actionButtonSecondaryText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Card>

        <View style={styles.sectionIntro}>
          <Text style={styles.sectionTitle}>Today’s checklist</Text>
          <Text style={styles.sectionHelper}>
            Work through the scheduled doses below. The current status is shown beside each time so
            you can see what is taken, skipped, or still due.
          </Text>
        </View>
      </View>
    );
  }, [
    dueCount,
    doseProgress,
    canUseCurrentVoiceMedicationReview,
    handleCancelVoiceMedicationLog,
    handleListenForVoiceMedicationConfirmation,
    isOffline,
    isSyncing,
    isVoiceMedicationListening,
    medicationsStatusLabel,
    medicationsStatusTone,
    medicationsStoryNote,
    medicationsStoryTitle,
    medicationLogError.clear,
    medicationLogError.label,
    medicationLogError.lastError?.message,
    medicationLogError.lastError?.title,
    medicationsLoadError.clear,
    medicationsLoadError.label,
    medicationsLoadError.lastError?.message,
    medicationsLoadError.lastError?.title,
    medicationSyncSummary.failedCount,
    medicationSyncSurface.label,
    medicationsRefresh.label,
    notice,
    noteDraft,
    pendingCount,
    setNoteDraft,
    showDiagnostics,
    styles.diagContent,
    styles.diagTitle,
    styles.diagTitleRow,
    styles.diagToggle,
    styles.listHeader,
    styles.metaText,
    styles.noteCard,
    styles.noteHeader,
    styles.noteHeaderText,
    styles.noteHelper,
    styles.noteInput,
    styles.noteTitle,
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
    styles.trackerGrid,
    styles.trackerTileWrap,
    styles.voiceActionRow,
    styles.voiceLogHeader,
    styles.voiceLogHeaderText,
    styles.voiceLogPanel,
    styles.voiceSafetyCopy,
    styles.voiceStatusBox,
    styles.voiceStatusLabel,
    styles.voiceStatusWarning,
    styles.voiceSummaryBox,
    styles.voiceSummaryText,
    submitReviewedVoiceMedicationLog,
    syncPending,
    takenCount,
    today,
    tokens.colors.textMuted,
    tokens.spacing.md,
    totalDoses,
    voiceMedicationMessage,
    voiceMedicationSnapshot,
    voiceMedicationState,
    voiceMedicationSummaryText,
  ]);

  if (auth.status === "loading") {
    return (
      <Screen
        scroll={false}
        header={<HeroHeader variant="compact" title="Medications" subtitle="Daily checklist" />}
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
          title="Medications"
          subtitle="Daily support"
          left={<Avatar size={40} name="Medications" fallback="icon" iconKey="meds" />}
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
            <StatusPill label={`${takenCount}/${totalDoses || 0} taken`} variant="success" />
            <StatusPill label={medicationsStatusLabel} variant={medicationsStatusTone} />
            <StatusPill
              label={isOffline ? "Offline" : pendingCount > 0 ? `${pendingCount} pending` : "Ready"}
              variant={isOffline ? "warning" : pendingCount > 0 ? "warning" : "neutral"}
            />
          </View>
        </HeroHeader>
      }
    >
      <FlatList
        data={todayChecklist?.items ?? []}
        keyExtractor={(item) => item.medicationId}
        contentContainerStyle={styles.container}
        ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="small" />
            </View>
          ) : (
            <Card variant="outlined" padding={tokens.spacing.md}>
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No medications scheduled today</Text>
                <Text style={styles.metaText}>
                  Today’s checklist will appear here when there are scheduled doses to review.
                </Text>
              </View>
            </Card>
          )
        }
        renderItem={({ item }) => {
          const pendingDoseCount = item.doses.filter((dose) => dose.pending).length;
          const takenDoseCount = item.doses.filter((dose) => dose.status === "taken").length;
          const dueDoseCount = item.doses.filter((dose) => dose.status === "due").length;
          const allTaken = item.doses.length > 0 && takenDoseCount === item.doses.length;

          return (
            <View style={styles.medicationItem}>
              <MediaCard
                leading={{ type: "icon", icon: "meds", tone: pendingDoseCount > 0 ? "warning" : "accent" }}
                title={`${item.name} (${item.type})`}
                subtitle={
                  item.instructions
                    ? item.instructions
                    : "Review the scheduled doses below for today."
                }
                chips={[
                  { text: `${item.doses.length} dose(s)`, tone: "muted" },
                  ...(pendingDoseCount > 0
                    ? [{ text: "Pending", tone: "warning" as const }]
                    : []),
                  ...(dueDoseCount > 0 ? [{ text: "Due", tone: "info" as const }] : []),
                ]}
                statusPill={
                  pendingDoseCount > 0
                    ? { text: "Pending", tone: "warning" }
                    : allTaken
                      ? { text: "Complete", tone: "success" }
                      : { text: "Due", tone: "info" }
                }
              />
              <Card variant="outlined" padding={tokens.spacing.md}>
                {item.doses.length === 0 ? (
                  <Text style={styles.metaText}>No doses due for this date.</Text>
                ) : (
                  <View style={styles.doseList}>
                    {item.doses.map((dose) => {
                      const key = `${item.medicationId}:${dose.time}`;
                      const isBusy = activeDoseKey === key;
                      return (
                        <View key={key} style={styles.doseRow}>
                          <View style={styles.doseMain}>
                            <View style={styles.doseTextBlock}>
                              <Text style={styles.doseTime}>{formatTimeLabel(dose.time)}</Text>
                              <Text style={styles.doseMeta}>
                                {dose.loggedAt
                                  ? `${dose.pending ? "Saved on this device" : "Logged"} at ${formatTime(dose.loggedAt)}`
                                  : "Waiting to be logged"}
                              </Text>
                            </View>
                            <StatusPill
                              label={toDoseStatusLabel(dose)}
                              variant={toDosePillVariant(dose.status)}
                            />
                          </View>
                          <View style={styles.actionRow}>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Mark ${item.name} dose at ${formatTimeLabel(dose.time)} as taken`}
                              disabled={isBusy}
                              onPress={() => {
                                void handleDoseAction({
                                  medicationId: item.medicationId,
                                  date: today,
                                  time: dose.time,
                                  status: "taken",
                                });
                              }}
                              style={({ pressed }) => [
                                styles.actionButton,
                                isBusy ? styles.actionButtonDisabled : null,
                                pressed ? styles.pressed : null,
                              ]}
                            >
                              <Text style={styles.actionButtonText}>Mark taken</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Mark ${item.name} dose at ${formatTimeLabel(dose.time)} as skipped`}
                              disabled={isBusy}
                              onPress={() => {
                                void handleDoseAction({
                                  medicationId: item.medicationId,
                                  date: today,
                                  time: dose.time,
                                  status: "skipped",
                                });
                              }}
                              style={({ pressed }) => [
                                styles.actionButtonSecondary,
                                isBusy ? styles.actionButtonDisabled : null,
                                pressed ? styles.pressed : null,
                              ]}
                            >
                              <Text style={styles.actionButtonSecondaryText}>Mark skipped</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Review mark ${item.name} dose at ${formatTimeLabel(dose.time)} as taken`}
                              accessibilityHint="Shows the exact medication status summary before any voice log can happen."
                              disabled={isBusy}
                              onPress={() => {
                                handlePrepareVoiceMedicationReview({
                                  medicationId: item.medicationId,
                                  name: item.name,
                                  time: dose.time,
                                  timeLabel: formatTimeLabel(dose.time),
                                  status: "taken",
                                });
                              }}
                              style={({ pressed }) => [
                                styles.actionButtonSecondary,
                                isBusy ? styles.actionButtonDisabled : null,
                                pressed ? styles.pressed : null,
                              ]}
                            >
                              <Text style={styles.actionButtonSecondaryText}>Review taken</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Review mark ${item.name} dose at ${formatTimeLabel(dose.time)} as skipped`}
                              accessibilityHint="Shows the exact medication status summary before any voice log can happen."
                              disabled={isBusy}
                              onPress={() => {
                                handlePrepareVoiceMedicationReview({
                                  medicationId: item.medicationId,
                                  name: item.name,
                                  time: dose.time,
                                  timeLabel: formatTimeLabel(dose.time),
                                  status: "skipped",
                                });
                              }}
                              style={({ pressed }) => [
                                styles.actionButtonSecondary,
                                isBusy ? styles.actionButtonDisabled : null,
                                pressed ? styles.pressed : null,
                              ]}
                            >
                              <Text style={styles.actionButtonSecondaryText}>Review skipped</Text>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </Card>
            </View>
          );
        }}
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
      minHeight: 100,
      alignItems: "center",
      justifyContent: "center",
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
    metaText: {
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      color: tokens.colors.textMuted,
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
    noteCard: {
      gap: tokens.spacing.xs,
    },
    noteHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    noteHeaderText: {
      flex: 1,
      gap: tokens.spacing.xs,
    },
    noteTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    noteHelper: {
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      color: tokens.colors.textMuted,
    },
    noteInput: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.md,
      minHeight: 88,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm + 2,
      textAlignVertical: "top",
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      color: tokens.colors.text,
      backgroundColor: tokens.colors.surface,
    },
    medicationItem: {
      gap: tokens.spacing.sm,
    },
    doseList: {
      gap: tokens.spacing.sm,
    },
    doseRow: {
      gap: tokens.spacing.sm,
    },
    doseMain: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    doseTextBlock: {
      flex: 1,
      gap: tokens.spacing.xs,
    },
    doseTime: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    doseMeta: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    actionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    actionButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: tokens.spacing.md,
    },
    actionButtonSecondary: {
      flex: 1,
      minHeight: 44,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surfaceElevated,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: tokens.spacing.md,
    },
    actionButtonDisabled: {
      opacity: 0.55,
    },
    actionButtonText: {
      color: tokens.colors.primaryTextOn,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    actionButtonSecondaryText: {
      color: tokens.colors.accent,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    voiceLogPanel: {
      gap: tokens.spacing.sm,
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
      backgroundColor: tokens.colors.surfaceElevated,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
    },
    voiceSummaryText: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
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
      backgroundColor: tokens.colors.surface,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      gap: tokens.spacing.xs,
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
