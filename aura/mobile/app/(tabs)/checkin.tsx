import { Redirect, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { isApiError } from "@/src/api/client";
import {
  createCheckin,
  type CheckInCreatePayload,
} from "@/src/api/patient";
import { InlineNotice } from "@/src/components/InlineNotice";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { Section } from "@/src/components/Section";
import { useAuth } from "@/src/state/auth";
import { type LastErrorRecord, useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { useLastRefreshed } from "@/src/state/refresh";
import {
  BODY_MAP_PAIN_TYPES,
  BODY_MAP_REGION_GROUPS,
  painTypeLabel,
  regionLabel,
  type BodyMapPainType,
  type BodyMapRegion,
} from "@/src/utils/bodyMapLabels";
import { todayISO } from "@/src/utils/date";
import { normalizeUnknownError } from "@/src/utils/errors";

type SubmitNotice = {
  variant: "success" | "warning" | "error";
  title: string;
  message: string;
  retryable?: boolean;
};

type StepperProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  valueFormatter?: (value: number) => string;
  onChange: (nextValue: number) => void;
};

type OptionalStepperProps = Omit<StepperProps, "value" | "onChange"> & {
  value: number | null;
  onChange: (nextValue: number | null) => void;
  clearLabel?: string;
};

type BodyMapSelection = {
  intensity: number;
  type: BodyMapPainType;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function Stepper({
  label,
  value,
  min,
  max,
  step,
  valueFormatter,
  onChange,
}: StepperProps) {
  const displayValue = valueFormatter ? valueFormatter(value) : String(value);

  return (
    <View style={styles.stepperWrapper}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.stepperRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          onPress={() => onChange(clamp(value - step, min, max))}
          style={({ pressed }) => [
            styles.stepperButton,
            pressed ? styles.stepperButtonPressed : null,
          ]}
        >
          <Text style={styles.stepperButtonText}>−</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{displayValue}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          onPress={() => onChange(clamp(value + step, min, max))}
          style={({ pressed }) => [
            styles.stepperButton,
            pressed ? styles.stepperButtonPressed : null,
          ]}
        >
          <Text style={styles.stepperButtonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function OptionalStepper({
  value,
  onChange,
  clearLabel = "Clear",
  ...props
}: OptionalStepperProps) {
  const effectiveValue = value ?? props.min;

  return (
    <View style={styles.optionalStepperWrapper}>
      <Stepper
        {...props}
        value={effectiveValue}
        onChange={(nextValue) => onChange(nextValue)}
      />
      <View style={styles.optionalStepperFooter}>
        <Text style={styles.optionalValueHint}>
          {value === null ? "Not set" : "Set"}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange(null)}
          style={({ pressed }) => [
            styles.clearOptionalButton,
            pressed ? styles.clearOptionalButtonPressed : null,
          ]}
        >
          <Text style={styles.clearOptionalButtonText}>{clearLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function toCheckinError(
  error: unknown
): Omit<LastErrorRecord, "key" | "at" | "title"> & { title?: string } {
  if (isApiError(error)) {
    if (error.kind === "offline") {
      return {
        title: "Couldn’t submit",
        message: "You’re offline. Nothing was sent.",
        kind: "offline",
        retryable: true,
        detail: error.detail,
      };
    }

    if (error.status === 400 || error.kind === "validation") {
      return {
        title: "Couldn’t submit",
        message: "Please review your check-in details and try again.",
        kind: "validation",
        retryable: false,
        detail: error.detail,
      };
    }

    if (error.kind === "network") {
      return {
        title: "Couldn’t submit",
        message: "Couldn’t reach the server. Please try again.",
        kind: "network",
        retryable: true,
        detail: error.detail,
      };
    }

    if (error.kind === "server") {
      return {
        title: "Couldn’t submit",
        message: "Service unavailable. Please try again shortly.",
        kind: "server",
        retryable: true,
        detail: error.detail,
      };
    }

    return {
      title: "Couldn’t submit",
      message: error.message || "Please try again.",
      kind: "unknown",
      retryable: error.retryable,
      detail: error.detail,
    };
  }

  const normalized = normalizeUnknownError(error);
  return {
    title: "Couldn’t submit",
    message: normalized.message,
    kind: normalized.kind,
    retryable: normalized.retryable,
    detail: normalized.detail,
  };
}

export default function CheckinScreen() {
  const router = useRouter();
  const auth = useAuth();
  const isOffline = useIsOffline();
  const checkinsRefresh = useLastRefreshed("checkins");
  const checkinError = useLastError("checkinSubmit");

  const [date] = useState(() => todayISO());
  const [pain, setPain] = useState(0);
  const [mood, setMood] = useState<number | null>(null);
  const [exercisePercent, setExercisePercent] = useState(0);
  const [medication, setMedication] = useState(false);
  const [sleepHours, setSleepHours] = useState<number | null>(null);
  const [sleepQuality, setSleepQuality] = useState<number | null>(null);
  const [sleepDisturbances, setSleepDisturbances] = useState<number | null>(null);
  const [selectedRegions, setSelectedRegions] = useState<BodyMapRegion[]>([]);
  const [bodyMapSelections, setBodyMapSelections] = useState<
    Partial<Record<BodyMapRegion, BodyMapSelection>>
  >({});
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<SubmitNotice | null>(null);

  const validationMessage = useMemo(() => {
    if (mood === null || mood < 1 || mood > 5) {
      return "Select a mood from 1 to 5.";
    }
    if (pain < 0 || pain > 10) {
      return "Pain must be between 0 and 10.";
    }
    if (exercisePercent < 0 || exercisePercent > 100) {
      return "Exercise adherence must be between 0% and 100%.";
    }
    if (selectedRegions.length > 6) {
      return "Select up to 6 body areas.";
    }
    return null;
  }, [exercisePercent, mood, pain, selectedRegions.length]);

  if (auth.status === "loading") {
    return (
      <Screen title="Daily check-in">
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" />
        </View>
      </Screen>
    );
  }

  if (auth.status === "signedOut") {
    return <Redirect href="/(auth)/login" />;
  }

  const resetForm = () => {
    setPain(0);
    setMood(null);
    setExercisePercent(0);
    setMedication(false);
    setSleepHours(null);
    setSleepQuality(null);
    setSleepDisturbances(null);
    setSelectedRegions([]);
    setBodyMapSelections({});
    setNotes("");
  };

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    if (!auth.token) {
      setNotice({
        variant: "error",
        title: "Session expired",
        message: "Please sign in again.",
      });
      router.replace("/(auth)/login");
      return;
    }

    if (validationMessage) {
      setNotice({
        variant: "warning",
        title: "Check your entries",
        message: validationMessage,
      });
      return;
    }

    if (isOffline) {
      const message = "You’re offline. Nothing was sent.";
      await checkinError.setLocalError({
        title: "Couldn’t submit",
        message,
        kind: "offline",
        retryable: true,
      });
      setNotice({
        variant: "warning",
        title: "Offline",
        message,
        retryable: true,
      });
      return;
    }

    const hasSleepData =
      sleepHours !== null || sleepQuality !== null || sleepDisturbances !== null;
    const hasBodyMapData = selectedRegions.length > 0;

    const payload: CheckInCreatePayload = {
      date,
      mood: mood ?? 1,
      pain,
      adherence: {
        exercises: Number((exercisePercent / 100).toFixed(1)),
        medication,
      },
      sleep: hasSleepData
        ? {
            hours: sleepHours ?? undefined,
            quality: sleepQuality ?? undefined,
            disturbances: sleepDisturbances ?? undefined,
          }
        : undefined,
      bodyMap: hasBodyMapData
        ? {
            regions: selectedRegions.map((region) => ({
              region,
              intensity: bodyMapSelections[region]?.intensity ?? (pain > 0 ? pain : 5),
              type: bodyMapSelections[region]?.type ?? "ache",
            })),
          }
        : undefined,
      notes: notes.trim() ? notes.trim() : undefined,
    };

    setNotice(null);
    setIsSubmitting(true);

    try {
      const response = await createCheckin(auth.token, payload);
      await checkinError.clear();
      await checkinsRefresh.refreshLocal();

      if (response.risk?.level === "high") {
        const reasonCodes = response.risk.reasonCodes ?? [];
        const params: Record<string, string> = {};
        if (response.alertId) {
          params.alertId = response.alertId;
        }
        if (reasonCodes.length > 0) {
          params.reasonCodes = reasonCodes.join(",");
        }

        router.push({
          pathname: "/safety",
          params,
        });
        resetForm();
        return;
      }

      setNotice({
        variant: "success",
        title: "Saved",
        message: "Saved. Thank you for checking in.",
      });
      resetForm();
    } catch (error) {
      const normalized = toCheckinError(error);
      await checkinError.setLocalError({
        title: normalized.title ?? "Couldn’t submit",
        message: normalized.message,
        kind: normalized.kind,
        retryable: normalized.retryable,
        detail: normalized.detail,
      });
      setNotice({
        variant: "error",
        title: normalized.title ?? "Couldn’t submit",
        message: normalized.message,
        retryable: normalized.retryable,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen title="Daily check-in">
      <View style={styles.container}>
        {isOffline ? (
          <InlineNotice
            variant="warning"
            title="Offline"
            message="You’re offline. Nothing was sent."
          />
        ) : null}

        <LastRefreshed label="Last refreshed (check-ins)" value={checkinsRefresh.label} />
        <LastFailedAttempt
          value={checkinError.label}
          title={checkinError.lastError?.title}
          message={checkinError.lastError?.message}
          onClear={checkinError.lastError ? checkinError.clear : undefined}
        />

        {validationMessage ? (
          <InlineNotice
            variant="warning"
            title="Check your entries"
            message={validationMessage}
          />
        ) : null}

        {notice ? (
          <InlineNotice
            variant={notice.variant === "success" ? "info" : notice.variant}
            title={notice.title}
            message={notice.message}
            actionLabel={notice.retryable && !isOffline ? "Try again" : undefined}
            onAction={
              notice.retryable && !isOffline
                ? () => {
                    void handleSubmit();
                  }
                : undefined
            }
          />
        ) : null}

        <Section title="Today">
          <View style={styles.readOnlyField}>
            <Text style={styles.fieldLabel}>Date</Text>
            <Text style={styles.readOnlyValue}>{date}</Text>
          </View>
        </Section>

        <Section title="Symptoms">
          <Stepper
            label="Pain"
            value={pain}
            min={0}
            max={10}
            step={1}
            valueFormatter={(value) => `${value}/10`}
            onChange={setPain}
          />

          <View style={styles.moodWrapper}>
            <Text style={styles.fieldLabel}>Mood</Text>
            <View style={styles.moodRow}>
              {[1, 2, 3, 4, 5].map((value) => {
                const selected = mood === value;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityLabel={`Set mood ${value}`}
                    onPress={() => setMood(value)}
                    style={({ pressed }) => [
                      styles.moodChip,
                      selected ? styles.moodChipSelected : null,
                      pressed ? styles.moodChipPressed : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.moodChipText,
                        selected ? styles.moodChipTextSelected : null,
                      ]}
                    >
                      {value}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Stepper
            label="Exercises adherence"
            value={exercisePercent}
            min={0}
            max={100}
            step={10}
            valueFormatter={(value) => `${value}%`}
            onChange={setExercisePercent}
          />

          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>Medication taken</Text>
            <Switch value={medication} onValueChange={setMedication} />
          </View>
        </Section>

        <Section title="Sleep (optional)">
          <OptionalStepper
            label="Hours slept"
            value={sleepHours}
            min={0}
            max={16}
            step={0.5}
            valueFormatter={(value) => `${value.toFixed(1)} hours`}
            onChange={setSleepHours}
            clearLabel="Clear hours"
          />

          <View style={styles.moodWrapper}>
            <View style={styles.inlineHeaderRow}>
              <Text style={styles.fieldLabel}>Sleep quality</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setSleepQuality(null)}
                style={({ pressed }) => [
                  styles.clearOptionalButton,
                  pressed ? styles.clearOptionalButtonPressed : null,
                ]}
              >
                <Text style={styles.clearOptionalButtonText}>Clear</Text>
              </Pressable>
            </View>
            <View style={styles.moodRow}>
              {[1, 2, 3, 4, 5].map((value) => {
                const selected = sleepQuality === value;
                return (
                  <Pressable
                    key={`sleep-quality-${value}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Set sleep quality ${value}`}
                    onPress={() => setSleepQuality(value)}
                    style={({ pressed }) => [
                      styles.moodChip,
                      selected ? styles.moodChipSelected : null,
                      pressed ? styles.moodChipPressed : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.moodChipText,
                        selected ? styles.moodChipTextSelected : null,
                      ]}
                    >
                      {value}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.helperText}>
              {sleepQuality === null
                ? "Not set"
                : `Selected quality: ${sleepQuality}/5`}
            </Text>
          </View>

          <OptionalStepper
            label="Night disturbances"
            value={sleepDisturbances}
            min={0}
            max={5}
            step={1}
            valueFormatter={(value) => `${value}`}
            onChange={setSleepDisturbances}
            clearLabel="Clear disturbances"
          />
        </Section>

        <Section title="Where is the pain? (optional)">
          <Text style={styles.helperText}>
            Select up to 6 areas and record intensity/type for each selected area.
          </Text>

          {BODY_MAP_REGION_GROUPS.map((group) => (
            <View key={group.title} style={styles.bodyMapGroup}>
              <Text style={styles.bodyMapGroupTitle}>{group.title}</Text>
              <View style={styles.bodyMapChipRow}>
                {group.regions.map((region) => {
                  const selected = selectedRegions.includes(region);
                  return (
                    <Pressable
                      key={region}
                      accessibilityRole="button"
                      accessibilityLabel={`Toggle ${regionLabel(region)}`}
                      onPress={() => {
                        setSelectedRegions((current) => {
                          if (current.includes(region)) {
                            setBodyMapSelections((previous) => {
                              const next = { ...previous };
                              delete next[region];
                              return next;
                            });
                            return current.filter((entry) => entry !== region);
                          }

                          if (current.length >= 6) {
                            setNotice({
                              variant: "warning",
                              title: "Body map limit",
                              message: "Select up to 6 regions.",
                            });
                            return current;
                          }

                          setBodyMapSelections((previous) => ({
                            ...previous,
                            [region]: {
                              intensity: pain > 0 ? pain : 5,
                              type: "ache",
                            },
                          }));
                          return [...current, region];
                        });
                      }}
                      style={({ pressed }) => [
                        styles.bodyMapChip,
                        selected ? styles.bodyMapChipSelected : null,
                        pressed ? styles.bodyMapChipPressed : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.bodyMapChipText,
                          selected ? styles.bodyMapChipTextSelected : null,
                        ]}
                      >
                        {regionLabel(region)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}

          {selectedRegions.length > 0 ? (
            <View style={styles.bodyMapSelectionStack}>
              {selectedRegions.map((region) => {
                const selection = bodyMapSelections[region] ?? {
                  intensity: pain > 0 ? pain : 5,
                  type: "ache" as BodyMapPainType,
                };
                return (
                  <View key={`selection-${region}`} style={styles.bodyMapSelectionCard}>
                    <View style={styles.inlineHeaderRow}>
                      <Text style={styles.fieldLabel}>{regionLabel(region)}</Text>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          setSelectedRegions((current) =>
                            current.filter((entry) => entry !== region)
                          );
                          setBodyMapSelections((previous) => {
                            const next = { ...previous };
                            delete next[region];
                            return next;
                          });
                        }}
                        style={({ pressed }) => [
                          styles.clearOptionalButton,
                          pressed ? styles.clearOptionalButtonPressed : null,
                        ]}
                      >
                        <Text style={styles.clearOptionalButtonText}>Remove</Text>
                      </Pressable>
                    </View>

                    <Stepper
                      label={`${regionLabel(region)} intensity`}
                      value={selection.intensity}
                      min={0}
                      max={10}
                      step={1}
                      valueFormatter={(value) => `${value}/10`}
                      onChange={(nextValue) => {
                        setBodyMapSelections((current) => ({
                          ...current,
                          [region]: {
                            intensity: nextValue,
                            type: current[region]?.type ?? "ache",
                          },
                        }));
                      }}
                    />

                    <View style={styles.moodWrapper}>
                      <Text style={styles.fieldLabel}>Type</Text>
                      <View style={styles.moodRow}>
                        {BODY_MAP_PAIN_TYPES.map((type) => {
                          const selected = selection.type === type;
                          return (
                            <Pressable
                              key={`${region}-${type}`}
                              accessibilityRole="button"
                              accessibilityLabel={`Set ${regionLabel(
                                region
                              )} type ${painTypeLabel(type)}`}
                              onPress={() => {
                                setBodyMapSelections((current) => ({
                                  ...current,
                                  [region]: {
                                    intensity: current[region]?.intensity ?? (pain > 0 ? pain : 5),
                                    type,
                                  },
                                }));
                              }}
                              style={({ pressed }) => [
                                styles.moodChip,
                                selected ? styles.moodChipSelected : null,
                                pressed ? styles.moodChipPressed : null,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.moodChipText,
                                  selected ? styles.moodChipTextSelected : null,
                                ]}
                              >
                                {painTypeLabel(type)}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.helperText}>No pain areas selected.</Text>
          )}
        </Section>

        <Section title="Notes (optional)">
          <TextInput
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            maxLength={500}
            placeholder="How are you feeling today?"
            style={styles.notesInput}
            textAlignVertical="top"
          />
          <Text style={styles.helperText}>
            Tip: Avoid names or personal details.
          </Text>
        </Section>

        {__DEV__ ? (
          <Section title="Developer helpers">
            <PrimaryButton
              label="Fill low-risk example"
              onPress={() => {
                setPain(2);
                setMood(4);
                setExercisePercent(80);
                setMedication(true);
                setSleepHours(7.5);
                setSleepQuality(4);
                setSleepDisturbances(1);
                setSelectedRegions(["knee_left"]);
                setBodyMapSelections({
                  knee_left: { intensity: 3, type: "ache" },
                });
                setNotes("");
                setNotice(null);
              }}
            />
            <PrimaryButton
              label="Fill high-risk example"
              onPress={() => {
                setPain(9);
                setMood(2);
                setExercisePercent(20);
                setMedication(false);
                setSleepHours(5.5);
                setSleepQuality(2);
                setSleepDisturbances(3);
                setSelectedRegions(["lower_back", "knee_left"]);
                setBodyMapSelections({
                  lower_back: { intensity: 8, type: "stiffness" },
                  knee_left: { intensity: 7, type: "sharp" },
                });
                setNotes("");
                setNotice(null);
              }}
            />
          </Section>
        ) : null}

        <PrimaryButton
          label={isSubmitting ? "Submitting…" : "Submit check-in"}
          disabled={Boolean(validationMessage) || isOffline || isSubmitting}
          onPress={() => {
            void handleSubmit();
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    gap: 8,
  },
  readOnlyField: {
    gap: 6,
  },
  readOnlyValue: {
    fontSize: 16,
    fontWeight: "500",
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  helperText: {
    fontSize: 12,
    color: "#4b5563",
  },
  stepperWrapper: {
    gap: 8,
    marginBottom: 8,
  },
  optionalStepperWrapper: {
    gap: 4,
    marginBottom: 8,
  },
  optionalStepperFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  optionalValueHint: {
    fontSize: 12,
    color: "#6b7280",
  },
  clearOptionalButton: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  clearOptionalButtonPressed: {
    opacity: 0.75,
  },
  clearOptionalButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  inlineHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stepperButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperButtonPressed: {
    opacity: 0.75,
  },
  stepperButtonText: {
    fontSize: 24,
    lineHeight: 24,
    color: "#111827",
  },
  stepperValue: {
    minWidth: 76,
    fontSize: 18,
    fontWeight: "600",
    textAlign: "center",
  },
  moodWrapper: {
    gap: 8,
    marginBottom: 8,
  },
  bodyMapGroup: {
    gap: 8,
    marginBottom: 8,
  },
  bodyMapGroupTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4b5563",
  },
  bodyMapChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  bodyMapChip: {
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    backgroundColor: "#fff",
  },
  bodyMapChipSelected: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  bodyMapChipPressed: {
    opacity: 0.8,
  },
  bodyMapChipText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#111827",
  },
  bodyMapChipTextSelected: {
    color: "#fff",
  },
  bodyMapSelectionStack: {
    gap: 10,
    marginTop: 8,
  },
  bodyMapSelectionCard: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 10,
    gap: 6,
    backgroundColor: "#f9fafb",
  },
  moodRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  moodChip: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  moodChipSelected: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  moodChipPressed: {
    opacity: 0.8,
  },
  moodChipText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  moodChipTextSelected: {
    color: "#ffffff",
  },
  switchRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  notesInput: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
});
