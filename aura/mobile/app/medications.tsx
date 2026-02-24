import { Redirect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
  getMedications,
  getMedicationToday,
  logMedicationDose,
  type MedicationDose,
  type MedicationLogPayload,
  type MedicationTodayResponse,
} from "@/src/api/patient";
import { InlineNotice } from "@/src/components/InlineNotice";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { Section } from "@/src/components/Section";
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
import {
  addPendingMedicationLog,
  getPendingMedicationLogs,
  removePendingMedicationLog,
  type PendingMedicationLog,
} from "@/src/state/pendingMedicationLogs";
import { useLastRefreshed } from "@/src/state/refresh";
import { todayISO } from "@/src/utils/date";
import { normalizeUnknownError } from "@/src/utils/errors";

type NoticeState = {
  variant: "info" | "warning" | "error";
  title: string;
  message: string;
};

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
  pending: PendingMedicationLog[],
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
    .filter((entry) => entry.date === date)
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));

  for (const entry of relevant) {
    const medication = nextItems.find((item) => item.medicationId === entry.medicationId);
    const dose = medication?.doses.find((candidate) => candidate.time === entry.time);
    if (!dose) {
      continue;
    }
    dose.status = entry.status;
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

function statusStyle(status: MedicationDose["status"]) {
  if (status === "taken") {
    return {
      backgroundColor: "#dcfce7",
      color: "#166534",
    };
  }
  if (status === "skipped") {
    return {
      backgroundColor: "#fee2e2",
      color: "#991b1b",
    };
  }
  return {
    backgroundColor: "#e5e7eb",
    color: "#374151",
  };
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

export default function MedicationsScreen() {
  const auth = useAuth();
  const isOffline = useIsOffline();
  const medicationsRefresh = useLastRefreshed("medications");
  const medicationsLoadError = useLastError("medicationsLoad");
  const medicationLogError = useLastError("medicationLog");

  const patientId = auth.patient?.id ?? "";
  const today = useMemo(() => todayISO(), []);
  const tzOffsetMinutes = -new Date().getTimezoneOffset();

  const [todayChecklist, setTodayChecklist] = useState<MedicationTodayResponse | null>(null);
  const [pendingLogs, setPendingLogs] = useState<PendingMedicationLog[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeDoseKey, setActiveDoseKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);

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

  const reloadPending = useCallback(async () => {
    if (!patientId) {
      setPendingLogs([]);
      return;
    }
    const pending = await getPendingMedicationLogs(patientId);
    setPendingLogs(pending);
  }, [patientId]);

  const loadToday = useCallback(async () => {
    if (!auth.token || !patientId) {
      return;
    }

    setIsLoading(true);
    setNotice(null);

    if (isOffline) {
      const [cached, cachedList, pending] = await Promise.all([
        getCachedMedicationToday(patientId, today),
        getCachedMedications(patientId),
        getPendingMedicationLogs(patientId),
      ]);
      setPendingLogs(pending);
      setTodayChecklist(
        applyPendingToToday(
          cached
            ? {
                ok: true,
                date: cached.date,
                items: cached.items,
              }
            : buildFallbackTodayFromMedications(today, cachedList),
          pending,
          today
        )
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
      const [live, list, pending] = await Promise.all([
        getMedicationToday(auth.token, { date: today, tzOffsetMinutes }),
        getMedications(auth.token),
        getPendingMedicationLogs(patientId),
      ]);
      const merged = applyPendingToToday(live, pending, today);
      setTodayChecklist(merged);
      setPendingLogs(pending);
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

      const [cached, cachedList, pending] = await Promise.all([
        getCachedMedicationToday(patientId, today),
        getCachedMedications(patientId),
        getPendingMedicationLogs(patientId),
      ]);
      setPendingLogs(pending);
      setTodayChecklist(
        applyPendingToToday(
          cached
            ? {
                ok: true,
                date: cached.date,
                items: cached.items,
              }
            : buildFallbackTodayFromMedications(today, cachedList),
          pending,
          today
        )
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

  const queueDoseOffline = useCallback(
    async (payload: MedicationLogPayload, message: string) => {
      if (!patientId) {
        return;
      }
      const pending = await addPendingMedicationLog(patientId, payload);
      const pendingAll = await getPendingMedicationLogs(patientId);
      setPendingLogs(pendingAll);
      const nextChecklist = applyDoseUpdate(todayChecklist, {
        medicationId: payload.medicationId,
        time: payload.time,
        status: payload.status,
        loggedAt: pending.createdAt,
        pending: true,
        localId: pending.localId,
      });
      setTodayChecklist(nextChecklist);
      if (nextChecklist) {
        await setCachedMedicationToday(patientId, nextChecklist);
      }
      await medicationLogError.setLocalError({
        title: "Saved locally",
        message,
        kind: "offline",
        retryable: true,
      });
      setNotice({
        variant: "warning",
        title: "Saved locally",
        message,
      });
    },
    [medicationLogError, patientId, todayChecklist]
  );

  const handleDoseAction = useCallback(
    async (payload: MedicationLogPayload) => {
      if (!auth.token || !patientId) {
        return;
      }

      const doseKey = `${payload.medicationId}:${payload.time}`;
      setActiveDoseKey(doseKey);
      const note = noteDraft.trim();
      const finalPayload = {
        ...payload,
        note: note ? note.slice(0, 280) : undefined,
      };

      if (isOffline) {
        await queueDoseOffline(finalPayload, "Dose action queued. Sync when online.");
        setActiveDoseKey(null);
        return;
      }

      try {
        const result = await logMedicationDose(auth.token, finalPayload);
        const nextChecklist = applyDoseUpdate(todayChecklist, {
          medicationId: payload.medicationId,
          time: payload.time,
          status: result.status,
          loggedAt: result.loggedAt ?? new Date().toISOString(),
        });
        setTodayChecklist(nextChecklist);
        if (nextChecklist) {
          await setCachedMedicationToday(patientId, nextChecklist);
        }
        await medicationLogError.clear();
        await medicationsRefresh.refreshLocal();
        setNoteDraft("");
      } catch (error) {
        const friendly = toFriendlyMedicationError(error, "Dose not logged");
        if (friendly.kind === "validation") {
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
        } else {
          await queueDoseOffline(finalPayload, "Dose action queued due to sync failure.");
        }
      } finally {
        setActiveDoseKey(null);
      }
    },
    [
      auth.token,
      isOffline,
      medicationLogError,
      medicationsRefresh,
      noteDraft,
      patientId,
      queueDoseOffline,
      todayChecklist,
    ]
  );

  const syncPending = useCallback(async () => {
    if (!auth.token || !patientId || isOffline || isSyncing) {
      return;
    }
    const pending = await getPendingMedicationLogs(patientId);
    if (pending.length === 0) {
      return;
    }

    setIsSyncing(true);
    setNotice(null);

    const ordered = [...pending].sort(
      (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt)
    );

    for (const entry of ordered) {
      try {
        await logMedicationDose(auth.token, {
          medicationId: entry.medicationId,
          date: entry.date,
          time: entry.time,
          status: entry.status,
          note: entry.note,
        });
        await removePendingMedicationLog(patientId, entry.localId);
      } catch (error) {
        const friendly = toFriendlyMedicationError(error, "Sync failed");
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
        await reloadPending();
        setIsSyncing(false);
        return;
      }
    }

    await Promise.all([medicationLogError.clear(), medicationsRefresh.refreshLocal()]);
    await loadToday();
    setNotice({
      variant: "info",
      title: "Synced",
      message: "Pending medication logs were synced.",
    });
    setIsSyncing(false);
  }, [
    auth.token,
    isOffline,
    isSyncing,
    loadToday,
    medicationLogError,
    medicationsRefresh,
    patientId,
    reloadPending,
  ]);

  if (auth.status === "loading") {
    return (
      <Screen title="Medications">
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
    <Screen title="Medications">
      <ScrollView contentContainerStyle={styles.container}>
        <LastRefreshed value={medicationsRefresh.label} />
        <LastFailedAttempt
          value={medicationsLoadError.label}
          title={medicationsLoadError.lastError?.title}
          message={medicationsLoadError.lastError?.message}
          onClear={medicationsLoadError.lastError ? medicationsLoadError.clear : undefined}
        />
        <LastFailedAttempt
          value={medicationLogError.label}
          title={medicationLogError.lastError?.title}
          message={medicationLogError.lastError?.message}
          onClear={medicationLogError.lastError ? medicationLogError.clear : undefined}
        />

        <Section title="Today">
          <Text style={styles.bodyText}>Date: {today}</Text>
          <Text style={styles.bodyText}>Taken: {takenCount} / {totalDoses}</Text>
          <Text style={styles.bodyText}>Pending sync: {pendingCount}</Text>
          {pendingCount > 0 ? (
            <PrimaryButton
              label={isSyncing ? "Syncing..." : "Sync now"}
              loading={isSyncing}
              disabled={isOffline || isSyncing}
              onPress={() => {
                void syncPending();
              }}
            />
          ) : null}
        </Section>

        {isOffline ? (
          <InlineNotice
            variant="warning"
            title="Offline"
            message="Dose updates are queued locally and marked pending."
          />
        ) : null}
        {notice ? (
          <InlineNotice
            variant={notice.variant}
            title={notice.title}
            message={notice.message}
          />
        ) : null}

        <Section title="Optional note for next dose log">
          <TextInput
            value={noteDraft}
            onChangeText={(value) => setNoteDraft(value.slice(0, 280))}
            multiline
            maxLength={280}
            placeholder="Optional short note"
            style={styles.noteInput}
          />
          <Text style={styles.metaText}>{noteDraft.length}/280</Text>
        </Section>

        <Section title="Today checklist">
          {isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="small" />
            </View>
          ) : !todayChecklist || todayChecklist.items.length === 0 ? (
            <Text style={styles.metaText}>No active medications scheduled for today.</Text>
          ) : (
            <View style={styles.stack}>
              {todayChecklist.items.map((item) => (
                <View key={item.medicationId} style={styles.card}>
                  <Text style={styles.cardTitle}>
                    {item.name} ({item.type})
                  </Text>
                  {item.instructions ? (
                    <Text style={styles.metaText}>Instructions: {item.instructions}</Text>
                  ) : null}

                  {item.doses.length === 0 ? (
                    <Text style={styles.metaText}>No doses due for this date.</Text>
                  ) : (
                    <View style={styles.stack}>
                      {item.doses.map((dose) => {
                        const key = `${item.medicationId}:${dose.time}`;
                        const statusChip = statusStyle(dose.status);
                        return (
                          <View key={key} style={styles.doseRow}>
                            <View style={styles.doseMain}>
                              <Text style={styles.bodyText}>{formatTimeLabel(dose.time)}</Text>
                              <Text
                                style={[
                                  styles.statusChip,
                                  { backgroundColor: statusChip.backgroundColor, color: statusChip.color },
                                ]}
                              >
                                {dose.status.toUpperCase()}
                                {dose.pending ? " (PENDING)" : ""}
                              </Text>
                            </View>
                            <View style={styles.actionRow}>
                              <Pressable
                                style={styles.actionButton}
                                disabled={activeDoseKey === key}
                                onPress={() => {
                                  void handleDoseAction({
                                    medicationId: item.medicationId,
                                    date: today,
                                    time: dose.time,
                                    status: "taken",
                                  });
                                }}
                              >
                                <Text style={styles.actionButtonText}>Taken</Text>
                              </Pressable>
                              <Pressable
                                style={[styles.actionButton, styles.actionButtonSecondary]}
                                disabled={activeDoseKey === key}
                                onPress={() => {
                                  void handleDoseAction({
                                    medicationId: item.medicationId,
                                    date: today,
                                    time: dose.time,
                                    status: "skipped",
                                  });
                                }}
                              >
                                <Text style={styles.actionButtonText}>Skipped</Text>
                              </Pressable>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
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
  bodyText: {
    fontSize: 14,
    color: "#111827",
  },
  metaText: {
    fontSize: 12,
    color: "#6b7280",
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
  doseRow: {
    gap: 8,
  },
  doseMain: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  actionRow: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    flex: 1,
    backgroundColor: "#111827",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  actionButtonSecondary: {
    backgroundColor: "#374151",
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
});
