import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
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

import { isApiError } from "@/src/api/client";
import {
  createCheckin,
  type CheckInCreatePayload,
} from "@/src/api/patient";
import { Banner, type BannerVariant } from "@/src/components/Banner";
import { Avatar } from "@/src/components/Avatar";
import { Card } from "@/src/components/Card";
import { EmptyState } from "@/src/components/EmptyState";
import { GlassPanel } from "@/src/components/GlassPanel";
import { HeroHeader } from "@/src/components/HeroHeader";
import { DomainIcon, type DomainIconKey } from "@/src/components/IconSet";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { FadeSlideIn } from "@/src/components/Motion";
import { MediaCard } from "@/src/components/MediaCard";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Row } from "@/src/components/Row";
import { Screen } from "@/src/components/Screen";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { SkeletonBlock } from "@/src/components/Skeleton";
import { StatusPill } from "@/src/components/StatusPill";
import { TrackerTile } from "@/src/components/TrackerTile";
import { TrustBanner } from "@/src/components/TrustBanner";
import { TrustCues } from "@/src/components/TrustCues";
import { useAuth } from "@/src/state/auth";
import { type LastErrorRecord, useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { useLastRefreshed } from "@/src/state/refresh";
import { useTrustStatus } from "@/src/state/trustStatus";
import { runLayoutAnimationIfAllowed } from "@/src/theme/motion";
import { useTokens } from "@/src/theme/tokens";
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
import { useReducedMotion } from "@/src/hooks/useReducedMotion";

// Layout: Single Screen wrapper; avoid nested ScrollView.
const CHECKIN_STEPS: Array<{
  key: "symptoms" | "recovery" | "habits";
  label: string;
  description: string;
  icon: DomainIconKey;
}> = [
  { key: "symptoms", label: "Symptoms", description: "Pain, mood and notes", icon: "checkin" },
  {
    key: "recovery",
    label: "Recovery",
    description: "Exercises and medication",
    icon: "exercise",
  },
  {
    key: "habits",
    label: "Habits",
    description: "Daily routines and review",
    icon: "sleep",
  },
] as const;

const FOOTER_HEIGHT = 110;

type CheckinStep = (typeof CHECKIN_STEPS)[number];
type SubmitNotice = {
  variant: BannerVariant;
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

type CheckinDevParams = {
  devPreset?: string | string[];
  devToken?: string | string[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function extractPatientPhotoUri(patient: unknown): string | null {
  if (!patient || typeof patient !== "object") {
    return null;
  }

  const record = patient as Record<string, unknown>;
  const candidates = [
    record.photoUrl,
    record.avatarUrl,
    record.profilePhotoUrl,
    record.imageUrl,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
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
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
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
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
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
  const params = useLocalSearchParams<CheckinDevParams>();
  const auth = useAuth();
  const isOffline = useIsOffline();
  const reduceMotion = useReducedMotion();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const checkinsRefresh = useLastRefreshed("checkins");
  const checkinError = useLastError("checkinSubmit");
  const patientId = auth.patient?.id ?? "";
  const patientLabel = auth.patient?.displayName ?? auth.patient?.id ?? "Patient";
  const patientPhotoUri = useMemo(() => extractPatientPhotoUri(auth.patient), [auth.patient]);
  const trustStatus = useTrustStatus({
    patientId,
    errorRecords: [checkinError.lastError],
  });

  const [date] = useState(() => todayISO());
  const [activeStep, setActiveStep] = useState(0);
  const [addonsExpanded, setAddonsExpanded] = useState(false);

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

  const friendlyDate = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(new Date()),
    []
  );

  const devPreset = useMemo(() => {
    if (Array.isArray(params.devPreset)) {
      return params.devPreset[0] ?? "";
    }
    return params.devPreset ?? "";
  }, [params.devPreset]);

  const devToken = useMemo(() => {
    if (Array.isArray(params.devToken)) {
      return params.devToken[0] ?? "";
    }
    return params.devToken ?? "";
  }, [params.devToken]);

  useEffect(() => {
    if (!__DEV__ || auth.status !== "signedIn") {
      return;
    }

    if (devPreset === "low") {
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
      setNotice({
        variant: "success",
        title: "Preset applied",
        message: "Loaded low-risk example values.",
      });
      router.setParams({ devPreset: "", devToken: "" });
      return;
    }

    if (devPreset === "high") {
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
      setNotice({
        variant: "warning",
        title: "Preset applied",
        message: "Loaded high-risk example values.",
      });
      router.setParams({ devPreset: "", devToken: "" });
    }
  }, [auth.status, devPreset, devToken, router]);

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

  const stepMessage = useMemo(() => {
    if (activeStep === 0 && (mood === null || mood < 1 || mood > 5)) {
      return "Select your mood to continue.";
    }
    return null;
  }, [activeStep, mood]);

  const isSuccessState = notice?.variant === "success";
  const isLastStep = activeStep === CHECKIN_STEPS.length - 1;
  const avatarRing = trustStatus.kind === "ok" ? "ok" : "attention";

  const addonPreviewLabels = useMemo(() => {
    const tags: string[] = [];
    const hasSleep =
      sleepHours !== null || sleepQuality !== null || sleepDisturbances !== null;
    if (hasSleep) {
      tags.push("Sleep");
    }
    if (selectedRegions.length > 0) {
      tags.push("Body map");
    }
    if (notes.trim().length > 0) {
      tags.push("Notes");
    }
    if (medication) {
      tags.push("Meds");
    }
    return tags;
  }, [medication, notes, selectedRegions.length, sleepDisturbances, sleepHours, sleepQuality]);

  const primaryDisabled = useMemo(() => {
    if (isSubmitting) {
      return true;
    }

    if (!isLastStep) {
      return Boolean(stepMessage);
    }

    return Boolean(validationMessage) || isOffline;
  }, [isLastStep, isOffline, isSubmitting, stepMessage, validationMessage]);

  if (auth.status === "loading") {
    return (
      <Screen
        scroll={false}
        banner={<TrustBanner status={trustStatus} />}
      >
        <View style={styles.loadingContainer}>
          <View style={styles.loadingStack}>
            <SkeletonBlock height={28} width="45%" />
            <SkeletonBlock height={22} width="65%" />
            <SkeletonBlock height={94} />
            <SkeletonBlock height={150} />
            <SkeletonBlock height={150} />
          </View>
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
    setActiveStep(0);
    setAddonsExpanded(false);
  };

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    if (!auth.token) {
      setNotice({
        variant: "warning",
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
      setNotice(null);
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
        const routeParams: Record<string, string> = {};
        if (response.alertId) {
          routeParams.alertId = response.alertId;
        }
        if (reasonCodes.length > 0) {
          routeParams.reasonCodes = reasonCodes.join(",");
        }

        router.push({
          pathname: "/safety",
          params: routeParams,
        });
        resetForm();
        return;
      }

      setNotice({
        variant: "success",
        title: "Check-in complete",
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
        variant: "warning",
        title: normalized.title ?? "Couldn’t submit",
        message: normalized.message,
        retryable: normalized.retryable,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderSymptomsStep = () => (
    <View style={styles.stepContentStack}>
      <View style={styles.stepSummaryRow}>
        <View style={styles.stepSummaryCell}>
          <TrackerTile
            icon="checkin"
            label="Pain"
            value={`${pain}/10`}
            delta="Current"
            tone="warning"
            variant="compact"
            micro={{ type: "sparkline", values: [Math.max(0, pain - 1), pain], tone: "warning" }}
          />
        </View>
        <View style={styles.stepSummaryCell}>
          <TrackerTile
            icon="insights"
            label="Mood"
            value={mood === null ? "—" : `${mood}/5`}
            delta="Current"
            tone="success"
            variant="compact"
            micro={
              mood === null
                ? { type: "dots", values: [0, 0, 0] }
                : { type: "sparkline", values: [Math.max(1, mood - 1), mood], tone: "success" }
            }
          />
        </View>
      </View>

      <Card variant="outlined">
        <View style={styles.sectionStack}>
          <View style={styles.cardHeaderRow}>
            <DomainIcon icon="checkin" tone="warning" size={18} accessibilityLabel="Pain icon" />
            <View style={styles.cardHeaderCopy}>
              <Text style={styles.sectionTitle}>Pain</Text>
              <Text style={styles.helperText}>Rate your current pain level.</Text>
            </View>
          </View>
          <Stepper
            label="Pain"
            value={pain}
            min={0}
            max={10}
            step={1}
            valueFormatter={(value) => `${value}/10`}
            onChange={(value) => {
              setNotice(null);
              setPain(value);
            }}
          />
        </View>
      </Card>

      <Card variant="outlined">
        <View style={styles.sectionStack}>
          <View style={styles.cardHeaderRow}>
            <DomainIcon icon="insights" tone="success" size={18} accessibilityLabel="Mood icon" />
            <View style={styles.cardHeaderCopy}>
              <Text style={styles.sectionTitle}>Mood</Text>
              <Text style={styles.helperText}>Select how you feel right now.</Text>
            </View>
          </View>
          <View style={styles.chipRow}>
            {[1, 2, 3, 4, 5].map((value) => {
              const selected = mood === value;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityLabel={`Set mood ${value}`}
                  onPress={() => {
                    setNotice(null);
                    setMood(value);
                  }}
                  style={({ pressed }) => [
                    styles.choiceChip,
                    selected ? styles.choiceChipSelected : null,
                    pressed ? styles.choiceChipPressed : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.choiceChipText,
                      selected ? styles.choiceChipTextSelected : null,
                    ]}
                  >
                    {value}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Card>

      <Card variant="outlined">
        <View style={styles.sectionStack}>
          <View style={styles.cardHeaderRow}>
            <DomainIcon icon="chat" tone="accent" size={18} accessibilityLabel="Notes icon" />
            <View style={styles.cardHeaderCopy}>
              <Text style={styles.sectionTitle}>Notes (optional)</Text>
              <Text style={styles.helperText}>Keep this short and clinical.</Text>
            </View>
          </View>
          <TextInput
            value={notes}
            onChangeText={(value) => {
              setNotice(null);
              setNotes(value);
            }}
            multiline
            numberOfLines={4}
            maxLength={500}
            placeholder="How are you feeling today?"
            style={styles.notesInput}
            textAlignVertical="top"
          />
          <Text style={styles.helperText}>Tip: Avoid names or personal details.</Text>
        </View>
      </Card>
    </View>
  );

  const renderRecoveryStep = () => (
    <View style={styles.stepContentStack}>
      <View style={styles.stepSummaryRow}>
        <View style={styles.stepSummaryCell}>
          <TrackerTile
            icon="exercise"
            label="Adherence"
            value={`${exercisePercent}%`}
            delta="Exercises"
            tone="accent"
            variant="compact"
            micro={{
              type: "bars",
              values: [Math.max(0, exercisePercent - 20), exercisePercent],
            }}
          />
        </View>
        <View style={styles.stepSummaryCell}>
          <TrackerTile
            icon="meds"
            label="Medication"
            value={medication ? "Taken" : "Not taken"}
            delta="Today"
            tone="primary"
            variant="compact"
            micro={{ type: "ring", progress: medication ? 1 : 0 }}
          />
        </View>
      </View>

      <Card variant="outlined">
        <View style={styles.sectionStack}>
          <View style={styles.cardHeaderRow}>
            <DomainIcon icon="exercise" tone="accent" size={18} accessibilityLabel="Exercise icon" />
            <View style={styles.cardHeaderCopy}>
              <Text style={styles.sectionTitle}>Exercise adherence</Text>
              <Text style={styles.helperText}>How much of your plan did you complete?</Text>
            </View>
          </View>
          <Stepper
            label="Exercises adherence"
            value={exercisePercent}
            min={0}
            max={100}
            step={10}
            valueFormatter={(value) => `${value}%`}
            onChange={(value) => {
              setNotice(null);
              setExercisePercent(value);
            }}
          />
        </View>
      </Card>

      <Card variant="outlined">
        <View style={styles.sectionStack}>
          <View style={styles.cardHeaderRow}>
            <DomainIcon icon="meds" tone="primary" size={18} accessibilityLabel="Medication icon" />
            <View style={styles.cardHeaderCopy}>
              <Text style={styles.sectionTitle}>Medication taken</Text>
              <Text style={styles.helperText}>As prescribed by your clinician.</Text>
            </View>
          </View>
          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <Text style={styles.fieldLabel}>Taken today</Text>
              <Text style={styles.helperText}>Toggle if completed.</Text>
            </View>
            <Switch
              value={medication}
              onValueChange={(value) => {
                setNotice(null);
                setMedication(value);
              }}
            />
          </View>
        </View>
      </Card>

      <Card variant="outlined">
        <View style={styles.sectionStack}>
          <View style={styles.cardHeaderRow}>
            <DomainIcon icon="exercise" tone="muted" size={18} accessibilityLabel="Recovery feedback icon" />
            <View style={styles.cardHeaderCopy}>
              <Text style={styles.sectionTitle}>How did exercises feel?</Text>
              <Text style={styles.helperText}>Use notes or add-ons for extra detail.</Text>
            </View>
          </View>
          <Banner
            variant="info"
            title="Recovery feedback"
            message="Use Notes in Symptoms or optional details below for extra context."
          />
        </View>
      </Card>
    </View>
  );

  const renderHabitsStep = () => (
    <View style={styles.stepContentStack}>
      <View style={styles.stepSummaryRow}>
        <View style={styles.stepSummaryCell}>
          <TrackerTile
            icon="sleep"
            label="Sleep"
            value={sleepHours === null ? "—" : `${sleepHours.toFixed(1)}h`}
            delta="Current"
            tone="accent"
            variant="compact"
            micro={
              sleepHours === null
                ? { type: "dots", values: [0, 0, 0] }
                : { type: "sparkline", values: [Math.max(0, sleepHours - 1), sleepHours], tone: "accent" }
            }
          />
        </View>
        <View style={styles.stepSummaryCell}>
          <TrackerTile
            icon="hydration"
            label="Habits"
            value={exercisePercent >= 70 ? "On track" : "Needs focus"}
            delta="Daily rhythm"
            tone={exercisePercent >= 70 ? "success" : "warning"}
            variant="compact"
            micro={{
              type: "bars",
              values: [40, 55, 60, Math.max(20, exercisePercent)],
            }}
          />
        </View>
      </View>

      <Card variant="outlined">
        <View style={styles.sectionStack}>
          <View style={styles.cardHeaderRow}>
            <DomainIcon icon="sleep" tone="accent" size={18} accessibilityLabel="Sleep icon" />
            <View style={styles.cardHeaderCopy}>
              <Text style={styles.sectionTitle}>Sleep summary</Text>
              <Text style={styles.helperText}>Capture quick sleep context.</Text>
            </View>
          </View>
          <View style={styles.habitRowWrap}>
            <StatusPill
              label={sleepHours === null ? "Sleep not set" : `Sleep ${sleepHours.toFixed(1)}h`}
              variant={sleepHours === null ? "neutral" : "info"}
            />
            <StatusPill
              label={exercisePercent >= 70 ? "Recovery on track" : "Recovery needs attention"}
              variant={exercisePercent >= 70 ? "success" : "warning"}
            />
          </View>
        </View>
      </Card>

      <Card variant="outlined">
        <View style={styles.sectionStack}>
          <View style={styles.cardHeaderRow}>
            <DomainIcon icon="hydration" tone="accent" size={18} accessibilityLabel="Hydration icon" />
            <View style={styles.cardHeaderCopy}>
              <Text style={styles.sectionTitle}>Hydration quick entry</Text>
              <Text style={styles.helperText}>Open daily hydration log.</Text>
            </View>
          </View>
          <Row
            title="Hydration details"
            subtitle="Open daily hydration log"
            onPress={() => router.push("/hydration")}
          />
        </View>
      </Card>

      <Card variant="outlined">
        <View style={styles.sectionStack}>
          <View style={styles.cardHeaderRow}>
            <DomainIcon icon="nutrition" tone="accent" size={18} accessibilityLabel="Nutrition icon" />
            <View style={styles.cardHeaderCopy}>
              <Text style={styles.sectionTitle}>Nutrition quick entry</Text>
              <Text style={styles.helperText}>Open nutrition and medication trackers.</Text>
            </View>
          </View>
          <Row
            title="Nutrition details"
            subtitle="Open nutrition tracker"
            onPress={() => router.push("/nutrition")}
          />
          <Row
            title="Medication details"
            subtitle="Open medications checklist"
            onPress={() => router.push("/medications")}
          />
        </View>
      </Card>
    </View>
  );

  const renderAddonsAccordion = () => {
    const preview = addonPreviewLabels.slice(0, 2);
    const previewOverflow = Math.max(0, addonPreviewLabels.length - preview.length);

    return (
      <Card variant="outlined">
        <View style={styles.sectionStack}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Toggle optional details"
            onPress={() => {
              // Accordion layout motion stays native-only and is skipped with reduced motion.
              runLayoutAnimationIfAllowed(reduceMotion);
              setAddonsExpanded((current) => !current);
            }}
            style={({ pressed }) => [
              styles.accordionHeader,
              pressed ? styles.accordionHeaderPressed : null,
            ]}
          >
            <View style={styles.accordionTitleWrap}>
              <View style={styles.accordionTitleRow}>
                <View accessible={false} importantForAccessibility="no">
                  <DomainIcon
                    icon="info"
                    tone="accent"
                    size={18}
                    accessibilityLabel="Optional details icon"
                  />
                </View>
                <Text style={styles.sectionTitle}>More details (optional)</Text>
              </View>
              <Text style={styles.helperText}>Sleep, body map and add-on logs</Text>
              {preview.length > 0 ? (
                <View style={styles.accordionPreviewRow}>
                  {preview.map((label) => (
                    <StatusPill key={label} label={label} variant="info" accessible={false} />
                  ))}
                  {previewOverflow > 0 ? (
                    <StatusPill
                      label={`+${previewOverflow}`}
                      variant="neutral"
                      accessible={false}
                    />
                  ) : null}
                </View>
              ) : null}
            </View>
            <Text style={styles.accordionGlyph}>{addonsExpanded ? "−" : "+"}</Text>
          </Pressable>

          <FadeSlideIn visible={addonsExpanded} reduceMotion={reduceMotion}>
            <View style={styles.addonsContent}>
              <View style={styles.addonPreviewStack}>
                <MediaCard
                  variant="compact"
                  leading={{ type: "icon", icon: "sleep", tone: "accent" }}
                  title="Sleep"
                  subtitle={
                    sleepHours === null ? "No details yet" : `${sleepHours.toFixed(1)}h recorded`
                  }
                  statusPill={{
                    text: sleepHours === null ? "None" : "Added",
                    tone: sleepHours === null ? "info" : "success",
                  }}
                  onPress={() => {
                    if (!addonsExpanded) {
                      runLayoutAnimationIfAllowed(reduceMotion);
                      setAddonsExpanded(true);
                    }
                  }}
                />
                <MediaCard
                  variant="compact"
                  leading={{ type: "icon", icon: "rehabJourney", tone: "accent" }}
                  title="Body map"
                  subtitle={
                    selectedRegions.length > 0
                      ? `${selectedRegions.length} region${selectedRegions.length === 1 ? "" : "s"} selected`
                      : "No pain areas selected"
                  }
                  statusPill={{
                    text: selectedRegions.length > 0 ? "Added" : "None",
                    tone: selectedRegions.length > 0 ? "success" : "info",
                  }}
                  onPress={() => {
                    if (!addonsExpanded) {
                      runLayoutAnimationIfAllowed(reduceMotion);
                      setAddonsExpanded(true);
                    }
                  }}
                />
                <MediaCard
                  variant="compact"
                  leading={{ type: "icon", icon: "photos", tone: "accent" }}
                  title="Photos and trackers"
                  subtitle="Hydration, nutrition, meds, and symptom photos."
                  chips={[
                    { text: "Hydration", tone: "muted" },
                    { text: "Photos", tone: "muted" },
                  ]}
                />
              </View>

            <Card variant="outlined" style={styles.addonCard}>
              <View style={styles.sectionStack}>
                <Text style={styles.fieldLabel}>Sleep details</Text>

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

                <View style={styles.fieldGroup}>
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
                  <View style={styles.chipRow}>
                    {[1, 2, 3, 4, 5].map((value) => {
                      const selected = sleepQuality === value;
                      return (
                        <Pressable
                          key={`sleep-quality-${value}`}
                          accessibilityRole="button"
                          accessibilityLabel={`Set sleep quality ${value}`}
                          onPress={() => setSleepQuality(value)}
                          style={({ pressed }) => [
                            styles.choiceChip,
                            selected ? styles.choiceChipSelected : null,
                            pressed ? styles.choiceChipPressed : null,
                          ]}
                        >
                          <Text
                            style={[
                              styles.choiceChipText,
                              selected ? styles.choiceChipTextSelected : null,
                            ]}
                          >
                            {value}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
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
              </View>
            </Card>

            <Card variant="outlined" style={styles.addonCard}>
              <View style={styles.sectionStack}>
                <Text style={styles.fieldLabel}>Body map pain localization</Text>
                <Text style={styles.helperText}>
                  Select up to 6 areas and record intensity/type.
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

                          <View style={styles.fieldGroup}>
                            <Text style={styles.fieldLabel}>Type</Text>
                            <View style={styles.chipRow}>
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
                                          intensity:
                                            current[region]?.intensity ??
                                            (pain > 0 ? pain : 5),
                                          type,
                                        },
                                      }));
                                    }}
                                    style={({ pressed }) => [
                                      styles.choiceChip,
                                      selected ? styles.choiceChipSelected : null,
                                      pressed ? styles.choiceChipPressed : null,
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.choiceChipText,
                                        selected ? styles.choiceChipTextSelected : null,
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
              </View>
            </Card>

            <Card variant="outlined" style={styles.addonCard}>
              <View style={styles.sectionStack}>
                <Text style={styles.fieldLabel}>Add-on trackers</Text>
                <Row
                  title="Hydration log"
                  subtitle="Open hydration tracker"
                  onPress={() => router.push("/hydration")}
                />
                <Row
                  title="Nutrition log"
                  subtitle="Open nutrition tracker"
                  onPress={() => router.push("/nutrition")}
                />
                <Row
                  title="Medications"
                  subtitle="Open medication checklist"
                  onPress={() => router.push("/medications")}
                />
                <Row
                  title="Symptom photos"
                  subtitle="Open symptom photo upload"
                  onPress={() => router.push("/symptom-photos")}
                />
              </View>
            </Card>
            </View>
          </FadeSlideIn>
        </View>
      </Card>
    );
  };

  const renderCurrentStep = () => {
    if (activeStep === 0) {
      return renderSymptomsStep();
    }

    if (activeStep === 1) {
      return renderRecoveryStep();
    }

    return renderHabitsStep();
  };

  return (
    <Screen
      scroll={false}
      banner={
        <TrustBanner
          status={trustStatus}
          onRetry={
            trustStatus.kind === "serverDown"
              ? () => {
                  void checkinError.reload();
                }
              : undefined
          }
        />
      }
    >
      <View style={styles.flex}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.container}
        >
          {/* Header area */}
          <HeroHeader
            variant="compact"
            title="Check-in"
            subtitle={friendlyDate}
            left={
              <Avatar
                size={40}
                name={patientLabel}
                photoUrl={patientPhotoUri ?? undefined}
                ring={avatarRing}
              />
            }
            rightActions={[
              {
                icon: "safety",
                onPress: () => {
                  router.push("/safety" as never);
                },
                accessibilityLabel: "Open Safety support",
                tone: "warning",
              },
              {
                icon: "progress",
                onPress: () => {
                  router.push("/(tabs)/progress" as never);
                },
                accessibilityLabel: "Open Progress",
                tone: "muted",
              },
            ]}
          >
            <TrustCues
              status={trustStatus}
              lastUpdatedLabel={checkinsRefresh.label}
              showLastUpdated
              showPending
              showSavedLocalHint
              style={styles.statusStrip}
            />
          </HeroHeader>

          <LastFailedAttempt
            value={checkinError.label}
            title={checkinError.lastError?.title}
            message={checkinError.lastError?.message}
            onClear={checkinError.lastError ? checkinError.clear : undefined}
            compact
          />

          {validationMessage ? (
            <Banner
              variant="warning"
              title="Check your entries"
              message={validationMessage}
            />
          ) : null}

          {notice && notice.variant !== "success" ? (
            <Banner
              variant={notice.variant}
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

          {isSuccessState ? (
            <Card>
              <View style={styles.sectionStack}>
                <EmptyState
                  variant="compact"
                  illustrationKey="checkinSuccess"
                  title="Check-in complete"
                  description="Thanks for sharing today’s update."
                  ctaLabel="Back to Home"
                  onCtaPress={() => {
                    setNotice(null);
                    router.replace("/(tabs)");
                  }}
                />
                <SecondaryButton
                  label="View progress"
                  onPress={() => {
                    setNotice(null);
                    router.push("/(tabs)/progress");
                  }}
                />
                <SecondaryButton
                  label="Start another check-in"
                  onPress={() => {
                    setNotice(null);
                    setActiveStep(0);
                  }}
                />
              </View>
            </Card>
          ) : (
            <>
              {/* Mini stepper / section navigation */}
              <Card>
                <View style={styles.sectionStack}>
                  <Text style={styles.sectionTitle}>Steps</Text>
                  <View style={styles.stepperChipRow}>
                    {CHECKIN_STEPS.map((step, index) => {
                      const selected = index === activeStep;
                      const completed = index < activeStep;
                      return (
                        <Pressable
                          key={step.key}
                          accessibilityRole="button"
                          accessibilityLabel={`Open step ${index + 1}: ${step.label}`}
                          onPress={() => {
                            setNotice(null);
                            setActiveStep(index);
                          }}
                          style={({ pressed }) => [
                            styles.stepChip,
                            selected ? styles.stepChipSelected : null,
                            completed ? styles.stepChipCompleted : null,
                            pressed ? styles.stepChipPressed : null,
                          ]}
                        >
                          <View style={styles.stepChipIconWrap}>
                            <View accessible={false} importantForAccessibility="no">
                              <DomainIcon
                                icon={step.icon}
                                tone={selected ? "accent" : completed ? "success" : "muted"}
                                size={17}
                                accessibilityLabel={`${step.label} step icon`}
                              />
                            </View>
                            {completed ? (
                              <View style={styles.completedDot}>
                                <Text style={styles.completedDotText}>✓</Text>
                              </View>
                            ) : null}
                          </View>
                          <View style={styles.stepChipCopy}>
                            <Text
                              style={[
                                styles.stepChipTitle,
                                selected ? styles.stepChipTitleSelected : null,
                              ]}
                            >
                              {step.label}
                            </Text>
                            <Text
                              style={[
                                styles.stepChipSubtitle,
                                selected ? styles.stepChipSubtitleSelected : null,
                              ]}
                            >
                              {step.description}
                            </Text>
                          </View>
                          {selected ? <View style={styles.stepChipUnderline} /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </Card>

              {/* Core cards for active step */}
              {renderCurrentStep()}

              {/* Optional details accordion */}
              {renderAddonsAccordion()}
            </>
          )}
        </ScrollView>

        {!isSuccessState ? (
          <View style={styles.footerWrap}>
            <GlassPanel
              fallbackVariant="elevated"
              fallbackOpacity={0.78}
              style={styles.footerPanel}
              accessibilityLabel="Check-in footer actions"
            >
              <View style={styles.footerInner}>
                {isOffline ? (
                  <Banner
                    variant="warning"
                    title="Connect to submit today’s check-in"
                    message="Connect to submit today’s check-in."
                  />
                ) : null}

              {stepMessage ? <Text style={styles.footerHint}>{stepMessage}</Text> : null}

              {isLastStep ? (
                <View style={styles.footerButtonRow}>
                  <View style={styles.footerButtonSlot}>
                    <SecondaryButton
                      label="Back"
                      disabled={isSubmitting}
                      onPress={() => {
                        setNotice(null);
                        setActiveStep((current) => Math.max(0, current - 1));
                      }}
                    />
                  </View>
                  <View style={styles.footerButtonSlot}>
                    <PrimaryButton
                      label={isSubmitting ? "Submitting…" : "Submit check-in"}
                      loading={isSubmitting}
                      disabled={primaryDisabled}
                      onPress={() => {
                        void handleSubmit();
                      }}
                    />
                  </View>
                </View>
              ) : activeStep > 0 ? (
                <View style={styles.footerButtonRow}>
                  <View style={styles.footerButtonSlot}>
                    <SecondaryButton
                      label="Back"
                      disabled={isSubmitting}
                      onPress={() => {
                        setNotice(null);
                        setActiveStep((current) => Math.max(0, current - 1));
                      }}
                    />
                  </View>
                  <View style={styles.footerButtonSlot}>
                    <PrimaryButton
                      label="Continue"
                      disabled={primaryDisabled}
                      onPress={() => {
                        setNotice(null);
                        setActiveStep((current) =>
                          Math.min(CHECKIN_STEPS.length - 1, current + 1)
                        );
                      }}
                    />
                  </View>
                </View>
              ) : (
                <PrimaryButton
                  label="Continue"
                  disabled={primaryDisabled}
                  onPress={() => {
                    setNotice(null);
                    setActiveStep((current) =>
                      Math.min(CHECKIN_STEPS.length - 1, current + 1)
                    );
                  }}
                />
              )}
              </View>
            </GlassPanel>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    flex: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      gap: tokens.spacing.lg,
    },
    loadingStack: {
      gap: tokens.spacing.md,
    },
    container: {
      gap: tokens.spacing.md,
      paddingBottom: FOOTER_HEIGHT + tokens.spacing.xxxl,
    },
    statusStrip: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
      marginTop: tokens.spacing.xs,
      marginBottom: 0,
    },
    stepContentStack: {
      gap: tokens.spacing.md,
    },
    stepSummaryRow: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
      flexWrap: "wrap",
    },
    stepSummaryCell: {
      flex: 1,
      minWidth: 0,
    },
    sectionStack: {
      gap: tokens.spacing.md,
    },
    cardHeaderRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: tokens.spacing.sm,
    },
    cardHeaderCopy: {
      flex: 1,
      gap: 2,
    },
    sectionTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    fieldGroup: {
      gap: tokens.spacing.sm,
    },
    fieldLabel: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    helperText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    choiceChip: {
      minWidth: 44,
      minHeight: 44,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: tokens.spacing.md,
      backgroundColor: tokens.colors.surface,
    },
    choiceChipSelected: {
      backgroundColor: tokens.colors.primary,
      borderColor: tokens.colors.primary,
    },
    choiceChipPressed: {
      opacity: 0.82,
    },
    choiceChipText: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    choiceChipTextSelected: {
      color: tokens.colors.primaryTextOn,
    },
    notesInput: {
      minHeight: 96,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.md,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      color: tokens.colors.text,
      backgroundColor: tokens.colors.surface,
    },
    switchRow: {
      minHeight: 56,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.md,
      paddingHorizontal: tokens.spacing.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
      backgroundColor: tokens.colors.surface,
    },
    switchCopy: {
      flex: 1,
      gap: 2,
      marginRight: tokens.spacing.sm,
    },
    habitRowWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    stepperChipRow: {
      gap: tokens.spacing.sm,
    },
    stepChip: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.md,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      backgroundColor: tokens.colors.surface,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: tokens.spacing.sm,
      minHeight: 44,
      position: "relative",
    },
    stepChipSelected: {
      borderColor: tokens.colors.accent,
      backgroundColor: tokens.colors.accentTextOn,
    },
    stepChipCompleted: {
      borderColor: tokens.colors.success,
    },
    stepChipPressed: {
      opacity: 0.86,
    },
    stepChipIconWrap: {
      width: 24,
      minHeight: 24,
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    },
    completedDot: {
      position: "absolute",
      right: -8,
      top: -5,
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: tokens.colors.success,
      alignItems: "center",
      justifyContent: "center",
    },
    completedDotText: {
      color: tokens.colors.successTextOn,
      fontSize: 9,
      lineHeight: 10,
      fontWeight: tokens.typography.weights.semibold,
    },
    stepChipCopy: {
      flex: 1,
      gap: 2,
      paddingRight: tokens.spacing.sm,
    },
    stepChipTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    stepChipTitleSelected: {
      color: tokens.colors.accent,
    },
    stepChipSubtitle: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    stepChipSubtitleSelected: {
      color: tokens.colors.text,
    },
    stepChipUnderline: {
      position: "absolute",
      left: tokens.spacing.md,
      right: tokens.spacing.md,
      bottom: 0,
      height: 2,
      borderRadius: 1,
      backgroundColor: tokens.colors.accent,
    },
    accordionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.md,
    },
    accordionHeaderPressed: {
      opacity: 0.86,
    },
    accordionTitleWrap: {
      flex: 1,
      gap: 2,
    },
    accordionTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.xs,
    },
    accordionPreviewRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
      marginTop: tokens.spacing.xs,
    },
    accordionGlyph: {
      color: tokens.colors.textMuted,
      fontSize: 24,
      lineHeight: 24,
      fontWeight: tokens.typography.weights.semibold,
    },
    addonsContent: {
      gap: tokens.spacing.md,
    },
    addonPreviewStack: {
      gap: tokens.spacing.sm,
    },
    addonCard: {
      backgroundColor: tokens.colors.surface,
    },
    stepperWrapper: {
      gap: tokens.spacing.sm,
    },
    optionalStepperWrapper: {
      gap: tokens.spacing.xs,
    },
    optionalStepperFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: tokens.spacing.xs,
    },
    optionalValueHint: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    clearOptionalButton: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.sm,
      paddingHorizontal: tokens.spacing.sm + 2,
      paddingVertical: tokens.spacing.xs + 2,
      backgroundColor: tokens.colors.surface,
    },
    clearOptionalButtonPressed: {
      opacity: 0.75,
    },
    clearOptionalButtonText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    inlineHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    stepperRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.md,
    },
    stepperButton: {
      width: 44,
      height: 44,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.colors.surface,
    },
    stepperButtonPressed: {
      opacity: 0.8,
    },
    stepperButtonText: {
      color: tokens.colors.text,
      fontSize: 24,
      lineHeight: 24,
      fontWeight: tokens.typography.weights.semibold,
    },
    stepperValue: {
      minWidth: 88,
      textAlign: "center",
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    bodyMapGroup: {
      gap: tokens.spacing.sm,
    },
    bodyMapGroupTitle: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    bodyMapChipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    bodyMapChip: {
      minHeight: 36,
      borderRadius: tokens.radius.xl,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: tokens.spacing.md,
      backgroundColor: tokens.colors.surface,
    },
    bodyMapChipSelected: {
      backgroundColor: tokens.colors.accent,
      borderColor: tokens.colors.accent,
    },
    bodyMapChipPressed: {
      opacity: 0.82,
    },
    bodyMapChipText: {
      color: tokens.colors.text,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    bodyMapChipTextSelected: {
      color: tokens.colors.accentTextOn,
    },
    bodyMapSelectionStack: {
      gap: tokens.spacing.sm,
      marginTop: tokens.spacing.xs,
    },
    bodyMapSelectionCard: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.md,
      padding: tokens.spacing.md,
      gap: tokens.spacing.sm,
      backgroundColor: tokens.colors.surfaceElevated,
    },
    footerWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      paddingTop: tokens.spacing.sm,
      paddingBottom: tokens.spacing.sm,
    },
    footerPanel: {
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: tokens.colors.border,
    },
    footerInner: {
      gap: tokens.spacing.sm,
    },
    footerHint: {
      color: tokens.colors.warning,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    footerButtonRow: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
      alignItems: "center",
    },
    footerButtonSlot: {
      flex: 1,
    },
  });
}
