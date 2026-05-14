import React from "react";
import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionErrorEvent,
  type ExpoSpeechRecognitionResultEvent,
} from "expo-speech-recognition";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import Constants from "expo-constants";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { isApiError, type ApiError } from "@/src/api/client";
import {
  cancelMyRequest,
  createAppointmentRequest,
  listAvailableSlots,
  listMyRequests,
  type AppointmentRequestItem,
  type AppointmentSlot,
} from "@/src/api/appointments";
import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
import { Card } from "@/src/components/Card";
import { DomainIcon } from "@/src/components/IconSet";
import { EmptyState } from "@/src/components/EmptyState";
import { GlassPanel } from "@/src/components/GlassPanel";
import { HeroHeader } from "@/src/components/HeroHeader";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { MediaCard, type MediaCardAction, type MediaCardChip } from "@/src/components/MediaCard";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { SegmentedControl } from "@/src/components/SegmentedControl";
import { StatusPill } from "@/src/components/StatusPill";
import { useAuth } from "@/src/state/auth";
import {
  getCachedAppointmentRequests,
  getCachedAppointmentSlots,
  setCachedAppointmentRequests,
  setCachedAppointmentSlots,
} from "@/src/state/appointmentsCache";
import {
  clearReminderForRequest,
  getAllRemindersForPatient,
  setReminderForRequest,
} from "@/src/state/appointmentReminders";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { useLastRefreshed } from "@/src/state/refresh";
import { useTokens } from "@/src/theme/tokens";
import { FINAL_DEMO_VOICE_UI_ENABLED } from "@/src/config/finalDemoScope";
import {
  appointmentWorkflowTone,
  buildAppointmentChips,
  formatAppointmentRelativeLabel,
  formatAppointmentTimeRange,
  formatAppointmentWorkflowLabel,
  getAppointmentWorkflowStatus,
} from "@/src/utils/appointments";
import {
  formatPatientAbsoluteDateTime,
  formatPatientClockTime,
  formatPatientDateHeading,
} from "@/src/utils/date";
import { normalizeUnknownError } from "@/src/utils/errors";
import { parseVoiceAppointmentRequestConfirmation } from "@/src/utils/voiceAppointmentRequestConfirmation";

type NoticeState = {
  variant: "info" | "warning" | "error";
  title: string;
  message: string;
};

type ViewMode = "book" | "requests" | "upcoming";
type VoiceAppointmentRequestState =
  | "draftReady"
  | "needsSlot"
  | "needsReason"
  | "reviewRequest"
  | "awaitingVoiceConfirmation"
  | "confirmedRequest"
  | "cancelled"
  | "requesting"
  | "requested"
  | "offlineBlocked"
  | "expired"
  | "unavailableSlot";

type VoiceAppointmentRequestSnapshot = {
  slotId: string;
  startsAt: string;
  endsAt: string;
  modality: AppointmentSlot["modality"];
  clinicianName?: string;
  note?: string;
  signature: string;
};

type AppointmentRequestOutcome =
  | { status: "authRequired" }
  | { status: "offlineBlocked" }
  | { status: "requested" }
  | { status: "unavailableSlot"; title: string; message: string }
  | { status: "failed"; title: string; message: string };

type SlotGroupListItem = {
  type: "slotGroup";
  dateLabel: string;
  dateKey: string;
  slots: AppointmentSlot[];
};

type RequestListItem = {
  type: "request";
  item: AppointmentRequestItem;
};

type EmptyListItem = {
  type: "empty";
  kind: ViewMode;
};

type ListItem = SlotGroupListItem | RequestListItem | EmptyListItem;
type AppointmentRouteParams = {
  mode?: string | string[];
};

const REMINDER_LEAD_MS = 15 * 60 * 1000;
const VOICE_REQUEST_CONFIRMATION_EXPIRY_MS = 30_000;
const isExpoGo = Constants.appOwnership === "expo";
type NotificationsModule = typeof import("expo-notifications");

async function getNotifications(): Promise<NotificationsModule | null> {
  if (Platform.OS === "web" || isExpoGo) {
    return null;
  }
  try {
    return await import("expo-notifications");
  } catch {
    return null;
  }
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
      message: "Server error. Please retry shortly.",
      kind: "server",
      retryable: true,
    };
  }
  if (appError.kind === "validation") {
    return {
      title,
      message: appError.message || "Request was invalid.",
      kind: "validation",
      retryable: false,
    };
  }
  return {
    title,
    message: appError.message || "Something went wrong.",
    kind: "unknown",
    retryable: true,
  };
}

function toBannerVariant(variant: NoticeState["variant"]): "info" | "warning" | "danger" {
  return variant === "error" ? "danger" : variant;
}

function formatDateTime(value: string): string {
  return formatPatientAbsoluteDateTime(value) ?? "Time unavailable";
}

function formatTime(value: string): string {
  return formatPatientClockTime(value) ?? "Time unavailable";
}

function formatDateHeading(value: string): string {
  return formatPatientDateHeading(value) ?? "Date unavailable";
}

