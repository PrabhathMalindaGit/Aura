import { Redirect } from "expo-router";
import * as Notifications from "expo-notifications";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
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
import { InlineNotice } from "@/src/components/InlineNotice";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { Section } from "@/src/components/Section";
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
import { normalizeUnknownError } from "@/src/utils/errors";

type NoticeState = {
  variant: "info" | "warning" | "error";
  title: string;
  message: string;
};

const REMINDER_LEAD_MS = 15 * 60 * 1000;

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

function formatStatus(value: AppointmentRequestItem["status"]): string {
  if (value === "approved") {
    return "Approved";
  }
  if (value === "rejected") {
    return "Rejected";
  }
  if (value === "canceled") {
    return "Canceled";
  }
  return "Pending";
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

  const currentPermissions = await Notifications.getPermissionsAsync();
  const granted = currentPermissions.granted
    ? true
    : (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) {
    return null;
  }

  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Upcoming appointment",
      body: "Your Aura session starts in 15 minutes.",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(triggerAtMs),
    },
  });
}

export default function AppointmentsScreen() {
  const auth = useAuth();
  const isOffline = useIsOffline();
  const appointmentsRefresh = useLastRefreshed("appointments");
  const appointmentsLoadError = useLastError("appointmentsLoad");
  const appointmentRequestError = useLastError("appointmentRequest");

  const patientId = auth.patient?.id ?? "";
  const [slots, setSlots] = useState<AppointmentSlot[]>([]);
  const [requests, setRequests] = useState<AppointmentRequestItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [requestingSlotId, setRequestingSlotId] = useState<string | null>(null);
  const [cancelingRequestId, setCancelingRequestId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const pendingCount = useMemo(
    () => requests.filter((item) => item.status === "pending").length,
    [requests]
  );
  const approvedRequests = useMemo(
    () =>
      requests
        .filter((item) => item.status === "approved")
        .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt)),
    [requests]
  );
  const nextApproved = approvedRequests.find(
    (item) => Date.parse(item.startsAt) > Date.now()
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
          Date.parse(item.startsAt) - REMINDER_LEAD_MS > Date.now()
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
    [patientId]
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
    }, [auth.status, loadAppointments])
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
    ]
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
    [appointmentRequestError, auth.token, isOffline, loadAppointments, patientId]
  );

  if (auth.status === "loading") {
    return (
      <Screen title="Appointments">
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
    <Screen title="Appointments">
      <ScrollView contentContainerStyle={styles.container}>
        <LastRefreshed value={appointmentsRefresh.label} />
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

        {isOffline ? (
          <InlineNotice
            variant="warning"
            title="Offline"
            message="Offline — booking is unavailable. Showing saved info."
          />
        ) : null}
        {notice ? (
          <InlineNotice
            variant={notice.variant}
            title={notice.title}
            message={notice.message}
          />
        ) : null}

        <Section title="Status">
          <Text style={styles.metaText}>Pending requests: {pendingCount}</Text>
          <Text style={styles.metaText}>
            Next approved: {nextApproved ? formatDateTime(nextApproved.startsAt) : "None"}
          </Text>
          <PrimaryButton
            label="Refresh"
            disabled={isLoading}
            onPress={() => {
              void loadAppointments();
            }}
          />
        </Section>

        <Section title="Optional note for next request">
          <TextInput
            value={noteDraft}
            onChangeText={(value) => setNoteDraft(value.slice(0, 280))}
            placeholder="Optional short note"
            multiline
            maxLength={280}
            style={styles.noteInput}
          />
          <Text style={styles.metaText}>{noteDraft.length}/280</Text>
        </Section>

        <Section title="Available slots">
          {isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="small" />
            </View>
          ) : slots.length === 0 ? (
            <Text style={styles.metaText}>No available slots right now.</Text>
          ) : (
            <View style={styles.stack}>
              {slots.map((slot) => (
                <View key={slot.slotId} style={styles.card}>
                  <Text style={styles.cardTitle}>{formatDateTime(slot.startsAt)}</Text>
                  <Text style={styles.metaText}>Ends: {formatDateTime(slot.endsAt)}</Text>
                  <Text style={styles.metaText}>
                    Clinician: {slot.clinicianName || "Clinician"}
                  </Text>
                  <PrimaryButton
                    label={
                      requestingSlotId === slot.slotId ? "Requesting..." : "Request"
                    }
                    loading={requestingSlotId === slot.slotId}
                    disabled={isOffline || requestingSlotId !== null}
                    onPress={() => {
                      Alert.alert(
                        "Request this slot?",
                        `${formatDateTime(slot.startsAt)}\nThis sends a pending request for clinician approval.`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Request",
                            onPress: () => {
                              void handleRequestSlot(slot);
                            },
                          },
                        ]
                      );
                    }}
                  />
                </View>
              ))}
            </View>
          )}
        </Section>

        <Section title="My requests">
          {isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="small" />
            </View>
          ) : requests.length === 0 ? (
            <Text style={styles.metaText}>No requests yet.</Text>
          ) : (
            <View style={styles.stack}>
              {requests.map((item) => (
                <View key={item.requestId} style={styles.card}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.cardTitle}>{formatDateTime(item.startsAt)}</Text>
                    <Text
                      style={[
                        styles.statusChip,
                        item.status === "approved"
                          ? styles.statusApproved
                          : item.status === "pending"
                            ? styles.statusPending
                            : styles.statusMuted,
                      ]}
                    >
                      {formatStatus(item.status)}
                    </Text>
                  </View>
                  <Text style={styles.metaText}>Ends: {formatDateTime(item.endsAt)}</Text>
                  {item.reviewedAt ? (
                    <Text style={styles.metaText}>
                      Reviewed: {formatDateTime(item.reviewedAt)}
                    </Text>
                  ) : null}
                  {item.status === "approved" && item.meetingLink ? (
                    <Pressable
                      style={({ pressed }) => [
                        styles.linkButton,
                        pressed ? styles.linkButtonPressed : null,
                      ]}
                      onPress={() => {
                        const link = item.meetingLink?.trim();
                        if (!link) {
                          return;
                        }
                        void Linking.openURL(link);
                      }}
                    >
                      <Text style={styles.linkButtonText}>Open meeting link</Text>
                    </Pressable>
                  ) : null}
                  {(item.status === "pending" || item.status === "approved") ? (
                    <PrimaryButton
                      label={
                        cancelingRequestId === item.requestId
                          ? "Canceling..."
                          : "Cancel request"
                      }
                      loading={cancelingRequestId === item.requestId}
                      disabled={isOffline || cancelingRequestId !== null}
                      onPress={() => {
                        Alert.alert(
                          "Cancel this request?",
                          "This updates your appointment request status.",
                          [
                            { text: "Keep", style: "cancel" },
                            {
                              text: "Cancel request",
                              style: "destructive",
                              onPress: () => {
                                void handleCancelRequest(item);
                              },
                            },
                          ]
                        );
                      }}
                    />
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </Section>
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
    minHeight: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  stack: {
    gap: 8,
  },
  card: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    gap: 8,
    backgroundColor: "#fff",
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  metaText: {
    fontSize: 13,
    color: "#4b5563",
  },
  noteInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    minHeight: 80,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top",
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#fff",
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  statusChip: {
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  statusPending: {
    backgroundColor: "#fef3c7",
    color: "#92400e",
  },
  statusApproved: {
    backgroundColor: "#dcfce7",
    color: "#166534",
  },
  statusMuted: {
    backgroundColor: "#e5e7eb",
    color: "#374151",
  },
  linkButton: {
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  linkButtonPressed: {
    opacity: 0.85,
  },
  linkButtonText: {
    color: "#1d4ed8",
    fontSize: 14,
    fontWeight: "600",
  },
});
