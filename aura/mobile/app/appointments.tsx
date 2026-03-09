import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import Constants from "expo-constants";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  appointmentWorkflowTone,
  buildAppointmentChips,
  formatAppointmentTimeRange,
  formatAppointmentWorkflowLabel,
  getAppointmentWorkflowStatus,
} from "@/src/utils/appointments";
import { normalizeUnknownError } from "@/src/utils/errors";

type NoticeState = {
  variant: "info" | "warning" | "error";
  title: string;
  message: string;
};

type ViewMode = "book" | "requests" | "upcoming";

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
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateHeading(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return "Unknown date";
  }

  return parsed.toLocaleDateString([], {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
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
    async (slot: AppointmentSlot) => {
      if (!auth.token || !patientId) {
        return;
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
        return;
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
        {__DEV__ ? (
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

        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: "book", label: "Book", icon: "appointments" },
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
                  ? "Approved appointment"
                  : "Book a slot to schedule"
              }
              chips={[
                nextApproved
                  ? { text: "Upcoming", tone: "success" as const }
                  : { text: "Tap Book", tone: "muted" as const },
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
              subtitle={pendingCount > 0 ? "Awaiting approval" : "No pending requests"}
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
                <Text style={styles.noteTitle}>Optional note</Text>
              </View>
              <Text style={styles.noteCounter}>{noteDraft.length}/280</Text>
            </View>
            <Text style={styles.noteSubtitle}>Add context for your clinician (max 280).</Text>
            <TextInput
              value={noteDraft}
              onChangeText={(value) => setNoteDraft(value.slice(0, 280))}
              placeholder="Optional short note"
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
    setMode,
    showDiagnostics,
    styles.diagContent,
    styles.diagTitle,
    styles.diagTitleRow,
    styles.diagToggle,
    styles.listHeader,
    styles.noteCounter,
    styles.noteHeader,
    styles.noteInput,
    styles.noteSubtitle,
    styles.noteTitle,
    styles.noteTitleRow,
    styles.pressed,
    styles.summaryCardWrap,
    styles.summaryRow,
    tokens.colors.textMuted,
    tokens.spacing.md,
  ]);

  const renderRequestCard = useCallback(
    (requestItem: AppointmentRequestItem) => {
      const workflowStatus = getAppointmentWorkflowStatus(requestItem);
      const link = requestItem.meetingLink?.trim();
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
            subtitle={`${formatAppointmentWorkflowLabel(workflowStatus)}${
              requestItem.reviewedAt ? ` · Reviewed ${formatDateTime(requestItem.reviewedAt)}` : ""
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
              <Text style={styles.slotDate}>{group.dateLabel}</Text>
            </View>

            <View style={styles.slotChipsWrap}>
              {group.slots.map((slot) => {
                const selected = selectedSlotId === slot.slotId;
                return (
                  <Pressable
                    key={slot.slotId}
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
    [isOffline, requestingSlotId, selectedSlotId, styles, tokens.spacing.md],
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
          title={isOffline ? "Offline" : "No available slots"}
          description={
            isOffline
              ? "Reconnect to refresh appointment availability."
              : "No slots are currently open. Pull to refresh shortly."
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
          description="Choose Book to request an appointment time."
          ctaLabel="Go to Book"
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
        description="Your approved appointments will appear here."
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
        <View style={styles.centeredFull}>
          <ActivityIndicator size="small" />
        </View>
      </Screen>
    );
  }

  if (auth.status === "signedOut") {
    return <Redirect href="/(auth)/login" />;
  }

  const showBookFooter = mode === "book" && selectedSlot !== null;

  return (
    <Screen
      scroll={false}
      header={
        <HeroHeader
          variant="compact"
          title="Appointments"
          subtitle="Book a session · Review requests"
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
        />
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

        {showBookFooter ? (
          <GlassPanel
            style={styles.footerPanel}
            fallbackVariant="elevated"
            fallbackOpacity={0.78}
            accessibilityLabel="Selected appointment actions"
          >
            <View style={styles.footerHeader}>
              <Text style={styles.footerTitle}>Selected</Text>
              <Text style={styles.footerSubtitle}>{formatDateTime(selectedSlot.startsAt)}</Text>
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
      alignItems: "center",
      gap: tokens.spacing.sm,
      marginBottom: tokens.spacing.sm,
    },
    slotDate: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
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
    footerButtons: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
    },
  });
}