function formatDurationMinutes(startsAt: string, endsAt: string): string | null {
  const startMs = Date.parse(startsAt);
  const endMs = Date.parse(endsAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }

  const minutes = Math.round((endMs - startMs) / 60_000);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function formatModalityLabel(modality: AppointmentSlot["modality"]): string {
  return modality === "video" ? "Video visit" : "Appointment";
}

function buildVoiceRequestSignature(
  slot: AppointmentSlot,
  note: string,
): string {
  return [
    slot.slotId,
    slot.startsAt,
    slot.endsAt,
    slot.modality,
    slot.clinicianName ?? "",
    note.trim().slice(0, 280),
  ].join("|");
}

function buildVoiceRequestSnapshot(
  slot: AppointmentSlot,
  note: string,
): VoiceAppointmentRequestSnapshot {
  const trimmedNote = note.trim().slice(0, 280);
  return {
    slotId: slot.slotId,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    modality: slot.modality,
    clinicianName: slot.clinicianName,
    note: trimmedNote || undefined,
    signature: buildVoiceRequestSignature(slot, note),
  };
}

function toLocalDateKey(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return `invalid-${value}`;
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function scheduleAppointmentReminder(startsAtISO: string): Promise<string | null> {
  const startsAtMs = Date.parse(startsAtISO);
  if (!Number.isFinite(startsAtMs)) {
    return null;
  }
  const triggerAtMs = startsAtMs - REMINDER_LEAD_MS;
  if (triggerAtMs <= Date.now()) {
    return null;
  }

  const notifications = await getNotifications();
  if (!notifications) {
    return null;
  }

  try {
    const currentPermissions = await notifications.getPermissionsAsync();
    const granted = currentPermissions.granted
      ? true
      : (await notifications.requestPermissionsAsync()).granted;
    if (!granted) {
      return null;
    }

    return notifications.scheduleNotificationAsync({
      content: {
        title: "Upcoming appointment",
        body: "Your Aura session starts in 15 minutes.",
      },
      trigger: {
        type: notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(triggerAtMs),
      },
    });
  } catch {
    return null;
  }
}

export default function AppointmentsScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<AppointmentRouteParams>();
  const isOffline = useIsOffline();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const appointmentsRefresh = useLastRefreshed("appointments");
  const appointmentsLoadError = useLastError("appointmentsLoad");
  const appointmentRequestError = useLastError("appointmentRequest");

  const patientId = auth.patient?.id ?? "";
  const patientName = auth.patient?.displayName ?? auth.patient?.id ?? "Patient";
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [requests, setRequests] = useState<AppointmentRequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [requestingSlotId, setRequestingSlotId] = useState<string | null>(null);
  const [cancelingRequestId, setCancelingRequestId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const initialMode = useMemo<ViewMode>(() => {
    const rawMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
    return rawMode === "requests" || rawMode === "upcoming" ? rawMode : "book";
  }, [params.mode]);
  const [mode, setMode] = useState<ViewMode>(initialMode);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const voiceRequestStateRef = useRef<VoiceAppointmentRequestState>("needsSlot");
  const voiceRequestExpiryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [voiceRequestState, setVoiceRequestState] =
    useState<VoiceAppointmentRequestState>("needsSlot");
  const [voiceRequestSnapshot, setVoiceRequestSnapshot] =
    useState<VoiceAppointmentRequestSnapshot | null>(null);
  const [voiceRequestMessage, setVoiceRequestMessage] = useState(
    "Select a time before voice request.",
  );
  const [isVoiceRequestListening, setIsVoiceRequestListening] = useState(false);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const pendingCount = useMemo(
    () => requests.filter((item) => item.status === "pending").length,
    [requests],
  );
  const approvedRequests = useMemo(
    () =>
      requests
        .filter((item) => item.status === "approved")
        .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt)),
    [requests],
  );
  const nextApproved = approvedRequests.find(
    (item) => Date.parse(item.startsAt) > Date.now(),
  );
  const workflowStory = useMemo(() => {
    if (nextApproved) {
      return {
        title: "Your next session is already taking shape.",
        body: "Keep upcoming visits in view here, then use requests when you need to check approval or make a change.",
      };
    }

    if (pendingCount > 0) {
      return {
        title: "A request is waiting for review.",
        body: "You can keep an eye on request status here while you browse other times or add context for your clinician.",
      };
    }

    if (slots.length > 0) {
      return {
        title: "Open times are ready to review.",
        body: "Start with available slots, then move to requests or upcoming visits once a time is selected and approved.",
      };
    }

    return {
      title: "No visit is lined up right now.",
      body: "Check back here for new availability or review your existing requests when something changes.",
    };
  }, [nextApproved, pendingCount, slots.length]);

  const sortedRequests = useMemo(
    () => [...requests].sort((left, right) => Date.parse(right.startsAt) - Date.parse(left.startsAt)),
    [requests],
  );

  const upcomingRequests = useMemo(
    () => approvedRequests.filter((item) => Date.parse(item.startsAt) > Date.now()),
    [approvedRequests],
  );

  const groupedSlots = useMemo<SlotGroupListItem[]>(() => {
    const sorted = [...slots].sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
    const groups = new Map<string, SlotGroupListItem>();

    for (const slot of sorted) {
      const dateKey = toLocalDateKey(slot.startsAt);
      const existing = groups.get(dateKey);
      if (existing) {
        existing.slots.push(slot);
        continue;
      }

      groups.set(dateKey, {
        type: "slotGroup",
        dateKey,
        dateLabel: formatDateHeading(slot.startsAt),
        slots: [slot],
      });
    }

    return Array.from(groups.values()).sort((left, right) => left.dateKey.localeCompare(right.dateKey));
  }, [slots]);

  const selectedSlot = useMemo(
    () => slots.find((slot) => slot.slotId === selectedSlotId) ?? null,
    [selectedSlotId, slots],
  );
  const currentVoiceRequestSignature = useMemo(
    () => (selectedSlot ? buildVoiceRequestSignature(selectedSlot, noteDraft) : null),
    [noteDraft, selectedSlot],
  );

  const clearVoiceRequestExpiryTimer = useCallback(() => {
    if (voiceRequestExpiryRef.current) {
      clearTimeout(voiceRequestExpiryRef.current);
      voiceRequestExpiryRef.current = null;
    }
  }, []);

  const updateVoiceRequestState = useCallback((nextState: VoiceAppointmentRequestState) => {
    voiceRequestStateRef.current = nextState;
    setVoiceRequestState(nextState);
  }, []);

  const startVoiceRequestExpiryTimer = useCallback(() => {
    clearVoiceRequestExpiryTimer();
    voiceRequestExpiryRef.current = setTimeout(() => {
      setVoiceRequestSnapshot(null);
      setIsVoiceRequestListening(false);
      setVoiceRequestMessage("Voice request review expired. Review again before requesting.");
      updateVoiceRequestState("expired");
    }, VOICE_REQUEST_CONFIRMATION_EXPIRY_MS);
  }, [clearVoiceRequestExpiryTimer, updateVoiceRequestState]);

  useEffect(
    () => () => {
      clearVoiceRequestExpiryTimer();
    },
    [clearVoiceRequestExpiryTimer],
  );

  useEffect(() => {
    if (!selectedSlot) {
      clearVoiceRequestExpiryTimer();
      setVoiceRequestSnapshot(null);
      setIsVoiceRequestListening(false);
      setVoiceRequestMessage("Select a time before voice request.");
      updateVoiceRequestState("needsSlot");
      return;
    }

    if (!voiceRequestSnapshot) {
      if (voiceRequestStateRef.current === "needsSlot") {
        setVoiceRequestMessage("Review this selected time before requesting by voice.");
        updateVoiceRequestState("draftReady");
      }
      return;
    }

    if (
      currentVoiceRequestSignature &&
      voiceRequestSnapshot.signature !== currentVoiceRequestSignature &&
      voiceRequestStateRef.current !== "requesting" &&
      voiceRequestStateRef.current !== "requested"
    ) {
      clearVoiceRequestExpiryTimer();
      setVoiceRequestSnapshot(null);
      setIsVoiceRequestListening(false);
      setVoiceRequestMessage("Appointment request changed. Review again before requesting.");
      updateVoiceRequestState("draftReady");
    }
  }, [
    clearVoiceRequestExpiryTimer,
    currentVoiceRequestSignature,
    selectedSlot,
    updateVoiceRequestState,
    voiceRequestSnapshot,
  ]);

  const syncReminders = useCallback(
    async (nextRequests: AppointmentRequestItem[]) => {
      if (!patientId.trim()) {
        return;
      }
      const reminderMap = await getAllRemindersForPatient(patientId);
      const approvedFuture = nextRequests.filter(
        (item) =>
          item.status === "approved" &&
          Number.isFinite(Date.parse(item.startsAt)) &&
          Date.parse(item.startsAt) - REMINDER_LEAD_MS > Date.now(),
      );
      const approvedIds = new Set(approvedFuture.map((item) => item.requestId));

      for (const request of approvedFuture) {
        if (reminderMap[request.requestId]) {
          continue;
        }
        const notificationId = await scheduleAppointmentReminder(request.startsAt);
        if (notificationId) {
          await setReminderForRequest(patientId, request.requestId, notificationId);
        }
      }

      for (const requestId of Object.keys(reminderMap)) {
        if (!approvedIds.has(requestId)) {
          await clearReminderForRequest(patientId, requestId);
        }
      }
    },
    [patientId],
  );

  const loadAppointments = useCallback(async () => {
    if (!auth.token || !patientId) {
      return;
    }

    setIsLoading(true);
    setNotice(null);

    if (isOffline) {
      const [cachedSlots, cachedRequests] = await Promise.all([
        getCachedAppointmentSlots(patientId),
        getCachedAppointmentRequests(patientId),
      ]);
      setSlots(cachedSlots?.slots ?? []);
      setRequests(cachedRequests?.requests ?? []);
      setNotice({
        variant: "warning",
        title: "Offline",
        message: "Offline — booking is unavailable. Showing saved info.",
      });
      setIsLoading(false);
      return;
    }

    try {
      const [liveSlots, liveRequests] = await Promise.all([
        listAvailableSlots(auth.token, { limit: 50 }),
        listMyRequests(auth.token),
      ]);

      setSlots(liveSlots);
      setRequests(liveRequests);
      await Promise.all([
        setCachedAppointmentSlots(patientId, liveSlots),
        setCachedAppointmentRequests(patientId, liveRequests),
        appointmentsRefresh.refreshLocal(),
        appointmentsLoadError.clear(),
      ]);
      await syncReminders(liveRequests);
    } catch (error) {
      const friendly = toFriendlyError(error, "Couldn’t load appointments");
      await appointmentsLoadError.setLocalError({
        title: friendly.title,
        message: friendly.message,
        kind: friendly.kind,
        retryable: friendly.retryable,
      });

      const [cachedSlots, cachedRequests] = await Promise.all([
        getCachedAppointmentSlots(patientId),
        getCachedAppointmentRequests(patientId),
      ]);
      const fallbackSlots = cachedSlots?.slots ?? [];
      const fallbackRequests = cachedRequests?.requests ?? [];
      setSlots(fallbackSlots);
      setRequests(fallbackRequests);
      setNotice({
        variant: fallbackSlots.length > 0 || fallbackRequests.length > 0 ? "warning" : "error",
        title: friendly.title,
        message:
          fallbackSlots.length > 0 || fallbackRequests.length > 0
            ? "Showing saved appointment data."
            : friendly.message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    appointmentsLoadError,
    appointmentsRefresh,
    auth.token,
    isOffline,
    patientId,
    syncReminders,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (auth.status !== "signedIn") {
        return;
      }
      void loadAppointments();
      return undefined;
    }, [auth.status, loadAppointments]),
  );

  const handleRequestSlot = useCallback(
    async (slot: AppointmentSlot): Promise<AppointmentRequestOutcome> => {
      if (!auth.token || !patientId) {
        return { status: "authRequired" };
      }

      if (isOffline) {
        await appointmentRequestError.setLocalError({
          title: "Booking unavailable offline",
          message: "You’re offline. Nothing was sent.",
          kind: "offline",
          retryable: true,
        });
        setNotice({
          variant: "warning",
          title: "Offline",
          message: "Booking is unavailable while offline.",
        });
        return { status: "offlineBlocked" };
      }

      setRequestingSlotId(slot.slotId);
      setNotice(null);
      try {
        await createAppointmentRequest(auth.token, {
          slotId: slot.slotId,
          note: noteDraft.trim() ? noteDraft.trim().slice(0, 280) : undefined,
        });
        await appointmentRequestError.clear();
        setNoteDraft("");
        setSelectedSlotId(null);
        await loadAppointments();
        setNotice({
          variant: "info",
          title: "Request sent",
          message: "Your request is pending clinician approval.",
        });
        return { status: "requested" };
      } catch (error) {
        const friendly = toFriendlyError(error, "Couldn’t request appointment");
        await appointmentRequestError.setLocalError({
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
        return friendly.kind === "validation" ||
          friendly.message.toLowerCase().includes("unavailable") ||
          friendly.message.toLowerCase().includes("no longer available")
          ? {
              status: "unavailableSlot",
              title:
                friendly.title === "Something went wrong"
                  ? "Couldn’t request appointment"
                  : friendly.title,
              message: friendly.message,
            }
          : {
              status: "failed",
              title: friendly.title,
              message: friendly.message,
            };
      } finally {
        setRequestingSlotId(null);
      }
    },
    [
      appointmentRequestError,
      auth.token,
      isOffline,
      loadAppointments,
      noteDraft,
      patientId,
    ],
  );

  const handleCancelRequest = useCallback(
    async (requestItem: AppointmentRequestItem) => {
      if (!auth.token || !patientId) {
        return;
      }
      if (isOffline) {
        await appointmentRequestError.setLocalError({
          title: "Cancel unavailable offline",
          message: "You’re offline. Nothing was sent.",
          kind: "offline",
          retryable: true,
        });
        setNotice({
          variant: "warning",
          title: "Offline",
          message: "Cancel is unavailable while offline.",
        });
        return;
      }

      setCancelingRequestId(requestItem.requestId);
      setNotice(null);
      try {
        await cancelMyRequest(auth.token, requestItem.requestId);
        await clearReminderForRequest(patientId, requestItem.requestId);
        await appointmentRequestError.clear();
        await loadAppointments();
        setNotice({
          variant: "info",
          title: "Request canceled",
          message: "Your appointment request was canceled.",
        });
      } catch (error) {
        const friendly = toFriendlyError(error, "Couldn’t cancel request");
        await appointmentRequestError.setLocalError({
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
      } finally {
        setCancelingRequestId(null);
      }
    },
    [appointmentRequestError, auth.token, isOffline, loadAppointments, patientId],
  );

  const canUseCurrentVoiceRequestReview =
    Boolean(voiceRequestSnapshot) &&
    voiceRequestSnapshot?.signature === currentVoiceRequestSignature &&
    (voiceRequestState === "reviewRequest" ||
      voiceRequestState === "awaitingVoiceConfirmation" ||
      voiceRequestState === "confirmedRequest");

  const handlePrepareVoiceRequestReview = useCallback(() => {
    if (!selectedSlot) {
      clearVoiceRequestExpiryTimer();
      setVoiceRequestSnapshot(null);
      setIsVoiceRequestListening(false);
      setVoiceRequestMessage("Choose an available time before using voice request.");
      updateVoiceRequestState("needsSlot");
      return;
    }

    const nextSnapshot = buildVoiceRequestSnapshot(selectedSlot, noteDraft);
    setVoiceRequestSnapshot(nextSnapshot);
    setVoiceRequestMessage(
      "Review this appointment request, then say yes request or press Confirm request.",
    );
    updateVoiceRequestState("reviewRequest");
    startVoiceRequestExpiryTimer();
  }, [
    clearVoiceRequestExpiryTimer,
    noteDraft,
    selectedSlot,
    startVoiceRequestExpiryTimer,
    updateVoiceRequestState,
  ]);

  const handleCancelVoiceRequest = useCallback((message = "Voice request cancelled.") => {
    clearVoiceRequestExpiryTimer();
    setVoiceRequestSnapshot(null);
    setIsVoiceRequestListening(false);
    setVoiceRequestMessage(message);
    updateVoiceRequestState("cancelled");
    if (isVoiceRequestListening) {
      ExpoSpeechRecognitionModule.abort();
    }
  }, [
    clearVoiceRequestExpiryTimer,
    isVoiceRequestListening,
    updateVoiceRequestState,
  ]);

  const submitReviewedVoiceRequest = useCallback(async () => {
    if (!canUseCurrentVoiceRequestReview || !voiceRequestSnapshot || !selectedSlot) {
      setVoiceRequestMessage("Voice request review expired. Review again before requesting.");
      updateVoiceRequestState("expired");
      return;
    }

    updateVoiceRequestState("confirmedRequest");
    setVoiceRequestMessage("Voice request confirmed.");
    clearVoiceRequestExpiryTimer();

    setVoiceRequestMessage("Sending this reviewed appointment request.");
    updateVoiceRequestState("requesting");
    const outcome = await handleRequestSlot(selectedSlot);

    if (outcome.status === "requested") {
      setVoiceRequestSnapshot(null);
      setVoiceRequestMessage("Your request is pending clinician approval.");
      updateVoiceRequestState("requested");
      return;
    }

    if (outcome.status === "offlineBlocked") {
      setVoiceRequestSnapshot(null);
      setVoiceRequestMessage("Voice request is paused while you’re offline. Nothing was sent.");
      updateVoiceRequestState("offlineBlocked");
      return;
    }

    if (outcome.status === "unavailableSlot") {
      setVoiceRequestMessage(`${outcome.title}. ${outcome.message}`);
      updateVoiceRequestState("unavailableSlot");
      return;
    }

    setVoiceRequestMessage(
      outcome.status === "failed"
        ? `${outcome.title}. ${outcome.message}`
        : "Couldn’t request this appointment. Review before trying again.",
    );
    updateVoiceRequestState("reviewRequest");
  }, [
    canUseCurrentVoiceRequestReview,
    clearVoiceRequestExpiryTimer,
    handleRequestSlot,
    selectedSlot,
    updateVoiceRequestState,
    voiceRequestSnapshot,
  ]);

  const handleVoiceRequestTranscript = useCallback(
    (transcript: string) => {
      setIsVoiceRequestListening(false);
      if (voiceRequestStateRef.current !== "awaitingVoiceConfirmation") {
        return;
      }

      if (!voiceRequestSnapshot || voiceRequestSnapshot.signature !== currentVoiceRequestSignature) {
        clearVoiceRequestExpiryTimer();
        setVoiceRequestSnapshot(null);
        setVoiceRequestMessage("Appointment request changed. Review again before requesting.");
        updateVoiceRequestState("draftReady");
        return;
      }

      const result = parseVoiceAppointmentRequestConfirmation(transcript);
      if (result === "confirm") {
        void submitReviewedVoiceRequest();
        return;
      }

      if (result === "cancel") {
        handleCancelVoiceRequest();
        return;
      }

      setVoiceRequestMessage(
        "That was not a clear request confirmation. Say yes request, confirm request, or request appointment.",
      );
      updateVoiceRequestState("awaitingVoiceConfirmation");
    },
    [
      clearVoiceRequestExpiryTimer,
      currentVoiceRequestSignature,
      handleCancelVoiceRequest,
      submitReviewedVoiceRequest,
      updateVoiceRequestState,
      voiceRequestSnapshot,
    ],
  );

  const handleListenForVoiceRequestConfirmation = useCallback(async () => {
    if (!canUseCurrentVoiceRequestReview) {
      setVoiceRequestMessage(
        voiceRequestStateRef.current === "expired"
          ? "Voice request review expired. Review again before requesting."
          : "Review again before voice request.",
      );
      updateVoiceRequestState("expired");
      return;
    }

    updateVoiceRequestState("awaitingVoiceConfirmation");
    setVoiceRequestMessage("Listening for yes request, confirm request, or request appointment.");
    setIsVoiceRequestListening(true);

    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setIsVoiceRequestListening(false);
      setVoiceRequestMessage("Voice confirmation is not available on this device. Use Confirm request or manual request.");
      return;
    }

    if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
      setIsVoiceRequestListening(false);
      setVoiceRequestMessage("On-device voice confirmation is not available on this device. Use Confirm request or manual request.");
      return;
    }

    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setIsVoiceRequestListening(false);
      setVoiceRequestMessage("Microphone permission was denied. Use Confirm request or manual request.");
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
      setIsVoiceRequestListening(false);
      setVoiceRequestMessage("Voice confirmation could not start. Nothing was sent.");
      updateVoiceRequestState("reviewRequest");
    }
  }, [canUseCurrentVoiceRequestReview, updateVoiceRequestState]);

  useEffect(() => {
    const startListener = ExpoSpeechRecognitionModule.addListener("start", () => {
      if (voiceRequestStateRef.current === "awaitingVoiceConfirmation") {
        setIsVoiceRequestListening(true);
      }
    });
    const endListener = ExpoSpeechRecognitionModule.addListener("end", () => {
      setIsVoiceRequestListening(false);
    });
    const resultListener = ExpoSpeechRecognitionModule.addListener(
      "result",
      (event: ExpoSpeechRecognitionResultEvent) => {
        if (!event.isFinal || voiceRequestStateRef.current !== "awaitingVoiceConfirmation") {
          return;
        }

        const transcript = event.results
          .map((result) => result.transcript.trim())
          .find((candidate) => candidate.length > 0);

        handleVoiceRequestTranscript(transcript ?? "");
      },
    );
    const errorListener = ExpoSpeechRecognitionModule.addListener(
      "error",
      (_event: ExpoSpeechRecognitionErrorEvent) => {
        if (voiceRequestStateRef.current === "awaitingVoiceConfirmation") {
          setIsVoiceRequestListening(false);
          setVoiceRequestMessage("That was not a clear request confirmation. Nothing was sent.");
        }
      },
    );
    const nomatchListener = ExpoSpeechRecognitionModule.addListener("nomatch", () => {
      if (voiceRequestStateRef.current === "awaitingVoiceConfirmation") {
        setIsVoiceRequestListening(false);
        setVoiceRequestMessage("That was not a clear request confirmation. Nothing was sent.");
      }
    });

    return () => {
      startListener.remove();
      endListener.remove();
      resultListener.remove();
      errorListener.remove();
      nomatchListener.remove();
      if (voiceRequestStateRef.current === "awaitingVoiceConfirmation") {
        ExpoSpeechRecognitionModule.abort();
      }
    };
  }, [handleVoiceRequestTranscript]);

  const listData = useMemo<ListItem[]>(() => {
    if (mode === "book") {
      if (groupedSlots.length === 0) {
        return isLoading ? [] : [{ type: "empty", kind: "book" }];
      }
      return groupedSlots;
    }

    const base = mode === "requests" ? sortedRequests : upcomingRequests;
    if (base.length === 0) {
      return isLoading ? [] : [{ type: "empty", kind: mode }];
    }

    return base.map((item) => ({ type: "request", item }));
  }, [groupedSlots, isLoading, mode, sortedRequests, upcomingRequests]);

  const listHeader = useMemo(() => {
    const shouldShowNotice =
      notice &&
      !(isOffline &&
        notice.title === "Offline" &&
        notice.message === "Offline — booking is unavailable. Showing saved info.");

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
              style={({ pressed }) => [
                styles.diagToggle,
                pressed ? styles.pressed : null,
              ]}
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
                <LastRefreshed value={appointmentsRefresh.label} compact />
                <LastFailedAttempt
                  label="Last load failure"
                  value={appointmentsLoadError.label}
                  title={appointmentsLoadError.lastError?.title}
                  message={appointmentsLoadError.lastError?.message}
                  compact
                />
                <LastFailedAttempt
                  label="Last request failure"
                  value={appointmentRequestError.label}
                  title={appointmentRequestError.lastError?.title}
                  message={appointmentRequestError.lastError?.message}
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
            message="Offline — booking is unavailable. Showing saved info."
          />
        ) : null}

        {shouldShowNotice ? (
          <Banner
            variant={toBannerVariant(notice.variant)}
            title={notice.title}
            message={notice.message}
          />
        ) : null}

        <LastRefreshed value={appointmentsRefresh.label} compact />

        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: "book", label: "Find time", icon: "appointments" },
            { value: "requests", label: "Requests", icon: "info" },
            { value: "upcoming", label: "Upcoming", icon: "success" },
          ]}
          accessibilityLabel="Appointments view selector"
        />

        <View style={styles.summaryRow}>
          <View style={styles.summaryCardWrap}>
            <MediaCard
              variant="compact"
              leading={{ type: "icon", icon: "appointments", tone: "accent" }}
              title={nextApproved ? formatDateTime(nextApproved.startsAt) : "No upcoming"}
              subtitle={
                nextApproved
                  ? "Next confirmed visit"
                  : "Choose a time to request"
              }
              chips={[
                nextApproved
                  ? { text: "Upcoming", tone: "success" as const }
                  : { text: "Browse times", tone: "muted" as const },
              ]}
              onPress={() => {
                setMode(nextApproved ? "upcoming" : "book");
              }}
            />
          </View>
          <View style={styles.summaryCardWrap}>
            <MediaCard
              variant="compact"
              leading={{ type: "icon", icon: "info", tone: "muted" }}
              title={`Pending: ${pendingCount}`}
              subtitle={pendingCount > 0 ? "Waiting for review" : "No pending requests"}
              chips={[
                pendingCount > 0
                  ? { text: "Requests", tone: "warning" as const }
                  : { text: "All clear", tone: "success" as const },
              ]}
              onPress={() => {
                setMode("requests");
              }}
            />
          </View>
        </View>

        {mode === "book" ? (
          <Card variant="outlined" padding={tokens.spacing.md}>
            <View style={styles.noteHeader}>
              <View style={styles.noteTitleRow}>
                <DomainIcon icon="chat" tone="muted" accessibilityLabel="Optional note icon" />
                <Text style={styles.noteTitle}>Share context</Text>
              </View>
              <Text style={styles.noteCounter}>{noteDraft.length}/280</Text>
            </View>
            <Text style={styles.noteSubtitle}>
              Add a short note if you want your clinician to know what time or context works best.
            </Text>
            <TextInput
              value={noteDraft}
              onChangeText={(value) => {
                const nextValue = value.slice(0, 280);
                if (
                  voiceRequestSnapshot &&
                  selectedSlot &&
                  voiceRequestSnapshot.signature !==
                    buildVoiceRequestSignature(selectedSlot, nextValue)
                ) {
                  clearVoiceRequestExpiryTimer();
                  setVoiceRequestSnapshot(null);
                  setIsVoiceRequestListening(false);
                  setVoiceRequestMessage("Appointment request changed. Review again before requesting.");
                  updateVoiceRequestState("draftReady");
                }
                setNoteDraft(nextValue);
              }}
              placeholder="Optional note for your clinician"
              placeholderTextColor={tokens.colors.textMuted}
              multiline
              maxLength={280}
              style={styles.noteInput}
            />
          </Card>
        ) : null}
      </View>
    );
  }, [
    appointmentRequestError.label,
    appointmentRequestError.lastError?.message,
    appointmentRequestError.lastError?.title,
    appointmentsLoadError.label,
    appointmentsLoadError.lastError?.message,
    appointmentsLoadError.lastError?.title,
    appointmentsRefresh.label,
    isOffline,
    mode,
    nextApproved,
    noteDraft,
    notice,
    pendingCount,
    selectedSlot,
    setMode,
    showDiagnostics,
    slots.length,
    styles,
    upcomingRequests.length,
    clearVoiceRequestExpiryTimer,
    updateVoiceRequestState,
    voiceRequestSnapshot,
    workflowStory.body,
    workflowStory.title,
    tokens.colors.textMuted,
    tokens.spacing.md,
  ]);

  const renderRequestCard = useCallback(
    (requestItem: AppointmentRequestItem) => {
      const workflowStatus = getAppointmentWorkflowStatus(requestItem);
      const link = requestItem.meetingLink?.trim();
      const relativeLabel = formatAppointmentRelativeLabel(requestItem);
      const chips: MediaCardChip[] = buildAppointmentChips(requestItem);

      const actions: MediaCardAction[] = [];

      if (workflowStatus === "upcoming" && link) {
        actions.push({
          label: "Open link",
          kind: "secondary",
          onPress: () => {
            void Linking.openURL(link);
          },
        });
      }

      if (requestItem.status === "pending" || requestItem.status === "approved") {
        actions.push({
          label:
            cancelingRequestId === requestItem.requestId
              ? "Canceling..."
              : "Cancel request",
          kind: "secondary",
          disabled: isOffline || cancelingRequestId !== null,
          onPress: () => {
            Alert.alert(
              "Cancel this request?",
              "This updates your appointment request status.",
              [
                { text: "Keep", style: "cancel" },
                {
                  text: "Cancel request",
                  style: "destructive",
                  onPress: () => {
                    void handleCancelRequest(requestItem);
                  },
                },
              ],
            );
          },
        });
      }

      return (
        <View style={styles.listItemWrap}>
          <MediaCard
            variant="default"
            leading={{
              type: "icon",
              icon:
                workflowStatus === "upcoming" || workflowStatus === "completed"
                  ? "success"
                  : workflowStatus === "awaiting_confirmation" ||
                      workflowStatus === "reschedule_requested"
                    ? "warning"
                    : workflowStatus === "missed"
                      ? "warning"
                      : "info",
              tone:
                workflowStatus === "upcoming" || workflowStatus === "completed"
                  ? "success"
                  : workflowStatus === "awaiting_confirmation" ||
                      workflowStatus === "reschedule_requested"
                    ? "warning"
                    : workflowStatus === "missed"
                      ? "warning"
                      : "muted",
            }}
            title={formatAppointmentTimeRange(requestItem)}
            subtitle={`${
              workflowStatus === "upcoming"
                ? "Confirmed and coming up"
                : workflowStatus === "awaiting_confirmation"
                  ? "Waiting for clinician review"
                  : workflowStatus === "reschedule_requested"
                    ? "A new time is needed"
                    : workflowStatus === "missed"
                      ? "This visit was missed"
                      : workflowStatus === "completed"
                        ? "This session is complete"
                        : formatAppointmentWorkflowLabel(workflowStatus)
            }${
              relativeLabel
                ? ` · ${relativeLabel}`
                : requestItem.reviewedAt
                  ? ` · Reviewed ${formatDateTime(requestItem.reviewedAt)}`
                  : ""
            }`}
            statusPill={{
              text: formatAppointmentWorkflowLabel(workflowStatus),
              tone: appointmentWorkflowTone(workflowStatus),
            }}
            chips={chips}
            actions={actions.slice(0, 2)}
            showChevron={false}
          />
        </View>
      );
    },
    [cancelingRequestId, handleCancelRequest, isOffline, styles.listItemWrap],
  );

  const renderSlotGroup = useCallback(
    (group: SlotGroupListItem) => {
      return (
        <View style={styles.listItemWrap}>
          <Card variant="outlined" padding={tokens.spacing.md}>
            <View style={styles.slotHeader}>
              <DomainIcon icon="weekly" tone="muted" accessibilityLabel="Date group icon" />
              <View style={styles.slotHeaderCopy}>
                <Text style={styles.slotDate}>{group.dateLabel}</Text>
                <Text style={styles.slotSubtitle}>
                  {`${group.slots.length} time option${group.slots.length === 1 ? "" : "s"}`}
                </Text>
              </View>
            </View>

            <View style={styles.slotChipsWrap}>
              {group.slots.map((slot) => {
                const selected = selectedSlotId === slot.slotId;
                return (
                  <Pressable
                    key={slot.slotId}
                    testID={`appointment-slot-${slot.slotId}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${formatTime(slot.startsAt)} slot${
                      slot.clinicianName ? ` with ${slot.clinicianName}` : ""
                    }`}
                    accessibilityState={{ selected, disabled: isOffline || requestingSlotId !== null }}
                    onPress={() => {
                      if (isOffline) {
                        setNotice({
                          variant: "warning",
                          title: "Offline",
                          message: "Connect to choose and request a slot.",
                        });
                        return;
                      }
                      if (voiceRequestSnapshot && slot.slotId !== selectedSlotId) {
                        clearVoiceRequestExpiryTimer();
                        setVoiceRequestSnapshot(null);
                        setIsVoiceRequestListening(false);
                        setVoiceRequestMessage("Appointment request changed. Review again before requesting.");
                        updateVoiceRequestState("draftReady");
                      }
                      setSelectedSlotId(slot.slotId);
                    }}
                    style={({ pressed }) => [
                      styles.slotChip,
                      selected ? styles.slotChipSelected : null,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <Text style={[styles.slotChipText, selected ? styles.slotChipTextSelected : null]}>
                      {formatTime(slot.startsAt)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        </View>
      );
    },
    [
      clearVoiceRequestExpiryTimer,
      isOffline,
      requestingSlotId,
      selectedSlotId,
      styles,
      tokens.spacing.md,
      updateVoiceRequestState,
      voiceRequestSnapshot,
    ],
  );

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === "slotGroup") {
        return renderSlotGroup(item);
      }
      if (item.type === "request") {
        return renderRequestCard(item.item);
      }
      return null;
    },
    [renderRequestCard, renderSlotGroup],
  );

  const listEmptyComponent = useMemo(() => {
    if (isLoading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="small" />
        </View>
      );
    }

    if (mode === "book") {
      return (
        <EmptyState
          variant="compact"
          illustrationKey={isOffline ? "offline" : "weekly"}
          title={isOffline ? "Offline" : "No open times right now"}
          description={
            isOffline
              ? "Reconnect to refresh appointment availability."
              : "New time options will appear here when your care team opens availability."
          }
        />
      );
    }

    if (mode === "requests") {
      return (
        <EmptyState
          variant="compact"
          illustrationKey="today"
          title="No requests yet"
          description="Browse open times first, then request the one that works best for you."
          ctaLabel="Find time"
          onCtaPress={() => {
            setMode("book");
          }}
        />
      );
    }

    return (
      <EmptyState
        variant="compact"
        illustrationKey="progress"
        title="No upcoming appointments"
        description="Confirmed visits will appear here once a request is approved."
        ctaLabel="View requests"
        onCtaPress={() => {
          setMode("requests");
        }}
      />
    );
  }, [isLoading, isOffline, mode, styles.centered]);

  if (auth.status === "loading") {
    return (
      <Screen scroll={false}>
        <EmptyState
          variant="compact"
          title="Loading appointments"
          description="Checking your requests and available times."
          illustration={<ActivityIndicator size="small" color={tokens.colors.primary} />}
        />
      </Screen>
    );
  }

  if (auth.status === "signedOut") {
    return <Redirect href="/(auth)/login" />;
  }

  const showBookFooter = mode === "book" && selectedSlot !== null;
  const showVoiceRequestPanel = FINAL_DEMO_VOICE_UI_ENABLED && mode === "book";
  const voiceRequestCanReview = selectedSlot !== null && !isOffline && requestingSlotId === null;
  const voiceRequestCanConfirm =
    canUseCurrentVoiceRequestReview &&
    !isOffline &&
    requestingSlotId === null &&
    voiceRequestState !== "confirmedRequest";
  const voiceRequestStatusRole =
    voiceRequestState === "offlineBlocked" ||
    voiceRequestState === "expired" ||
    voiceRequestState === "unavailableSlot" ||
    voiceRequestState === "needsSlot"
      ? "alert"
      : "text";
  const voiceRequestDuration = voiceRequestSnapshot
    ? formatDurationMinutes(voiceRequestSnapshot.startsAt, voiceRequestSnapshot.endsAt)
    : null;

  return (
    <Screen
      scroll={false}
      header={
        <HeroHeader
          variant="compact"
          title="Appointments"
          subtitle="Plan visits, track requests, and stay ready for what’s next."
          left={<Avatar size={40} name={patientName} ring={isOffline ? "attention" : "none"} />}
          rightActions={[
            {
              icon: "safety",
              tone: "warning",
              accessibilityLabel: "Open Safety",
              onPress: () => {
                router.push("/safety" as never);
              },
            },
            {
              icon: "settings",
              tone: "muted",
              accessibilityLabel: "Open Settings",
              onPress: () => {
                router.push("/(tabs)/settings" as never);
              },
            },
          ]}
        >
          <View style={styles.headerMeta}>
            <StatusPill label={`${slots.length} open times`} variant={slots.length > 0 ? "info" : "neutral"} />
            <StatusPill label={`${pendingCount} pending`} variant={pendingCount > 0 ? "warning" : "neutral"} />
            <StatusPill label={`${upcomingRequests.length} upcoming`} variant={upcomingRequests.length > 0 ? "success" : "neutral"} />
          </View>
          <Card variant="outlined" padding={tokens.spacing.md} style={styles.storyCard}>
            <View style={styles.storyCopy}>
              <Text style={styles.storyEyebrow}>Planning overview</Text>
              <Text style={styles.storyTitle}>{workflowStory.title}</Text>
              <Text style={styles.storyText}>{workflowStory.body}</Text>
            </View>
            <View style={styles.storyFacts}>
              <View style={styles.storyFact}>
                <Text style={styles.storyFactLabel}>Next visit</Text>
                <Text style={styles.storyFactValue}>
                  {nextApproved ? formatDateTime(nextApproved.startsAt) : "Not scheduled yet"}
                </Text>
              </View>
              <View style={styles.storyFact}>
                <Text style={styles.storyFactLabel}>Requests</Text>
                <Text style={styles.storyFactValue}>
                  {pendingCount > 0 ? `${pendingCount} waiting` : "No pending review"}
                </Text>
              </View>
              <View style={styles.storyFact}>
                <Text style={styles.storyFactLabel}>Open times</Text>
                <Text style={styles.storyFactValue}>
                  {slots.length > 0 ? `${slots.length} available` : "Nothing open"}
                </Text>
              </View>
            </View>
          </Card>
        </HeroHeader>
      }
    >
      <View style={styles.body}>
        <FlatList<ListItem>
          style={styles.list}
          data={listData}
          keyExtractor={(item) => {
            if (item.type === "slotGroup") {
              return `g:${item.dateKey}`;
            }
            if (item.type === "request") {
              return `r:${item.item.requestId}`;
            }
            return `e:${item.kind}`;
          }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={() => {
                void loadAppointments();
              }}
            />
          }
          ListHeaderComponent={listHeader}
          renderItem={renderItem}
          ListEmptyComponent={listEmptyComponent}
          ListFooterComponent={<View style={styles.listTailSpacing} />}
          contentContainerStyle={styles.listContent}
        />

        {showVoiceRequestPanel ? (
          <Card variant="outlined" padding={tokens.spacing.md} style={styles.voiceRequestCard}>
            <View style={styles.voiceRequestHeader}>
              <View style={styles.noteTitleRow}>
                <DomainIcon icon="appointments" tone="accent" accessibilityLabel="Voice request icon" />
                <Text accessibilityRole="header" style={styles.voiceRequestTitle}>
                  Voice request review
                </Text>
              </View>
              <StatusPill label={voiceRequestState} variant="neutral" accessible={false} />
            </View>

            <View
              accessible
              accessibilityRole={voiceRequestStatusRole}
              accessibilityLiveRegion="polite"
              accessibilityLabel="Voice appointment request status"
              accessibilityHint={voiceRequestMessage}
              style={[
                styles.voiceRequestStatus,
                voiceRequestStatusRole === "alert" ? styles.voiceRequestStatusWarning : null,
              ]}
            >
              <Text style={styles.voiceRequestStatusKicker}>Status</Text>
              <Text style={styles.voiceRequestStatusText}>{voiceRequestMessage}</Text>
            </View>

            {!selectedSlot ? (
              <Text style={styles.voiceRequestBody}>Select a time before voice request.</Text>
            ) : null}

            {voiceRequestSnapshot ? (
              <View style={styles.voiceRequestSummary}>
                <Text style={styles.voiceRequestSummaryLabel}>Appointment request summary</Text>
                <Text selectable style={styles.voiceRequestSummaryText}>
                  {formatDateTime(voiceRequestSnapshot.startsAt)} - {formatTime(voiceRequestSnapshot.endsAt)}
                </Text>
                {voiceRequestDuration ? (
                  <Text style={styles.voiceRequestSummaryText}>{voiceRequestDuration}</Text>
                ) : null}
                <Text style={styles.voiceRequestSummaryText}>
                  {formatModalityLabel(voiceRequestSnapshot.modality)}
                </Text>
                {voiceRequestSnapshot.clinicianName ? (
                  <Text style={styles.voiceRequestSummaryText}>{voiceRequestSnapshot.clinicianName}</Text>
                ) : null}
                {voiceRequestSnapshot.note ? (
                  <>
                    <Text style={styles.voiceRequestSummaryLabel}>Note preview</Text>
                    <Text selectable style={styles.voiceRequestSummaryText}>
                      {voiceRequestSnapshot.note}
                    </Text>
                  </>
                ) : null}
                <Text style={styles.voiceRequestSafetyText}>
                  This sends an appointment request for clinician approval. It does not guarantee the appointment.
                </Text>
                <Text style={styles.voiceRequestSafetyText}>
                  Aura does not call emergency services.
                </Text>
              </View>
            ) : null}

            <View style={styles.voiceRequestButtons}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Review for voice request"
                accessibilityHint="Shows the exact appointment request summary before voice confirmation."
                accessibilityState={{ disabled: !voiceRequestCanReview }}
                disabled={!voiceRequestCanReview}
                onPress={handlePrepareVoiceRequestReview}
                style={({ pressed }) => [
                  styles.voiceRequestButton,
                  styles.voiceRequestPrimaryButton,
                  !voiceRequestCanReview ? styles.voiceRequestButtonDisabled : null,
                  pressed && voiceRequestCanReview ? styles.pressed : null,
                ]}
              >
                <Text style={styles.voiceRequestPrimaryButtonText}>Review for voice request</Text>
              </Pressable>

              {voiceRequestSnapshot ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Listen for request confirmation"
                    accessibilityHint="Listens once for yes request, confirm request, or request appointment."
                    accessibilityState={{
                      disabled: !voiceRequestCanConfirm,
                      busy: isVoiceRequestListening || undefined,
                    }}
                    disabled={!voiceRequestCanConfirm}
                    onPress={() => {
                      void handleListenForVoiceRequestConfirmation();
                    }}
                    style={({ pressed }) => [
                      styles.voiceRequestButton,
                      !voiceRequestCanConfirm ? styles.voiceRequestButtonDisabled : null,
                      pressed && voiceRequestCanConfirm ? styles.pressed : null,
                    ]}
                  >
                    <Text style={styles.voiceRequestButtonText}>
                      {isVoiceRequestListening ? "Listening..." : "Listen for request confirmation"}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Confirm request"
                    accessibilityHint="Sends this reviewed appointment request for clinician approval."
                    accessibilityState={{ disabled: !voiceRequestCanConfirm }}
                    disabled={!voiceRequestCanConfirm}
                    onPress={() => {
                      void submitReviewedVoiceRequest();
                    }}
                    style={({ pressed }) => [
                      styles.voiceRequestButton,
                      !voiceRequestCanConfirm ? styles.voiceRequestButtonDisabled : null,
                      pressed && voiceRequestCanConfirm ? styles.pressed : null,
                    ]}
                  >
                    <Text style={styles.voiceRequestButtonText}>Confirm request</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Cancel voice request"
                    accessibilityHint="Clears this memory-only voice appointment request review without sending anything."
                    onPress={() => handleCancelVoiceRequest()}
                    style={({ pressed }) => [
                      styles.voiceRequestButton,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <Text style={styles.voiceRequestButtonText}>Cancel</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          </Card>
        ) : null}

        {showBookFooter ? (
          <GlassPanel
            style={styles.footerPanel}
            fallbackVariant="elevated"
            fallbackOpacity={0.78}
            accessibilityLabel="Selected appointment actions"
          >
            <View style={styles.footerHeader}>
              <Text style={styles.footerTitle}>Selected time</Text>
              <Text style={styles.footerSubtitle}>{formatDateTime(selectedSlot.startsAt)}</Text>
              <Text style={styles.footerNote}>
                This sends a request for clinician approval before the visit is confirmed.
              </Text>
            </View>

            {isOffline ? (
              <Banner
                variant="warning"
                title="Offline"
                message="Connect to request an appointment. Your selection is saved."
              />
            ) : null}

            <View style={styles.footerButtons}>
              <SecondaryButton
                label="Clear"
                onPress={() => {
                  setSelectedSlotId(null);
                }}
              />
              <PrimaryButton
                label={requestingSlotId === selectedSlot.slotId ? "Requesting..." : "Request this time"}
                loading={requestingSlotId === selectedSlot.slotId}
                disabled={isOffline || requestingSlotId !== null}
                onPress={() => {
                  Alert.alert(
                    "Request this slot?",
                    `${formatDateTime(selectedSlot.startsAt)}\nThis sends a pending request for clinician approval.`,
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Request",
                        onPress: () => {
                          void handleRequestSlot(selectedSlot);
                        },
                      },
                    ],
                  );
                }}
              />
            </View>
          </GlassPanel>
        ) : null}
      </View>
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    body: {
      flex: 1,
      gap: tokens.spacing.sm,
    },
    list: {
      flex: 1,
    },
    listContent: {
      paddingBottom: tokens.spacing.md,
    },
    listHeader: {
      gap: tokens.spacing.md,
      marginBottom: tokens.spacing.md,
    },
    headerMeta: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    storyCard: {
      gap: tokens.spacing.md,
    },
    storyCopy: {
      gap: tokens.spacing.xs,
    },
    storyEyebrow: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      fontWeight: tokens.typography.weights.medium,
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
    storyFacts: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    storyFact: {
      flexGrow: 1,
      minWidth: 108,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.surfaceElevated,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      gap: 2,
    },
    storyFactLabel: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      fontWeight: tokens.typography.weights.medium,
    },
    storyFactValue: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    listItemWrap: {
      marginBottom: tokens.spacing.sm,
    },
    listTailSpacing: {
      height: tokens.spacing.sm,
    },
    centered: {
      minHeight: 140,
      alignItems: "center",
      justifyContent: "center",
    },
    centeredFull: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
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
      opacity: 0.84,
    },
    summaryRow: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
    },
    summaryCardWrap: {
      flex: 1,
      minWidth: 0,
    },
    noteHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    noteTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
    },
    noteTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    noteSubtitle: {
      marginTop: tokens.spacing.xs,
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    noteCounter: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    noteInput: {
      marginTop: tokens.spacing.sm,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.md,
      minHeight: 96,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      textAlignVertical: "top",
      fontSize: tokens.typography.body.fontSize,
      color: tokens.colors.text,
      backgroundColor: tokens.colors.surface,
    },
    slotHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: tokens.spacing.sm,
      marginBottom: tokens.spacing.sm,
    },
    slotHeaderCopy: {
      flex: 1,
      gap: 2,
    },
    slotDate: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    slotSubtitle: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    slotChipsWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    slotChip: {
      minHeight: 44,
      borderRadius: tokens.radius.xl,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surfaceElevated,
      paddingHorizontal: tokens.spacing.md,
      alignItems: "center",
      justifyContent: "center",
    },
    slotChipSelected: {
      borderColor: tokens.colors.primary,
      backgroundColor: tokens.colors.primary,
    },
    slotChipText: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    slotChipTextSelected: {
      color: tokens.colors.primaryTextOn,
      fontWeight: tokens.typography.weights.semibold,
    },
    footerPanel: {
      marginTop: tokens.spacing.xs,
      borderRadius: tokens.radius.lg,
    },
    footerHeader: {
      gap: tokens.spacing.xs,
    },
    footerTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    footerSubtitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    footerNote: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    footerButtons: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
    },
    voiceRequestCard: {
      gap: tokens.spacing.md,
      marginHorizontal: tokens.spacing.md,
      marginBottom: tokens.spacing.sm,
    },
    voiceRequestHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    voiceRequestTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    voiceRequestStatus: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.surfaceElevated,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      gap: 2,
    },
    voiceRequestStatusWarning: {
      borderColor: tokens.colors.warning,
    },
    voiceRequestStatusKicker: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      fontWeight: tokens.typography.weights.medium,
    },
    voiceRequestStatusText: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    voiceRequestBody: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    voiceRequestSummary: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.md,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      gap: tokens.spacing.xs,
    },
    voiceRequestSummaryLabel: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      fontWeight: tokens.typography.weights.medium,
    },
    voiceRequestSummaryText: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    voiceRequestSafetyText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    voiceRequestButtons: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    voiceRequestButton: {
      minHeight: 44,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.md,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.colors.surface,
    },
    voiceRequestPrimaryButton: {
      borderColor: tokens.colors.primary,
      backgroundColor: tokens.colors.primary,
    },
    voiceRequestButtonDisabled: {
      opacity: 0.48,
    },
    voiceRequestButtonText: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    voiceRequestPrimaryButtonText: {
      color: tokens.colors.primaryTextOn,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
  });
}
