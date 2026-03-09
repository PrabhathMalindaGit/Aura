import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { isApiError } from "@/src/api/client";
import { createCheckin } from "@/src/api/patient";
import { Banner, type BannerVariant } from "@/src/components/Banner";
import { Avatar } from "@/src/components/Avatar";
import { Card } from "@/src/components/Card";
import { EmptyState } from "@/src/components/EmptyState";
import { GlassPanel } from "@/src/components/GlassPanel";
import { HeroHeader } from "@/src/components/HeroHeader";
import { DomainIcon, type DomainIconKey } from "@/src/components/IconSet";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { SegmentedControl } from "@/src/components/SegmentedControl";
import { SkeletonBlock } from "@/src/components/Skeleton";
import { StatusPill } from "@/src/components/StatusPill";
import { TrackerTile } from "@/src/components/TrackerTile";
import { TrustBanner } from "@/src/components/TrustBanner";
import { TrustCues } from "@/src/components/TrustCues";
import { BodyMapSelector } from "@/src/components/checkin/BodyMapSelector";
import { CheckinReviewCard } from "@/src/components/checkin/CheckinReviewCard";
import { CheckinSectionCard } from "@/src/components/checkin/CheckinSectionCard";
import { NeedHelpPrompt } from "@/src/components/checkin/NeedHelpPrompt";
import { SymptomChipGroup } from "@/src/components/checkin/SymptomChipGroup";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { useAuth } from "@/src/state/auth";
import { type LastErrorRecord, useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { useLastRefreshed } from "@/src/state/refresh";
import { useTrustStatus } from "@/src/state/trustStatus";
import { useTokens } from "@/src/theme/tokens";
import type {
  BodyMapSelection,
  CheckinAdherenceDraft,
  CheckinBodyMapDraft,
  CheckinDailySignalsDraft,
  CheckinMedicationStatus,
  CheckinRecoveryDraft,
  CheckinSupportDraft,
  CheckinSymptomFlag,
} from "@/src/types/checkin";
import {
  CHECKIN_SYMPTOM_FLAGS,
  CHECKIN_MEDICATION_STATUSES,
} from "@/src/types/checkin";
import {
  BODY_MAP_PAIN_TYPES,
  painTypeLabel,
  regionLabel,
  type BodyMapPainType,
  type BodyMapRegion,
} from "@/src/utils/bodyMapLabels";
import {
  buildCheckinPayload,
  buildReviewChips,
  FIVE_POINT_DIFFICULTY_LABELS,
  FIVE_POINT_RECOVERY_LABELS,
  FIVE_POINT_SUPPORT_LABELS,
  MEDICATION_REASON_OPTIONS,
  MEDICATION_STATUS_LABELS,
  medicationStatusLabel,
  scaleLabel,
  summarizePrimaryBodyMap,
  SYMPTOM_FLAG_LABELS,
  toggleSymptomFlag,
} from "@/src/utils/checkin";
import { todayISO } from "@/src/utils/date";
import { normalizeUnknownError } from "@/src/utils/errors";

const CHECKIN_STEPS: Array<{
  key: "symptoms" | "recovery" | "support" | "review";
  label: string;
  description: string;
  icon: DomainIconKey;
}> = [
  {
    key: "symptoms",
    label: "Symptoms",
    description: "Pain, symptoms and body areas",
    icon: "checkin",
  },
  {
    key: "recovery",
    label: "Recovery",
    description: "Exercises, strain and medication",
    icon: "exercise",
  },
  {
    key: "support",
    label: "Support",
    description: "Mood, habits, notes and help",
    icon: "coping",
  },
  {
    key: "review",
    label: "Review",
    description: "Confirm before you submit",
    icon: "success",
  },
] as const;

const FOOTER_HEIGHT = 118;
const BODY_MAP_LIMIT = 6;
type MedicationStatusOption = CheckinMedicationStatus | "skip";

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

type SubmitError = Omit<LastErrorRecord, "key" | "at" | "title"> & {
  title?: string;
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
      <Stepper {...props} value={effectiveValue} onChange={onChange} />
      <View style={styles.optionalStepperFooter}>
        <Text style={styles.optionalValueHint}>{value === null ? "Not set" : "Set"}</Text>
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

function toCheckinError(error: unknown): SubmitError {
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

function renderFivePointChips(params: {
  label: string;
  value: number | null;
  onChange: (nextValue: number) => void;
  onClear?: () => void;
  options: Record<number, string>;
  styles: ReturnType<typeof createStyles>;
}) {
  const { label, value, onChange, onClear, options, styles } = params;

  return (
    <View style={styles.fieldGroup}>
      <View style={styles.inlineHeaderRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {onClear ? (
          <Pressable
            accessibilityRole="button"
            onPress={onClear}
            style={({ pressed }) => [
              styles.clearOptionalButton,
              pressed ? styles.clearOptionalButtonPressed : null,
            ]}
          >
            <Text style={styles.clearOptionalButtonText}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.chipRow}>
        {[1, 2, 3, 4, 5].map((entry) => {
          const selected = value === entry;
          return (
            <Pressable
              key={`${label}-${entry}`}
              accessibilityRole="button"
              accessibilityLabel={`Set ${label} ${entry}`}
              accessibilityState={{ selected }}
              onPress={() => onChange(entry)}
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
                {entry}
              </Text>
              <Text
                style={[
                  styles.choiceChipCaption,
                  selected ? styles.choiceChipCaptionSelected : null,
                ]}
              >
                {options[entry]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function CheckinScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<CheckinDevParams>();
  const auth = useAuth();
  const isOffline = useIsOffline();
  useReducedMotion();
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
  const [pain, setPain] = useState(0);
  const [symptomFlags, setSymptomFlags] = useState<CheckinSymptomFlag[]>([]);
  const [recovery, setRecovery] = useState<CheckinRecoveryDraft>({
    exercisePercent: 0,
    difficultyLevel: null,
    confidenceLevel: null,
    mobilityLevel: null,
  });
  const [adherence, setAdherence] = useState<CheckinAdherenceDraft>({
    medicationStatus: null,
    medicationReason: null,
  });
  const [support, setSupport] = useState<CheckinSupportDraft>({
    mood: null,
    stressLevel: null,
    wantsExtraSupport: false,
    helpLevel: "none",
    safetyState: "safe",
  });
  const [dailySignals, setDailySignals] = useState<CheckinDailySignalsDraft>({
    sleepHours: null,
    sleepQuality: null,
    sleepDisturbances: null,
    hydrationLevel: null,
    energyLevel: null,
  });
  const [bodyMap, setBodyMap] = useState<CheckinBodyMapDraft>({
    selectedRegions: [],
    primaryRegion: null,
    selections: {},
  });
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
    [],
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

  const avatarRing = trustStatus.kind === "ok" ? "ok" : "attention";
  const isLastStep = activeStep === CHECKIN_STEPS.length - 1;
  const isSuccessState = notice?.variant === "success";

  const resetForm = () => {
    setPain(0);
    setSymptomFlags([]);
    setRecovery({
      exercisePercent: 0,
      difficultyLevel: null,
      confidenceLevel: null,
      mobilityLevel: null,
    });
    setAdherence({
      medicationStatus: null,
      medicationReason: null,
    });
    setSupport({
      mood: null,
      stressLevel: null,
      wantsExtraSupport: false,
      helpLevel: "none",
      safetyState: "safe",
    });
    setDailySignals({
      sleepHours: null,
      sleepQuality: null,
      sleepDisturbances: null,
      hydrationLevel: null,
      energyLevel: null,
    });
    setBodyMap({
      selectedRegions: [],
      primaryRegion: null,
      selections: {},
    });
    setNotes("");
    setActiveStep(0);
  };

  useEffect(() => {
    if (!__DEV__ || auth.status !== "signedIn") {
      return;
    }

    if (devPreset === "low") {
      setPain(2);
      setSymptomFlags(["stiffness"]);
      setRecovery({
        exercisePercent: 80,
        difficultyLevel: 2,
        confidenceLevel: 4,
        mobilityLevel: 4,
      });
      setAdherence({
        medicationStatus: "taken",
        medicationReason: null,
      });
      setSupport({
        mood: 4,
        stressLevel: 2,
        wantsExtraSupport: false,
        helpLevel: "none",
        safetyState: "safe",
      });
      setDailySignals({
        sleepHours: 7.5,
        sleepQuality: 4,
        sleepDisturbances: 1,
        hydrationLevel: 4,
        energyLevel: 4,
      });
      setBodyMap({
        selectedRegions: ["knee_left"],
        primaryRegion: "knee_left",
        selections: {
          knee_left: { intensity: 3, type: "ache" },
        },
      });
      setNotes("Knee felt tight after exercises but manageable.");
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
      setSymptomFlags(["stiffness", "fatigue", "mobility_difficulty"]);
      setRecovery({
        exercisePercent: 20,
        difficultyLevel: 5,
        confidenceLevel: 2,
        mobilityLevel: 2,
      });
      setAdherence({
        medicationStatus: "missed",
        medicationReason: "Side effects",
      });
      setSupport({
        mood: 2,
        stressLevel: 5,
        wantsExtraSupport: true,
        helpLevel: "urgent",
        safetyState: "unsafe",
      });
      setDailySignals({
        sleepHours: 5.5,
        sleepQuality: 2,
        sleepDisturbances: 3,
        hydrationLevel: 2,
        energyLevel: 2,
      });
      setBodyMap({
        selectedRegions: ["lower_back", "knee_left"],
        primaryRegion: "lower_back",
        selections: {
          lower_back: { intensity: 8, type: "stiffness" },
          knee_left: { intensity: 7, type: "sharp" },
        },
      });
      setNotes("Pain spiked after walking and I need help today.");
      setNotice({
        variant: "warning",
        title: "Preset applied",
        message: "Loaded high-risk example values.",
      });
      router.setParams({ devPreset: "", devToken: "" });
    }
  }, [auth.status, devPreset, devToken, router]);

  const validationMessage = useMemo(() => {
    if (support.mood === null || support.mood < 1 || support.mood > 5) {
      return "Select your mood from 1 to 5 before submitting.";
    }
    if (pain < 0 || pain > 10) {
      return "Pain must be between 0 and 10.";
    }
    if (recovery.exercisePercent < 0 || recovery.exercisePercent > 100) {
      return "Exercise completion must be between 0% and 100%.";
    }
    if (bodyMap.selectedRegions.length > BODY_MAP_LIMIT) {
      return `Select up to ${BODY_MAP_LIMIT} body areas.`;
    }
    return null;
  }, [bodyMap.selectedRegions.length, pain, recovery.exercisePercent, support.mood]);

  const stepMessage = useMemo(() => {
    if (activeStep >= 2 && (support.mood === null || support.mood < 1 || support.mood > 5)) {
      return "Select your mood to continue.";
    }
    return null;
  }, [activeStep, support.mood]);

  const primaryDisabled = useMemo(() => {
    if (isSubmitting) {
      return true;
    }

    if (!isLastStep) {
      return Boolean(stepMessage);
    }

    return Boolean(validationMessage) || isOffline;
  }, [isLastStep, isOffline, isSubmitting, stepMessage, validationMessage]);

  const reviewChips = useMemo(
    () =>
      buildReviewChips({
        pain,
        symptomFlags,
        bodyMap,
        recovery,
        adherence,
        support,
      }),
    [adherence, bodyMap, pain, recovery, support, symptomFlags],
  );

  const reviewSummary = useMemo(() => {
    const parts = [`Pain ${pain}/10 today.`];

    if (symptomFlags.length > 0) {
      parts.push(
        `Symptoms: ${symptomFlags.map((flag) => SYMPTOM_FLAG_LABELS[flag]).join(", ")}.`,
      );
    }

    parts.push(`${summarizePrimaryBodyMap(bodyMap)}.`);
    parts.push(`Exercises ${recovery.exercisePercent}% complete.`);

    if (adherence.medicationStatus) {
      parts.push(`Medication ${medicationStatusLabel(adherence.medicationStatus).toLowerCase()}.`);
    }

    if (support.helpLevel === "urgent") {
      parts.push("Urgent help requested.");
    } else if (support.helpLevel === "follow_up") {
      parts.push("Clinician follow-up requested.");
    } else if (support.wantsExtraSupport) {
      parts.push("Extra support requested.");
    }

    return parts.join(" ");
  }, [adherence.medicationStatus, bodyMap, pain, recovery.exercisePercent, support.helpLevel, support.wantsExtraSupport, symptomFlags]);

  const handleToggleRegion = (region: BodyMapRegion) => {
    setNotice(null);
    setBodyMap((current) => {
      if (current.selectedRegions.includes(region)) {
        const nextRegions = current.selectedRegions.filter((entry) => entry !== region);
        const nextSelections = { ...current.selections };
        delete nextSelections[region];
        return {
          selectedRegions: nextRegions,
          primaryRegion:
            current.primaryRegion === region ? nextRegions[0] ?? null : current.primaryRegion,
          selections: nextSelections,
        };
      }

      if (current.selectedRegions.length >= BODY_MAP_LIMIT) {
        setNotice({
          variant: "warning",
          title: "Body map limit",
          message: `Select up to ${BODY_MAP_LIMIT} body areas.`,
        });
        return current;
      }

      return {
        selectedRegions: [...current.selectedRegions, region],
        primaryRegion: current.primaryRegion ?? region,
        selections: {
          ...current.selections,
          [region]: current.selections[region] ?? {
            intensity: pain > 0 ? pain : 5,
            type: "ache",
          },
        },
      };
    });
  };

  const handleSetPrimaryRegion = (region: BodyMapRegion) => {
    setNotice(null);
    setBodyMap((current) => {
      if (!current.selectedRegions.includes(region)) {
        return current;
      }
      return {
        ...current,
        primaryRegion: region,
      };
    });
  };

  const updateBodyMapSelection = (
    region: BodyMapRegion,
    patch: Partial<BodyMapSelection>,
  ) => {
    setNotice(null);
    setBodyMap((current) => ({
      ...current,
      selections: {
        ...current.selections,
        [region]: {
          intensity: current.selections[region]?.intensity ?? (pain > 0 ? pain : 5),
          type: current.selections[region]?.type ?? "ache",
          ...patch,
        },
      },
    }));
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

    const payload = buildCheckinPayload({
      date,
      pain,
      symptomFlags,
      recovery,
      adherence,
      support,
      dailySignals,
      bodyMap,
      notes,
    });

    setNotice(null);
    setIsSubmitting(true);
    let response: Awaited<ReturnType<typeof createCheckin>> | null = null;

    try {
      response = await createCheckin(auth.token, payload);
    } catch (error) {
      if (isApiError(error) && error.status === 409) {
        await Promise.allSettled([checkinError.clear(), checkinsRefresh.refreshLocal()]);
        setNotice({
          variant: "info",
          title: "Already submitted",
          message: "Today’s check-in is already saved.",
          retryable: false,
        });
        return;
      }

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
      return;
    } finally {
      setIsSubmitting(false);
    }

    await Promise.allSettled([checkinError.clear(), checkinsRefresh.refreshLocal()]);

    if (!response) {
      return;
    }

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
            tone={pain >= 7 ? "warning" : "accent"}
            variant="compact"
            micro={{
              type: "sparkline",
              values: [Math.max(0, pain - 2), pain],
              tone: pain >= 7 ? "warning" : "accent",
            }}
          />
        </View>
        <View style={styles.stepSummaryCell}>
          <TrackerTile
            icon="rehabJourney"
            label="Body areas"
            value={bodyMap.selectedRegions.length === 0 ? "None" : `${bodyMap.selectedRegions.length}`}
            delta={bodyMap.primaryRegion ? regionLabel(bodyMap.primaryRegion) : "Select areas"}
            tone={bodyMap.selectedRegions.length > 0 ? "primary" : "muted"}
            variant="compact"
            micro={{
              type: "ring",
              progress: Math.min(1, bodyMap.selectedRegions.length / BODY_MAP_LIMIT),
            }}
          />
        </View>
      </View>

      <CheckinSectionCard
        title="Symptoms"
        description="Capture pain first, then add the other symptoms you noticed today."
        icon="checkin"
        tone="warning"
      >
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

        <SymptomChipGroup
          label="Other symptoms"
          options={CHECKIN_SYMPTOM_FLAGS.map((flag) => ({
            value: flag,
            label: SYMPTOM_FLAG_LABELS[flag],
          }))}
          selectedValues={symptomFlags}
          onToggle={(value) => {
            setNotice(null);
            setSymptomFlags((current) => toggleSymptomFlag(current, value));
          }}
        />
      </CheckinSectionCard>

      <CheckinSectionCard
        title="Body map"
        description="Mark where symptoms are showing up, then choose the area that feels most bothersome."
        icon="rehabJourney"
        tone="accent"
      >
        <BodyMapSelector
          value={bodyMap}
          onToggleRegion={handleToggleRegion}
          onSetPrimaryRegion={handleSetPrimaryRegion}
        />

        {bodyMap.selectedRegions.length > 0 ? (
          <View style={styles.selectionStack}>
            {bodyMap.selectedRegions.map((region) => {
              const selection = bodyMap.selections[region] ?? {
                intensity: pain > 0 ? pain : 5,
                type: "ache" as BodyMapPainType,
              };
              const isPrimary = bodyMap.primaryRegion === region;
              return (
                <Card key={`region-${region}`} variant="outlined" style={styles.subCard}>
                  <View style={styles.sectionStack}>
                    <View style={styles.inlineHeaderRow}>
                      <View style={styles.regionHeaderCopy}>
                        <Text style={styles.fieldLabel}>{regionLabel(region)}</Text>
                        <Text style={styles.helperText}>
                          {isPrimary ? "Primary body area" : "Secondary body area"}
                        </Text>
                      </View>
                      <View style={styles.regionHeaderActions}>
                        {isPrimary ? (
                          <StatusPill label="Primary" variant="warning" accessible={false} />
                        ) : null}
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${regionLabel(region)}`}
                          onPress={() => handleToggleRegion(region)}
                          style={({ pressed }) => [
                            styles.clearOptionalButton,
                            pressed ? styles.clearOptionalButtonPressed : null,
                          ]}
                        >
                          <Text style={styles.clearOptionalButtonText}>Remove</Text>
                        </Pressable>
                      </View>
                    </View>

                    <Stepper
                      label={`${regionLabel(region)} intensity`}
                      value={selection.intensity}
                      min={0}
                      max={10}
                      step={1}
                      valueFormatter={(value) => `${value}/10`}
                      onChange={(value) => updateBodyMapSelection(region, { intensity: value })}
                    />

                    <View style={styles.fieldGroup}>
                      <Text style={styles.fieldLabel}>Symptom type</Text>
                      <View style={styles.chipRow}>
                        {BODY_MAP_PAIN_TYPES.map((type) => {
                          const selected = selection.type === type;
                          return (
                            <Pressable
                              key={`${region}-${type}`}
                              accessibilityRole="button"
                              accessibilityLabel={`Set ${regionLabel(region)} type ${painTypeLabel(type)}`}
                              accessibilityState={{ selected }}
                              onPress={() => updateBodyMapSelection(region, { type })}
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
                </Card>
              );
            })}
          </View>
        ) : null}
      </CheckinSectionCard>
    </View>
  );

  const renderRecoveryStep = () => (
    <View style={styles.stepContentStack}>
      <View style={styles.stepSummaryRow}>
        <View style={styles.stepSummaryCell}>
          <TrackerTile
            icon="exercise"
            label="Exercises"
            value={`${recovery.exercisePercent}%`}
            delta="Completed"
            tone={recovery.exercisePercent >= 70 ? "success" : "warning"}
            variant="compact"
            micro={{
              type: "bars",
              values: [Math.max(0, recovery.exercisePercent - 20), recovery.exercisePercent],
            }}
          />
        </View>
        <View style={styles.stepSummaryCell}>
          <TrackerTile
            icon="meds"
            label="Medication"
            value={medicationStatusLabel(adherence.medicationStatus)}
            delta="Today"
            tone={
              adherence.medicationStatus === "taken"
                ? "success"
                : adherence.medicationStatus === "missed"
                  ? "warning"
                  : "muted"
            }
            variant="compact"
            micro={{
              type: "ring",
              progress: adherence.medicationStatus === "taken" ? 1 : adherence.medicationStatus ? 0.3 : 0,
            }}
          />
        </View>
      </View>

      <CheckinSectionCard
        title="Recovery / rehab progress"
        description="Keep this practical: how much of the plan you completed and how it felt."
        icon="exercise"
        tone="accent"
      >
        <Stepper
          label="Exercises completed"
          value={recovery.exercisePercent}
          min={0}
          max={100}
          step={10}
          valueFormatter={(value) => `${value}%`}
          onChange={(value) => {
            setNotice(null);
            setRecovery((current) => ({ ...current, exercisePercent: value }));
          }}
        />

        <OptionalStepper
          label="Rehab difficulty"
          value={recovery.difficultyLevel}
          min={1}
          max={5}
          step={1}
          valueFormatter={(value) => scaleLabel(value, FIVE_POINT_DIFFICULTY_LABELS)}
          onChange={(value) => {
            setNotice(null);
            setRecovery((current) => ({ ...current, difficultyLevel: value }));
          }}
          clearLabel="Clear difficulty"
        />

        <OptionalStepper
          label="Confidence in progress"
          value={recovery.confidenceLevel}
          min={1}
          max={5}
          step={1}
          valueFormatter={(value) => scaleLabel(value, FIVE_POINT_RECOVERY_LABELS)}
          onChange={(value) => {
            setNotice(null);
            setRecovery((current) => ({ ...current, confidenceLevel: value }));
          }}
          clearLabel="Clear confidence"
        />

        <OptionalStepper
          label="Movement / function"
          value={recovery.mobilityLevel}
          min={1}
          max={5}
          step={1}
          valueFormatter={(value) => scaleLabel(value, FIVE_POINT_RECOVERY_LABELS)}
          onChange={(value) => {
            setNotice(null);
            setRecovery((current) => ({ ...current, mobilityLevel: value }));
          }}
          clearLabel="Clear movement"
        />
      </CheckinSectionCard>

      <CheckinSectionCard
        title="Medication / adherence"
        description="Capture whether medication or the plan was missed, then add a lightweight reason only if helpful."
        icon="meds"
        tone="primary"
      >
        <SegmentedControl
          value={adherence.medicationStatus ?? "skip"}
          onChange={(value: MedicationStatusOption) => {
            setNotice(null);
            setAdherence((current) => ({
              ...current,
              medicationStatus: value === "skip" ? null : value,
              medicationReason:
                value === "taken" || value === "skip" ? null : current.medicationReason,
            }));
          }}
          options={[
            { value: "skip", label: "Skip" },
            ...CHECKIN_MEDICATION_STATUSES.map((status) => ({
              value: status,
              label: MEDICATION_STATUS_LABELS[status],
            })),
          ]}
          allowWrap
          tone="primary"
          accessibilityLabel="Medication status"
        />

        {adherence.medicationStatus && adherence.medicationStatus !== "taken" ? (
          <View style={styles.fieldGroup}>
            <View style={styles.inlineHeaderRow}>
              <Text style={styles.fieldLabel}>Why was it missed or not needed?</Text>
              {adherence.medicationReason ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setNotice(null);
                    setAdherence((current) => ({ ...current, medicationReason: null }));
                  }}
                  style={({ pressed }) => [
                    styles.clearOptionalButton,
                    pressed ? styles.clearOptionalButtonPressed : null,
                  ]}
                >
                  <Text style={styles.clearOptionalButtonText}>Clear</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.chipRow}>
              {MEDICATION_REASON_OPTIONS.map((option) => {
                const selected = adherence.medicationReason === option;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    accessibilityLabel={`Set medication reason ${option}`}
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setNotice(null);
                      setAdherence((current) => ({ ...current, medicationReason: option }));
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
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
      </CheckinSectionCard>
    </View>
  );

  const renderSupportStep = () => (
    <View style={styles.stepContentStack}>
      <View style={styles.stepSummaryRow}>
        <View style={styles.stepSummaryCell}>
          <TrackerTile
            icon="insights"
            label="Mood"
            value={support.mood === null ? "—" : `${support.mood}/5`}
            delta="Today"
            tone={support.mood !== null && support.mood <= 2 ? "warning" : "success"}
            variant="compact"
            micro={
              support.mood === null
                ? { type: "dots", values: [0, 0, 0] }
                : {
                    type: "sparkline",
                    values: [Math.max(1, support.mood - 1), support.mood],
                    tone: support.mood <= 2 ? "warning" : "success",
                  }
            }
          />
        </View>
        <View style={styles.stepSummaryCell}>
          <TrackerTile
            icon="sleep"
            label="Sleep"
            value={
              dailySignals.sleepHours === null ? "Not set" : `${dailySignals.sleepHours.toFixed(1)}h`
            }
            delta="Overnight"
            tone={dailySignals.sleepHours !== null && dailySignals.sleepHours < 6 ? "warning" : "accent"}
            variant="compact"
            micro={
              dailySignals.sleepHours === null
                ? { type: "dots", values: [0, 0, 0] }
                : {
                    type: "sparkline",
                    values: [Math.max(0, dailySignals.sleepHours - 1), dailySignals.sleepHours],
                    tone: dailySignals.sleepHours < 6 ? "warning" : "accent",
                  }
            }
          />
        </View>
      </View>

      <CheckinSectionCard
        title="Mood and support"
        description="Share how you feel today and whether things feel manageable."
        icon="coping"
        tone="accent"
      >
        {renderFivePointChips({
          label: "Mood",
          value: support.mood,
          onChange: (value) => {
            setNotice(null);
            setSupport((current) => ({ ...current, mood: value }));
          },
          options: FIVE_POINT_RECOVERY_LABELS,
          styles,
        })}

        <OptionalStepper
          label="Stress or overwhelm"
          value={support.stressLevel}
          min={1}
          max={5}
          step={1}
          valueFormatter={(value) => scaleLabel(value, FIVE_POINT_SUPPORT_LABELS)}
          onChange={(value) => {
            setNotice(null);
            setSupport((current) => ({ ...current, stressLevel: value }));
          }}
          clearLabel="Clear stress"
        />
      </CheckinSectionCard>

      <CheckinSectionCard
        title="Sleep / hydration / daily support"
        description="Add the small daily signals that help your clinician understand recovery context."
        icon="sleep"
        tone="accent"
      >
        <OptionalStepper
          label="Hours slept"
          value={dailySignals.sleepHours}
          min={0}
          max={16}
          step={0.5}
          valueFormatter={(value) => `${value.toFixed(1)} hours`}
          onChange={(value) => {
            setNotice(null);
            setDailySignals((current) => ({ ...current, sleepHours: value }));
          }}
          clearLabel="Clear hours"
        />

        <OptionalStepper
          label="Sleep quality"
          value={dailySignals.sleepQuality}
          min={1}
          max={5}
          step={1}
          valueFormatter={(value) => scaleLabel(value, FIVE_POINT_RECOVERY_LABELS)}
          onChange={(value) => {
            setNotice(null);
            setDailySignals((current) => ({ ...current, sleepQuality: value }));
          }}
          clearLabel="Clear quality"
        />

        <OptionalStepper
          label="Night disturbances"
          value={dailySignals.sleepDisturbances}
          min={0}
          max={5}
          step={1}
          valueFormatter={(value) => `${value}`}
          onChange={(value) => {
            setNotice(null);
            setDailySignals((current) => ({ ...current, sleepDisturbances: value }));
          }}
          clearLabel="Clear disturbances"
        />

        <OptionalStepper
          label="Hydration"
          value={dailySignals.hydrationLevel}
          min={1}
          max={5}
          step={1}
          valueFormatter={(value) => scaleLabel(value, FIVE_POINT_SUPPORT_LABELS)}
          onChange={(value) => {
            setNotice(null);
            setDailySignals((current) => ({ ...current, hydrationLevel: value }));
          }}
          clearLabel="Clear hydration"
        />

        <OptionalStepper
          label="Energy / readiness"
          value={dailySignals.energyLevel}
          min={1}
          max={5}
          step={1}
          valueFormatter={(value) => scaleLabel(value, FIVE_POINT_SUPPORT_LABELS)}
          onChange={(value) => {
            setNotice(null);
            setDailySignals((current) => ({ ...current, energyLevel: value }));
          }}
          clearLabel="Clear energy"
        />
      </CheckinSectionCard>

      <CheckinSectionCard
        title="Notes / extra concerns"
        description="Free text still matters. Add anything you want your clinician to review today."
        icon="chat"
        tone="accent"
      >
        <TextInput
          value={notes}
          onChangeText={(value) => {
            setNotice(null);
            setNotes(value);
          }}
          multiline
          numberOfLines={5}
          maxLength={1200}
          placeholder="Anything else your care team should know today?"
          style={styles.notesInput}
          textAlignVertical="top"
          accessibilityLabel="Extra concerns or notes"
        />
        <Text style={styles.helperText}>
          Notes can still help your care team spot issues that need follow-up.
        </Text>
      </CheckinSectionCard>

      <CheckinSectionCard
        title="Need help?"
        description="Use this final prompt to clearly tell us whether you need support or urgent help today."
        icon="safety"
        tone="warning"
      >
        <NeedHelpPrompt
          helpLevel={support.helpLevel}
          safetyState={support.safetyState}
          wantsExtraSupport={support.wantsExtraSupport}
          onHelpLevelChange={(value) => {
            setNotice(null);
            setSupport((current) => ({ ...current, helpLevel: value }));
          }}
          onSafetyStateChange={(value) => {
            setNotice(null);
            setSupport((current) => ({ ...current, safetyState: value }));
          }}
          onToggleExtraSupport={(value) => {
            setNotice(null);
            setSupport((current) => ({ ...current, wantsExtraSupport: value }));
          }}
        />
      </CheckinSectionCard>
    </View>
  );

  const renderReviewStep = () => (
    <View style={styles.stepContentStack}>
      <View style={styles.stepSummaryRow}>
        <View style={styles.stepSummaryCell}>
          <TrackerTile
            icon="warning"
            label="Support"
            value={support.helpLevel === "urgent" ? "Urgent" : support.helpLevel === "follow_up" ? "Follow-up" : "Stable"}
            delta={support.safetyState === "unsafe" ? "Unsafe" : support.safetyState === "unsure" ? "Not sure" : "Feels safe"}
            tone={
              support.helpLevel === "urgent" || support.safetyState === "unsafe"
                ? "warning"
                : support.helpLevel === "follow_up"
                  ? "accent"
                  : "success"
            }
            variant="compact"
            micro={{
              type: "ring",
              progress:
                support.helpLevel === "urgent" || support.safetyState === "unsafe"
                  ? 1
                  : support.helpLevel === "follow_up"
                    ? 0.6
                    : 0.25,
            }}
          />
        </View>
        <View style={styles.stepSummaryCell}>
          <TrackerTile
            icon="rehabJourney"
            label="Review"
            value={`${reviewChips.length} signals`}
            delta={bodyMap.selectedRegions.length > 0 ? "Body map added" : "No body map"}
            tone="accent"
            variant="compact"
            micro={{
              type: "bars",
              values: [reviewChips.length, Math.max(1, bodyMap.selectedRegions.length)],
            }}
          />
        </View>
      </View>

      {(support.helpLevel === "urgent" || support.safetyState === "unsafe") ? (
        <Banner
          variant="warning"
          title="This may trigger immediate follow-up"
          message="If you submit with urgent help requested or feeling unsafe, the existing safety routing will escalate the check-in for review."
        />
      ) : null}

      <CheckinSectionCard
        title="Review before submit"
        description="Make sure the key parts of today’s rehab check-in look right."
        icon="success"
        tone="success"
      >
        <CheckinReviewCard
          summary={reviewSummary}
          chips={reviewChips}
          notesPreview={notes.trim() ? notes.trim() : undefined}
        />
      </CheckinSectionCard>

      <CheckinSectionCard
        title="What will be sent"
        description="A structured rehab check-in with symptoms, body regions, recovery context, support signals and your note text."
        icon="info"
        tone="accent"
      >
        <View style={styles.reviewGrid}>
          <View style={styles.reviewGridItem}>
            <Text style={styles.reviewLabel}>Recovery</Text>
            <Text style={styles.reviewValue}>
              {`${recovery.exercisePercent}% complete · ${scaleLabel(
                recovery.confidenceLevel,
                FIVE_POINT_RECOVERY_LABELS,
              )} confidence`}
            </Text>
          </View>
          <View style={styles.reviewGridItem}>
            <Text style={styles.reviewLabel}>Medication</Text>
            <Text style={styles.reviewValue}>{medicationStatusLabel(adherence.medicationStatus)}</Text>
          </View>
          <View style={styles.reviewGridItem}>
            <Text style={styles.reviewLabel}>Support</Text>
            <Text style={styles.reviewValue}>
              {support.helpLevel === "urgent"
                ? "Urgent help requested"
                : support.helpLevel === "follow_up"
                  ? "Follow-up requested"
                  : support.wantsExtraSupport
                    ? "Extra support requested"
                    : "No extra support requested"}
            </Text>
          </View>
          <View style={styles.reviewGridItem}>
            <Text style={styles.reviewLabel}>Body map</Text>
            <Text style={styles.reviewValue}>{summarizePrimaryBodyMap(bodyMap)}</Text>
          </View>
        </View>
      </CheckinSectionCard>
    </View>
  );

  const renderCurrentStep = () => {
    if (activeStep === 0) {
      return renderSymptomsStep();
    }

    if (activeStep === 1) {
      return renderRecoveryStep();
    }

    if (activeStep === 2) {
      return renderSupportStep();
    }

    return renderReviewStep();
  };

  if (auth.status === "loading") {
    return (
      <Screen scroll={false} banner={<TrustBanner status={trustStatus} />}>
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
          <HeroHeader
            variant="compact"
            title="Check-in"
            subtitle="Structured rehab monitoring"
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
            <View style={styles.heroMetaRow}>
              <StatusPill label={friendlyDate} variant="info" accessible={false} />
              <StatusPill label="Safety routing on" variant="success" accessible={false} />
              <StatusPill label="Daily rehab check-in" variant="neutral" accessible={false} />
            </View>
            <TrustCues
              status={trustStatus}
              lastUpdatedLabel={checkinsRefresh.label}
              showLastUpdated
              showPending
              showSavedLocalHint
              style={styles.statusStrip}
            />
          </HeroHeader>

          {checkinError.lastError ? (
            <LastFailedAttempt
              value={checkinError.label}
              title={checkinError.lastError.title}
              message={checkinError.lastError.message}
              onClear={checkinError.clear}
              compact
            />
          ) : null}

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
                  description="Saved. Thank you for checking in."
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
              <Card>
                <View style={styles.sectionStack}>
                  <Text style={styles.sectionTitle}>Sections</Text>
                  <View style={styles.stepperChipRow}>
                    {CHECKIN_STEPS.map((step, index) => {
                      const selected = index === activeStep;
                      const completed = index < activeStep;
                      return (
                        <Pressable
                          key={step.key}
                          accessibilityRole="button"
                          accessibilityLabel={`Open section ${index + 1}: ${step.label}`}
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
                            <View accessible={false} importantForAccessibility="no-hide-descendants">
                              <DomainIcon
                                icon={step.icon}
                                tone={selected ? "accent" : completed ? "success" : "muted"}
                                size={17}
                                accessibilityLabel={`${step.label} section icon`}
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

              {renderCurrentStep()}
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
                    message="You can finish the check-in now, but submission needs a connection."
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
                            Math.min(CHECKIN_STEPS.length - 1, current + 1),
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
                        Math.min(CHECKIN_STEPS.length - 1, current + 1),
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
    heroMetaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
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
    sectionTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
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
      minWidth: 56,
      minHeight: 44,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      gap: 2,
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
      textAlign: "center",
    },
    choiceChipTextSelected: {
      color: tokens.colors.primaryTextOn,
    },
    choiceChipCaption: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      textAlign: "center",
    },
    choiceChipCaptionSelected: {
      color: tokens.colors.primaryTextOn,
    },
    notesInput: {
      minHeight: 120,
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
      minWidth: 96,
      textAlign: "center",
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    selectionStack: {
      gap: tokens.spacing.sm,
    },
    subCard: {
      backgroundColor: tokens.colors.surfaceElevated,
    },
    regionHeaderCopy: {
      flex: 1,
      gap: 2,
    },
    regionHeaderActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
    },
    reviewGrid: {
      gap: tokens.spacing.sm,
    },
    reviewGridItem: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.md,
      padding: tokens.spacing.md,
      backgroundColor: tokens.colors.surfaceElevated,
      gap: 2,
    },
    reviewLabel: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    reviewValue: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
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
