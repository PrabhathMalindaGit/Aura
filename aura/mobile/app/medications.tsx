import { Redirect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
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
  logMedicationDose,
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
import {
  addPendingMedicationLog,
  getPendingMedicationLogs,
  removePendingMedicationLog,
  type PendingMedicationLog,
} from "@/src/state/pendingMedicationLogs";
import { useLastRefreshed } from "@/src/state/refresh";
import { useTokens } from "@/src/theme/tokens";
import { todayISO } from "@/src/utils/date";
import { normalizeUnknownError } from "@/src/utils/errors";

type NoticeState = {
  variant: "info" | "warning" | "error";
  title: string;
  message: string;
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

  const [todayChecklist, setTodayChecklist] = useState<MedicationTodayResponse | null>(null);
  const [pendingLogs, setPendingLogs] = useState<PendingMedicationLog[]>([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeDoseKey, setActiveDoseKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

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

  const listHeader = useMemo(() => {
    const showNotice = Boolean(notice && !(isOffline && notice.title === "Offline"));

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
            message="Dose updates are queued locally and marked pending."
          />
        ) : null}
        {showNotice && notice ? (
          <Banner
            variant={toBannerVariant(notice.variant)}
            title={notice.title}
            message={notice.message}
          />
        ) : null}

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
              delta="Awaiting sync"
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
            title="Pending sync"
            subtitle={`${pendingCount} medication log${pendingCount === 1 ? "" : "s"} waiting`}
            actions={[
              {
                label: isSyncing ? "Syncing..." : "Sync now",
                kind: "primary",
                disabled: isOffline || isSyncing,
                onPress: () => {
                  void syncPending();
                },
              },
            ]}
          />
        ) : null}

        <Card variant="outlined" padding={tokens.spacing.md}>
          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>Optional note for next dose log</Text>
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
      </View>
    );
  }, [
    doseProgress,
    isOffline,
    isSyncing,
    medicationLogError.clear,
    medicationLogError.label,
    medicationLogError.lastError?.message,
    medicationLogError.lastError?.title,
    medicationsLoadError.clear,
    medicationsLoadError.label,
    medicationsLoadError.lastError?.message,
    medicationsLoadError.lastError?.title,
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
    styles.noteInput,
    styles.noteTitle,
    styles.pressed,
    styles.trackerGrid,
    styles.trackerTileWrap,
    syncPending,
    takenCount,
    today,
    tokens.colors.textMuted,
    tokens.spacing.md,
    totalDoses,
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
          subtitle={`Taken ${takenCount}/${totalDoses} · Pending ${pendingCount}`}
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
        />
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
              <Text style={styles.metaText}>No active medications scheduled for today.</Text>
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
                subtitle={item.instructions ? `Instructions: ${item.instructions}` : "Today's schedule"}
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
                      ? { text: "Done", tone: "success" }
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
                            <Text style={styles.doseTime}>{formatTimeLabel(dose.time)}</Text>
                            <StatusPill
                              label={`${dose.status.toUpperCase()}${dose.pending ? " (PENDING)" : ""}`}
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
                              <Text style={styles.actionButtonText}>Taken</Text>
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
                              <Text style={styles.actionButtonSecondaryText}>Skipped</Text>
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
    listSeparator: {
      height: tokens.spacing.md,
    },
    centered: {
      minHeight: 100,
      alignItems: "center",
      justifyContent: "center",
    },
    metaText: {
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      color: tokens.colors.textMuted,
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
    noteTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
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
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    doseTime: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    actionRow: {
      flexDirection: "row",
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
