import { Redirect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
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
  logNutrition,
  type NutritionEntry,
  type NutritionLogPayload,
} from "@/src/api/patient";
import { isApiError, type ApiError } from "@/src/api/client";
import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
import { Card } from "@/src/components/Card";
import { DomainIcon } from "@/src/components/IconSet";
import { HeroHeader } from "@/src/components/HeroHeader";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { MediaCard } from "@/src/components/MediaCard";
import { PrimaryButton } from "@/src/components/PrimaryButton";
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
import {
  addPendingNutrition,
  getPendingNutrition,
  removePendingNutrition,
  type PendingNutritionEntry,
} from "@/src/state/pendingNutrition";
import { useLastRefreshed } from "@/src/state/refresh";
import { useTokens } from "@/src/theme/tokens";
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
  const router = useRouter();
  const isOffline = useIsOffline();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
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
  const [showDiagnostics, setShowDiagnostics] = useState(false);

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
  const trackedRatio = Math.max(0, Math.min(1, summary.trackedDays / 7));
  const todayLoggedRatio = currentEntry ? 1 : 0;
  const pendingCount = pendingEntries.length;
  const nutritionStatusLabel = currentEntry
    ? currentEntry.pending
      ? "Saved locally"
      : "Logged today"
    : "Ready to log";
  const nutritionStatusTone = currentEntry
    ? currentEntry.pending
      ? "warning"
      : "success"
    : "info";
  const nutritionStoryTitle = currentEntry
    ? "Today’s nutrition check is saved"
    : "Log today’s meals in one short check";
  const nutritionStoryNote = currentEntry
    ? `Fruit and veg ${currentEntry.fruitVegServings} · protein ${currentEntry.protein} · meals ${currentEntry.mealRegularity}${currentEntry.pending ? " · waiting to sync" : ""}.`
    : "A short daily nutrition check helps you notice patterns in protein, fruit and veg, meal regularity, and appetite.";

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
            message="Nutrition logs are queued locally and marked pending."
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
              delta="Awaiting sync"
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
              text: pendingCount > 0 ? `Pending ${pendingCount}` : `Tracking from ${today}`,
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
                label={pendingCount > 0 ? `${pendingCount} pending` : "Daily check"}
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
                label={isSyncing ? "Syncing..." : "Sync saved logs"}
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
    handleSaveToday,
    handleSyncPending,
    isOffline,
    isSaving,
    isSyncing,
    notice,
    nutritionStatusLabel,
    nutritionStatusTone,
    nutritionStoryNote,
    nutritionStoryTitle,
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
    summary.avgFruitVegServings,
    summary.proteinOkHighDays,
    summary.trackedDays,
    tokens.colors.textMuted,
    tokens.spacing.md,
    today,
    todayLoggedRatio,
    trackedRatio,
  ]);

  if (auth.status === "loading") {
    return (
      <Screen
        scroll={false}
        header={<HeroHeader variant="compact" title="Nutrition" subtitle="Quick daily log" />}
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
