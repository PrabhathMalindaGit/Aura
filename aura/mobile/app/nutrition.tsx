import { Redirect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
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
  logNutrition,
  type NutritionEntry,
  type NutritionLogPayload,
} from "@/src/api/patient";
import { isApiError, type ApiError } from "@/src/api/client";
import { InlineNotice } from "@/src/components/InlineNotice";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { Section } from "@/src/components/Section";
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
import {
  addPendingNutrition,
  getPendingNutrition,
  removePendingNutrition,
  type PendingNutritionEntry,
} from "@/src/state/pendingNutrition";
import { useLastRefreshed } from "@/src/state/refresh";
import { addDaysISO, todayISO } from "@/src/utils/date";
import { normalizeUnknownError } from "@/src/utils/errors";

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

function toPendingEntry(pending: PendingNutritionEntry): NutritionEntry {
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

export default function NutritionScreen() {
  const auth = useAuth();
  const isOffline = useIsOffline();
  const nutritionRefresh = useLastRefreshed("nutrition");
  const nutritionLoadError = useLastError("nutritionLoad");
  const nutritionLogError = useLastError("nutritionLog");

  const [todayEntry, setTodayEntry] = useState<NutritionEntry | null>(null);
  const [pendingEntries, setPendingEntries] = useState<PendingNutritionEntry[]>([]);
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

  const today = useMemo(() => todayISO(), []);
  const rangeFrom = useMemo(() => addDaysISO(today, -6), [today]);
  const patientId = auth.patient?.id ?? "";
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

  const reloadPending = useCallback(async () => {
    if (!patientId) {
      setPendingEntries([]);
      return;
    }
    const pending = await getPendingNutrition(patientId);
    setPendingEntries(pending);
  }, [patientId]);

  const loadNutrition = useCallback(async () => {
    if (!auth.token || !patientId) {
      return;
    }

    setIsLoading(true);
    setNotice(null);

    if (isOffline) {
      const [cachedToday, cachedRange, pending] = await Promise.all([
        getCachedNutritionDay(patientId, today),
        getCachedNutritionRange(patientId, rangeFrom, today),
        getPendingNutrition(patientId),
      ]);
      setPendingEntries(pending);
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
        reloadPending(),
      ]);
    } catch (error) {
      const friendly = toFriendlyNutritionError(error, "Couldn’t load nutrition");
      await nutritionLoadError.setLocalError({
        title: friendly.title,
        message: friendly.message,
        kind: friendly.kind,
        retryable: friendly.retryable,
      });

      const [cachedToday, cachedRange, pending] = await Promise.all([
        getCachedNutritionDay(patientId, today),
        getCachedNutritionRange(patientId, rangeFrom, today),
        getPendingNutrition(patientId),
      ]);
      setPendingEntries(pending);
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
    reloadPending,
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

  const queueOffline = useCallback(
    async (payload: NutritionLogPayload, title: string, message: string) => {
      if (!patientId) {
        return;
      }

      const pending = await addPendingNutrition(patientId, payload);
      const pendingNext = await getPendingNutrition(patientId);
      setPendingEntries(pendingNext);
      const pendingEntry = toPendingEntry(pending);
      setTodayEntry(pendingEntry);
      await setCachedNutritionDay(patientId, {
        cachedAt: Date.now(),
        date: payload.date ?? today,
        entry: pendingEntry,
      });

      await nutritionLogError.setLocalError({
        title,
        message,
        kind: "offline",
        retryable: true,
      });
      setNotice({
        variant: "warning",
        title,
        message,
      });
    },
    [nutritionLogError, patientId, today]
  );

  const handleSaveToday = useCallback(async () => {
    if (!auth.token || !patientId || isSaving) {
      return;
    }
    const payload = buildPayload();
    setIsSaving(true);

    if (isOffline) {
      await queueOffline(
        payload,
        "Saved locally",
        "Offline — nutrition log queued. Sync when online."
      );
      setIsSaving(false);
      return;
    }

    try {
      const saved = await logNutrition(auth.token, payload);
      setTodayEntry(saved);
      await Promise.all([
        setCachedNutritionDay(patientId, {
          cachedAt: Date.now(),
          date: saved.date,
          entry: saved,
        }),
        nutritionLogError.clear(),
      ]);
      setNotice({
        variant: "info",
        title: "Saved",
        message: "Today’s nutrition log was saved.",
      });
      await loadNutrition();
    } catch (error) {
      const friendly = toFriendlyNutritionError(error, "Saved locally");
      if (friendly.kind === "validation") {
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
      } else {
        await queueOffline(payload, friendly.title, friendly.message);
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    auth.token,
    buildPayload,
    isOffline,
    isSaving,
    loadNutrition,
    patientId,
    queueOffline,
    nutritionLogError,
  ]);

  const handleSyncPending = useCallback(async () => {
    if (!auth.token || !patientId || isOffline || isSyncing) {
      return;
    }

    const pending = await getPendingNutrition(patientId);
    if (pending.length === 0) {
      return;
    }

    setIsSyncing(true);
    setNotice(null);
    for (const entry of pending) {
      try {
        await logNutrition(auth.token, {
          ...entry.payload,
          date: entry.date,
        });
        await removePendingNutrition(patientId, entry.localId);
      } catch (error) {
        const friendly = toFriendlyNutritionError(error, "Sync failed");
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
        await reloadPending();
        setIsSyncing(false);
        return;
      }
    }

    await Promise.all([nutritionLogError.clear(), nutritionRefresh.refreshLocal(), loadNutrition()]);
    setNotice({
      variant: "info",
      title: "Synced",
      message: "Pending nutrition logs were synced.",
    });
    setIsSyncing(false);
  }, [
    auth.token,
    isOffline,
    isSyncing,
    loadNutrition,
    nutritionLogError,
    nutritionRefresh,
    patientId,
    reloadPending,
  ]);

  if (auth.status === "loading") {
    return (
      <Screen title="Nutrition">
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
    <Screen title="Nutrition">
      <ScrollView contentContainerStyle={styles.container}>
        <LastRefreshed value={nutritionRefresh.label} />
        <LastFailedAttempt
          value={nutritionLoadError.label}
          title={nutritionLoadError.lastError?.title}
          message={nutritionLoadError.lastError?.message}
          onClear={nutritionLoadError.lastError ? nutritionLoadError.clear : undefined}
        />
        <LastFailedAttempt
          value={nutritionLogError.label}
          title={nutritionLogError.lastError?.title}
          message={nutritionLogError.lastError?.message}
          onClear={nutritionLogError.lastError ? nutritionLogError.clear : undefined}
        />

        <Section title="Today">
          <Text style={styles.bodyText}>Date: {today}</Text>
          <Text style={styles.bodyText}>Pending sync: {pendingEntries.length}</Text>
          {currentEntry ? (
            <Text style={styles.metaText}>
              Saved at {formatTime(currentEntry.createdAt)} {currentEntry.pending ? "(Pending sync)" : ""}
            </Text>
          ) : (
            <Text style={styles.metaText}>No log yet for today.</Text>
          )}
        </Section>

        {isOffline ? (
          <InlineNotice
            variant="warning"
            title="Offline"
            message="Nutrition logs are queued locally and marked pending."
          />
        ) : null}
        {notice ? (
          <InlineNotice
            variant={notice.variant}
            title={notice.title}
            message={notice.message}
          />
        ) : null}

        <Section title="Quick daily log">
          <Text style={styles.label}>Protein adequacy</Text>
          <View style={styles.chipRow}>
            {(["low", "ok", "high"] as const).map((option) => (
              <Pressable
                key={option}
                style={[
                  styles.chip,
                  form.protein === option ? styles.chipSelected : null,
                ]}
                onPress={() => setForm((prev) => ({ ...prev, protein: option }))}
              >
                <Text
                  style={
                    form.protein === option ? styles.chipTextSelected : styles.chipText
                  }
                >
                  {option.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Fruit/veg servings</Text>
          <View style={styles.stepperRow}>
            <PrimaryButton
              label="-"
              disabled={form.fruitVegServings <= 0}
              onPress={() =>
                setForm((prev) => ({
                  ...prev,
                  fruitVegServings: Math.max(0, prev.fruitVegServings - 1),
                }))
              }
            />
            <Text style={styles.stepperValue}>{form.fruitVegServings}</Text>
            <PrimaryButton
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

          <View style={styles.switchRow}>
            <Text style={styles.label}>Anti-inflammatory focus</Text>
            <Switch
              value={form.antiInflammatoryFocus}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, antiInflammatoryFocus: value }))
              }
            />
          </View>

          <Text style={styles.label}>Meal regularity</Text>
          <View style={styles.chipRow}>
            {(["irregular", "mostly", "regular"] as const).map((option) => (
              <Pressable
                key={option}
                style={[
                  styles.chip,
                  form.mealRegularity === option ? styles.chipSelected : null,
                ]}
                onPress={() =>
                  setForm((prev) => ({ ...prev, mealRegularity: option }))
                }
              >
                <Text
                  style={
                    form.mealRegularity === option
                      ? styles.chipTextSelected
                      : styles.chipText
                  }
                >
                  {option}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Appetite (optional)</Text>
          <View style={styles.chipRow}>
            {(["low", "normal", "high"] as const).map((option) => (
              <Pressable
                key={option}
                style={[
                  styles.chip,
                  form.appetite === option ? styles.chipSelected : null,
                ]}
                onPress={() =>
                  setForm((prev) => ({
                    ...prev,
                    appetite: prev.appetite === option ? null : option,
                  }))
                }
              >
                <Text
                  style={
                    form.appetite === option ? styles.chipTextSelected : styles.chipText
                  }
                >
                  {option}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            value={form.notes}
            onChangeText={(value) =>
              setForm((prev) => ({ ...prev, notes: value.slice(0, 280) }))
            }
            multiline
            maxLength={280}
            placeholder="Optional short note"
            style={styles.notesInput}
          />
          <Text style={styles.metaText}>{form.notes.length}/280</Text>

          <PrimaryButton
            label={isSaving ? "Saving..." : "Save today"}
            loading={isSaving}
            disabled={isSaving}
            onPress={() => {
              void handleSaveToday();
            }}
          />
          <PrimaryButton
            label="Clear"
            onPress={() => {
              setForm(toFormState(null));
            }}
          />
          {pendingEntries.length > 0 ? (
            <PrimaryButton
              label={isSyncing ? "Syncing..." : "Sync now"}
              loading={isSyncing}
              disabled={isOffline || isSyncing}
              onPress={() => {
                void handleSyncPending();
              }}
            />
          ) : null}
        </Section>

        <Section title="Recent summary (7 days)">
          {isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="small" />
            </View>
          ) : summary.trackedDays === 0 ? (
            <Text style={styles.metaText}>No nutrition logs in the last 7 days.</Text>
          ) : (
            <View style={styles.stack}>
              <Text style={styles.bodyText}>Tracked days: {summary.trackedDays}</Text>
              <Text style={styles.bodyText}>
                Avg fruit/veg servings: {summary.avgFruitVegServings ?? "—"}
              </Text>
              <Text style={styles.bodyText}>
                Protein OK/high days: {summary.proteinOkHighDays}
              </Text>
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
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  chipSelected: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  chipText: {
    color: "#111827",
    fontWeight: "600",
  },
  chipTextSelected: {
    color: "#fff",
    fontWeight: "600",
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  stepperValue: {
    minWidth: 40,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  switchRow: {
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  notesInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    minHeight: 88,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top",
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#fff",
  },
  bodyText: {
    fontSize: 14,
    color: "#111827",
  },
  metaText: {
    fontSize: 13,
    color: "#4b5563",
  },
});
