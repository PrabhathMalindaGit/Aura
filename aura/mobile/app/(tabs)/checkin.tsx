import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { DomainIconKey } from "@/src/components/IconSet";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { SegmentedControl } from "@/src/components/SegmentedControl";
import { SkeletonBlock } from "@/src/components/Skeleton";
import { StatusPill } from "@/src/components/StatusPill";
import { TrustBanner } from "@/src/components/TrustBanner";
import { TrustCues } from "@/src/components/TrustCues";
import { BodyMapSelector } from "@/src/components/checkin/BodyMapSelector";
import { CheckinConfirmationPanel } from "@/src/components/checkin/CheckinConfirmationPanel";
import { CheckinFieldBlock } from "@/src/components/checkin/CheckinFieldBlock";
import { CheckinFlowShell } from "@/src/components/checkin/CheckinFlowShell";
import { CheckinReviewCard } from "@/src/components/checkin/CheckinReviewCard";
import { CheckinSubmissionRecoveryCard } from "@/src/components/checkin/CheckinSubmissionRecoveryCard";
import { CheckinStepCard } from "@/src/components/checkin/CheckinStepCard";
import { NeedHelpPrompt } from "@/src/components/checkin/NeedHelpPrompt";
import { SymptomChipGroup } from "@/src/components/checkin/SymptomChipGroup";
import {
  type CheckinValidationField,
  getCheckinPrimaryActionLabel,
  resolveCheckinHelperNotice,
} from "@/src/components/checkin/checkinFlowState";
import { useDevRenderAudit } from "@/src/dev/renderAudit";
import { useAuth } from "@/src/state/auth";
import {
  clearCheckinDraft,
  getCheckinDraft,
  setCheckinDraft,
} from "@/src/state/checkinDraft";
import { type LastErrorRecord, useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { useLastRefreshed } from "@/src/state/refresh";
import { useTrustStatus } from "@/src/state/trustStatus";
import { useTokens } from "@/src/theme/tokens";
import type {
  BodyMapSelection,
  CheckinAdherenceDraft,
  CheckinBodyMapDraft,
  CheckinDraftRecord,
  CheckinDailySignalsDraft,
  CheckinMedicationStatus,
  CheckinRecoveryDraft,
  CheckinReviewChip,
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
  buildCheckinDraftRecord,
  buildCheckinPayload,
  buildReviewChips,
  FIVE_POINT_DIFFICULTY_LABELS,
  FIVE_POINT_RECOVERY_LABELS,
  FIVE_POINT_SUPPORT_LABELS,
  MEDICATION_REASON_OPTIONS,
  MEDICATION_STATUS_LABELS,
  hasMeaningfulCheckinDraft,
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

const BODY_MAP_LIMIT = 6;
const CHECKIN_AUTO_SAVE_DELAY_MS = 450;
const FIVE_POINT_CHOICES = [1, 2, 3, 4, 5] as const;
type MedicationStatusOption = CheckinMedicationStatus | "skip";
type CheckinValidation = {
  field: CheckinValidationField;
  stepIndex: number;
  message: string;
};

type SubmitNotice = {
  variant: BannerVariant;
  title: string;
  message: string;
  retryable?: boolean;
};

type SubmittedCheckinState = {
  submittedAtISO: string;
  summary: string;
  chips: CheckinReviewChip[];
  notesPreview?: string;
};

type StepperProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  valueFormatter?: (value: number) => string;
  leftHint?: string;
  rightHint?: string;
  helperText?: string;
  errorText?: string | null;
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
  leftHint,
  rightHint,
  helperText,
  errorText,
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
        <View style={styles.stepperValueWrap}>
          <Text style={styles.stepperValue}>{displayValue}</Text>
        </View>
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
      {leftHint || rightHint ? (
        <View style={styles.scaleHintsRow}>
          <Text style={styles.scaleHint}>{leftHint ?? ""}</Text>
          <Text style={styles.scaleHint}>{rightHint ?? ""}</Text>
        </View>
      ) : null}
      {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
      {errorText ? <Text style={styles.inlineErrorText}>{errorText}</Text> : null}
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
  helperText?: string;
  errorText?: string | null;
  options: Record<number, string>;
  styles: ReturnType<typeof createStyles>;
  fieldId?: CheckinValidationField;
  onMeasureField?: (fieldId: CheckinValidationField, y: number) => void;
}) {
  const {
    label,
    value,
    onChange,
    onClear,
    helperText,
    errorText,
    options,
    styles,
    fieldId,
    onMeasureField,
  } = params;

  return (
    <View
      style={styles.fieldGroup}
      onLayout={({ nativeEvent }) => {
        if (fieldId && onMeasureField) {
          onMeasureField(fieldId, nativeEvent.layout.y);
        }
      }}
    >
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
      {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
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
      {errorText ? <Text style={styles.inlineErrorText}>{errorText}</Text> : null}
    </View>
  );
}

function hasRecoveryDetail(
  recovery: CheckinRecoveryDraft,
  adherence: CheckinAdherenceDraft,
): boolean {
  return (
    recovery.confidenceLevel !== null ||
    recovery.mobilityLevel !== null ||
    adherence.medicationStatus !== null ||
    Boolean(adherence.medicationReason?.trim())
  );
}

function renderFixedFiveChoiceControl(params: {
  value: number | null;
  onChange: (nextValue: number) => void;
  options: Record<number, string>;
  helperText?: string;
  styles: ReturnType<typeof createStyles>;
}) {
  const { value, onChange, options, helperText, styles } = params;

  return (
    <View style={styles.fixedChoiceStack}>
      {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}
      <View style={styles.fixedChoiceRow}>
        {FIVE_POINT_CHOICES.map((entry) => {
          const selected = value === entry;
          return (
            <Pressable
              key={`fixed-choice-${entry}`}
              accessibilityRole="button"
              accessibilityLabel={`Set value ${entry}`}
              accessibilityState={{ selected }}
              onPress={() => onChange(entry)}
              style={({ pressed }) => [
                styles.fixedChoiceButton,
                selected ? styles.fixedChoiceButtonSelected : null,
                pressed ? styles.choiceChipPressed : null,
              ]}
            >
              <Text
                style={[
                  styles.fixedChoiceValue,
                  selected ? styles.fixedChoiceValueSelected : null,
                ]}
              >
                {entry}
              </Text>
              <Text
                numberOfLines={2}
                style={[
                  styles.fixedChoiceCaption,
                  selected ? styles.fixedChoiceCaptionSelected : null,
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
  useDevRenderAudit("CheckinScreen");
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
    includePendingSync: false,
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
  const [showRecoveryDetails, setShowRecoveryDetails] = useState(false);
  const [showDailyContext, setShowDailyContext] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<SubmitNotice | null>(null);
  const [submittedCheckin, setSubmittedCheckin] = useState<SubmittedCheckinState | null>(null);
  const [pendingValidationField, setPendingValidationField] =
    useState<CheckinValidationField | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const validationFieldOffsets = useRef<Partial<Record<CheckinValidationField, number>>>({});
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const currentStep = CHECKIN_STEPS[activeStep];

  const scrollToValidationField = useCallback(
    (field: CheckinValidationField): boolean => {
      const targetY = validationFieldOffsets.current[field];
      if (typeof targetY !== "number") {
        return false;
      }

      scrollViewRef.current?.scrollTo({
        y: Math.max(0, targetY - tokens.spacing.lg),
        animated: true,
      });
      return true;
    },
    [tokens.spacing.lg],
  );

  const registerValidationField = useCallback(
    (field: CheckinValidationField, y: number) => {
      validationFieldOffsets.current[field] = y;
      if (pendingValidationField === field && scrollToValidationField(field)) {
        setPendingValidationField(null);
      }
    },
    [pendingValidationField, scrollToValidationField],
  );

  useEffect(() => {
    if (!pendingValidationField) {
      return;
    }

    const timer = setTimeout(() => {
      if (scrollToValidationField(pendingValidationField)) {
        setPendingValidationField(null);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [activeStep, pendingValidationField, scrollToValidationField]);

  useEffect(() => {
    let active = true;

    if (auth.status !== "signedIn" || !patientId || !date) {
      setDraftHydrated(true);
      return () => {
        active = false;
      };
    }

    setDraftHydrated(false);
    void (async () => {
      const draftRecord = await getCheckinDraft(patientId, date);
      if (!active) {
        return;
      }

      if (draftRecord) {
        setPain(draftRecord.pain);
        setSymptomFlags(draftRecord.symptomFlags);
        setRecovery(draftRecord.recovery);
        setAdherence(draftRecord.adherence);
        setSupport(draftRecord.support);
        setDailySignals(draftRecord.dailySignals);
        setBodyMap(draftRecord.bodyMap);
        setNotes(draftRecord.notes);
        setShowRecoveryDetails(
          draftRecord.showRecoveryDetails ||
            hasRecoveryDetail(draftRecord.recovery, draftRecord.adherence),
        );
        setShowDailyContext(draftRecord.showDailyContext);
        setActiveStep(Math.max(0, Math.min(CHECKIN_STEPS.length - 1, draftRecord.activeStep)));
        setNotice({
          variant: "info",
          title: "Draft restored",
          message: "Your unfinished check-in from earlier today is ready to continue.",
        });
      }

      setDraftHydrated(true);
    })();

    return () => {
      active = false;
    };
  }, [auth.status, date, patientId]);

  const draftRecord = useMemo<CheckinDraftRecord | null>(() => {
    if (!patientId || !date) {
      return null;
    }

    return buildCheckinDraftRecord({
      patientId,
      date,
      activeStep,
      showRecoveryDetails,
      showDailyContext:
        showDailyContext ||
        dailySignals.sleepHours !== null ||
        dailySignals.sleepQuality !== null ||
        dailySignals.sleepDisturbances !== null ||
        dailySignals.hydrationLevel !== null ||
        dailySignals.energyLevel !== null,
      pain,
      symptomFlags,
      recovery,
      adherence,
      support,
      dailySignals,
      bodyMap,
      notes,
    });
  }, [
    activeStep,
    adherence,
    bodyMap,
    dailySignals,
    date,
    notes,
    pain,
    patientId,
    recovery,
    showRecoveryDetails,
    showDailyContext,
    support,
    symptomFlags,
  ]);

  useEffect(() => {
    if (!draftHydrated || auth.status !== "signedIn" || !patientId || !date || submittedCheckin) {
      return;
    }

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(() => {
      if (!draftRecord) {
        return;
      }

      if (
        !hasMeaningfulCheckinDraft({
          pain: draftRecord.pain,
          symptomFlags: draftRecord.symptomFlags,
          recovery: draftRecord.recovery,
          adherence: draftRecord.adherence,
          support: draftRecord.support,
          dailySignals: draftRecord.dailySignals,
          bodyMap: draftRecord.bodyMap,
          notes: draftRecord.notes,
        })
      ) {
        void clearCheckinDraft(patientId, date);
        return;
      }

      void setCheckinDraft(draftRecord);
    }, CHECKIN_AUTO_SAVE_DELAY_MS);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [auth.status, date, draftHydrated, draftRecord, patientId, submittedCheckin]);

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
    setShowRecoveryDetails(false);
    setShowDailyContext(false);
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
      setShowRecoveryDetails(true);
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
      setShowRecoveryDetails(true);
      setNotice({
        variant: "warning",
        title: "Preset applied",
        message: "Loaded high-risk example values.",
      });
      router.setParams({ devPreset: "", devToken: "" });
    }
  }, [auth.status, devPreset, devToken, router]);

  const validationState = useMemo<CheckinValidation | null>(() => {
    if (support.mood === null || support.mood < 1 || support.mood > 5) {
      return {
        field: "mood",
        stepIndex: 2,
        message: "Choose the number that best matches your mood today.",
      };
    }

    return null;
  }, [support.mood]);

  const validationMessage = validationState?.message ?? null;
  const helperNotice = useMemo(
    () => resolveCheckinHelperNotice(notice, validationMessage),
    [notice, validationMessage],
  );
  const shouldShowDailyContext =
    showDailyContext ||
    dailySignals.sleepHours !== null ||
    dailySignals.sleepQuality !== null ||
    dailySignals.sleepDisturbances !== null ||
    dailySignals.hydrationLevel !== null ||
    dailySignals.energyLevel !== null;

  const stepMessage = useMemo(() => {
    if (validationState && validationState.stepIndex === activeStep) {
      return validationState.message;
    }

    if (validationState && isLastStep) {
      return `Complete ${CHECKIN_STEPS[validationState.stepIndex]?.label ?? "the highlighted step"} before submitting.`;
    }

    return null;
  }, [activeStep, isLastStep, validationState]);

  const primaryDisabled = useMemo(() => {
    if (isSubmitting) {
      return true;
    }

    if (!isLastStep) {
      return Boolean(stepMessage);
    }

    return isOffline;
  }, [isLastStep, isOffline, isSubmitting, stepMessage]);

  const primaryLabel = useMemo(
    () => (isSubmitting ? "Submitting…" : getCheckinPrimaryActionLabel(activeStep)),
    [activeStep, isSubmitting],
  );

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

  const submissionRecovery = useMemo(() => {
    const lastError = checkinError.lastError;
    if (!lastError) {
      return null;
    }

    if (lastError.kind === "offline") {
      return {
        title: "Submission paused",
        message: "You’re offline, so this check-in has not been submitted yet.",
        detail: "Your answers are still on this screen. Reconnect when you’re ready, then submit again.",
        primaryActionLabel: undefined,
        secondaryActionLabel: "Continue editing",
        statusLabel: "Offline",
      };
    }

    if (lastError.kind === "network" || lastError.kind === "server") {
      return {
        title: "We couldn’t submit your check-in",
        message: "The service could not finish this submission right now.",
        detail: "Your answers are still on this screen. Try again when you’re ready.",
        primaryActionLabel: "Try again",
        secondaryActionLabel: "Continue editing",
        statusLabel: checkinError.label,
      };
    }

    return {
      title: "We couldn’t submit your check-in",
      message: lastError.message,
      detail: "Your answers are still on this screen. Review anything you want to change, then try again.",
      primaryActionLabel: lastError.retryable && !isOffline ? "Try again" : undefined,
      secondaryActionLabel: "Continue editing",
      statusLabel: checkinError.label,
    };
  }, [checkinError.label, checkinError.lastError, isOffline]);

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
      setSubmittedCheckin(null);
      setNotice({
        variant: "warning",
        title: "Session expired",
        message: "Please sign in again.",
      });
      router.replace("/(auth)/login");
      return;
    }

    if (validationState) {
      setSubmittedCheckin(null);
      setNotice(null);
      setActiveStep(validationState.stepIndex);
      setPendingValidationField(validationState.field);
      return;
    }

    if (isOffline) {
      setSubmittedCheckin(null);
      await checkinError.setLocalError({
        title: "Submission paused",
        message: "You’re offline, so this check-in has not been submitted yet.",
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
    setSubmittedCheckin(null);
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
      setNotice(null);
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
      setSubmittedCheckin(null);
      return;
    }

    const submittedAtISO = new Date().toISOString();
    await clearCheckinDraft(patientId, date);
    setSubmittedCheckin({
      submittedAtISO,
      summary: reviewSummary,
      chips: reviewChips,
      notesPreview: notes.trim() || undefined,
    });
    setNotice(null);
    resetForm();
  };

  const renderSymptomsStep = () => (
    <CheckinStepCard
      title="How your body feels today"
      description="Start with pain, then add any symptoms and body areas that need attention."
      icon="checkin"
      tone="warning"
    >
      <CheckinFieldBlock
        title="Pain level"
        description="Use the full range from no pain to worst pain today."
      >
        <Stepper
          label="Pain"
          value={pain}
          min={0}
          max={10}
          step={1}
          leftHint="No pain"
          rightHint="Worst pain"
          helperText="Current pain level"
          valueFormatter={(value) => `${value}/10`}
          onChange={(value) => {
            setNotice(null);
            setPain(value);
          }}
        />
      </CheckinFieldBlock>

      <CheckinFieldBlock
        title="Other symptoms"
        description="Choose any symptoms that stood out today."
      >
        <SymptomChipGroup
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
      </CheckinFieldBlock>

      <CheckinFieldBlock
        title="Body areas"
        description="Tap the body map to mark where symptoms feel most bothersome."
      >
        <BodyMapSelector
          value={bodyMap}
          onToggleRegion={handleToggleRegion}
          onSetPrimaryRegion={handleSetPrimaryRegion}
        />

        {bodyMap.selectedRegions.length > 0 ? (
          <View style={styles.regionDetailStack}>
            {bodyMap.selectedRegions.map((region) => {
              const selection = bodyMap.selections[region] ?? {
                intensity: pain > 0 ? pain : 5,
                type: "ache" as BodyMapPainType,
              };
              const isPrimary = bodyMap.primaryRegion === region;
              return (
                <Card
                  key={`region-${region}`}
                  variant="outlined"
                  padding={tokens.spacing.lg}
                  style={styles.regionDetailCard}
                >
                  <View style={styles.regionCardStack}>
                    <View style={styles.regionCardHeader}>
                      <View style={styles.regionHeaderCopy}>
                        <Text style={styles.fieldLabel}>{regionLabel(region)}</Text>
                        <Text style={styles.helperText}>
                          {isPrimary ? "Most bothersome area" : "Additional area"}
                        </Text>
                      </View>
                      <View style={styles.regionHeaderActions}>
                        {isPrimary ? (
                          <StatusPill label="Primary" variant="success" accessible={false} />
                        ) : (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Mark ${regionLabel(region)} as the primary area`}
                            onPress={() => handleSetPrimaryRegion(region)}
                            style={({ pressed }) => [
                              styles.inlineTextButton,
                              pressed ? styles.inlineTextButtonPressed : null,
                            ]}
                          >
                            <Text style={styles.inlineTextButtonText}>Make primary</Text>
                          </Pressable>
                        )}
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
                      label="Intensity"
                      value={selection.intensity}
                      min={0}
                      max={10}
                      step={1}
                      leftHint="Mild"
                      rightHint="Severe"
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
      </CheckinFieldBlock>
    </CheckinStepCard>
  );

  const renderRecoveryStep = () => (
    <CheckinStepCard
      compact
      title="How recovery is going"
      description="Keep this practical: what you completed and how the plan felt."
      icon="exercise"
      tone="primary"
    >
      <CheckinFieldBlock
        title="Exercise completion"
        description="Estimate how much of today’s plan you were able to do."
      >
        <Stepper
          label="Exercises completed"
          value={recovery.exercisePercent}
          min={0}
          max={100}
          step={10}
          leftHint="None"
          rightHint="All planned"
          helperText="Use 10% steps for a quick estimate."
          valueFormatter={(value) => `${value}%`}
          onChange={(value) => {
            setNotice(null);
            setRecovery((current) => ({ ...current, exercisePercent: value }));
          }}
        />
      </CheckinFieldBlock>

      <CheckinFieldBlock
        title="How rehab felt"
        description="Start with the main effort rating for today’s plan."
        compact
      >
        <View style={styles.metricStackCompact}>
          {renderFivePointChips({
            label: "Rehab difficulty",
            value: recovery.difficultyLevel,
            onChange: (value) => {
              setNotice(null);
              setRecovery((current) => ({ ...current, difficultyLevel: value }));
            },
            onClear: () => {
              setNotice(null);
              setRecovery((current) => ({ ...current, difficultyLevel: null }));
            },
            helperText: "1 is very easy and 5 is very hard.",
            options: FIVE_POINT_DIFFICULTY_LABELS,
            styles,
          })}
        </View>
      </CheckinFieldBlock>

      <Card
        variant="outlined"
        padding={tokens.spacing.md}
        style={styles.recoveryDisclosureCard}
      >
        <View style={styles.inlineHeaderRow}>
          <View style={styles.sectionStack}>
            <Text style={styles.fieldLabel}>Optional detail</Text>
            <Text style={styles.helperText}>
              Add confidence, mobility, or medication detail only when it helps explain today.
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              showRecoveryDetails ? "Hide optional recovery details" : "Show optional recovery details"
            }
            onPress={() => setShowRecoveryDetails((current) => !current)}
            style={({ pressed }) => [
              styles.inlineTextButton,
              pressed ? styles.inlineTextButtonPressed : null,
            ]}
          >
            <Text style={styles.inlineTextButtonText}>
              {showRecoveryDetails ? "Hide details" : "Add details"}
            </Text>
          </Pressable>
        </View>

        {showRecoveryDetails ? (
          <View style={styles.metricStackCompact}>
          {renderFivePointChips({
            label: "Confidence in progress",
            value: recovery.confidenceLevel,
            onChange: (value) => {
              setNotice(null);
              setRecovery((current) => ({ ...current, confidenceLevel: value }));
            },
            onClear: () => {
              setNotice(null);
              setRecovery((current) => ({ ...current, confidenceLevel: null }));
            },
            options: FIVE_POINT_RECOVERY_LABELS,
            styles,
          })}

          {renderFivePointChips({
            label: "Movement and function",
            value: recovery.mobilityLevel,
            onChange: (value) => {
              setNotice(null);
              setRecovery((current) => ({ ...current, mobilityLevel: value }));
            },
            onClear: () => {
              setNotice(null);
              setRecovery((current) => ({ ...current, mobilityLevel: null }));
            },
            options: FIVE_POINT_RECOVERY_LABELS,
            styles,
          })}
            <CheckinFieldBlock
              title="Medication"
              description="Record whether medication was taken today."
              compact
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
            </CheckinFieldBlock>
          </View>
        ) : null}
      </Card>
    </CheckinStepCard>
  );

  const renderSupportStep = () => (
    <CheckinStepCard
      title="Mood, context, and support"
      description="Share how you feel today and whether you need extra help."
      icon="coping"
      tone="success"
    >
      <CheckinFieldBlock
        title="Mood"
        description="Choose the number that best matches your mood today."
        errorText={
          activeStep === 2 && validationState?.field === "mood"
            ? validationState.message
            : null
        }
        fieldId="mood"
        onMeasureField={(fieldId, y) =>
          registerValidationField(fieldId as CheckinValidationField, y)
        }
      >
        {renderFixedFiveChoiceControl({
          value: support.mood,
          onChange: (value) => {
            setNotice(null);
            setSupport((current) => ({ ...current, mood: value }));
          },
          helperText: "1 is very low and 5 is very strong.",
          options: FIVE_POINT_RECOVERY_LABELS,
          styles,
        })}
      </CheckinFieldBlock>

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

      <CheckinFieldBlock
        title="Daily context"
        description="Add extra sleep, hydration, and energy detail when it helps explain your day."
        accessory={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={shouldShowDailyContext ? "Hide daily context details" : "Add daily context details"}
            onPress={() => setShowDailyContext((current) => !current)}
            style={({ pressed }) => [
              styles.inlineTextButton,
              pressed ? styles.inlineTextButtonPressed : null,
            ]}
          >
            <Text style={styles.inlineTextButtonText}>
              {shouldShowDailyContext ? "Hide details" : "Add details"}
            </Text>
          </Pressable>
        }
      >
        {shouldShowDailyContext ? (
          <View style={styles.metricStack}>
            <OptionalStepper
              label="Hours slept"
              value={dailySignals.sleepHours}
              min={0}
              max={16}
              step={0.5}
              leftHint="Very little"
              rightHint="A full night"
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
              label="Energy and readiness"
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
          </View>
        ) : (
          <Text style={styles.helperText}>
            These extra details are optional and can be added when they help tell the story of today.
          </Text>
        )}
      </CheckinFieldBlock>

      <CheckinFieldBlock
        title="Notes"
        description="Add anything you want your clinician to review today."
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
      </CheckinFieldBlock>

      <CheckinFieldBlock
        title="Support today"
        description="Use this final prompt to tell us whether you need support or urgent help."
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
      </CheckinFieldBlock>
    </CheckinStepCard>
  );

  const renderReviewStep = () => (
    <CheckinStepCard
      title="Final review"
      description="Take a final look before you submit."
      icon="success"
      tone="success"
    >
      {(support.helpLevel === "urgent" || support.safetyState === "unsafe") ? (
        <Banner
          variant="warning"
          title="Immediate follow-up may be triggered"
          message="Urgent help requests or feeling unsafe use the same safety routing already in place."
        />
      ) : null}

      <CheckinReviewCard
        summary={reviewSummary}
        chips={reviewChips}
        notesPreview={notes.trim() ? notes.trim() : undefined}
      />

      <View style={styles.reviewGrid}>
        <View style={styles.reviewGridItem}>
          <Text style={styles.reviewLabel}>Mood</Text>
          <Text style={styles.reviewValue}>{scaleLabel(support.mood, FIVE_POINT_RECOVERY_LABELS)}</Text>
        </View>
        <View style={styles.reviewGridItem}>
          <Text style={styles.reviewLabel}>Recovery</Text>
          <Text style={styles.reviewValue}>
            {`${recovery.exercisePercent}% complete · ${scaleLabel(
              recovery.difficultyLevel,
              FIVE_POINT_DIFFICULTY_LABELS,
            )} difficulty`}
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
    </CheckinStepCard>
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

  const shellHelperContent = (
    <>
      <TrustCues
        status={trustStatus}
        offlineMode="onlineOnly"
        lastUpdatedLabel={checkinsRefresh.label}
        lastUpdatedAt={checkinsRefresh.lastRefreshedAt}
        showLastUpdated
        showPending
        showSavedLocalHint
        style={styles.statusStrip}
      />

      {submissionRecovery ? (
        <CheckinSubmissionRecoveryCard
          testID="checkin-submission-recovery"
          title={submissionRecovery.title}
          message={submissionRecovery.message}
          detail={submissionRecovery.detail}
          primaryActionLabel={
            submissionRecovery.primaryActionLabel && !isOffline
              ? submissionRecovery.primaryActionLabel
              : undefined
          }
          onPrimaryAction={
            submissionRecovery.primaryActionLabel && !isOffline
              ? () => {
                  void handleSubmit();
                }
              : undefined
          }
          secondaryActionLabel={submissionRecovery.secondaryActionLabel}
          onSecondaryAction={() => {
            void checkinError.clear();
            setNotice(null);
          }}
          statusLabel={submissionRecovery.statusLabel}
        />
      ) : checkinError.lastError ? (
        <LastFailedAttempt
          value={checkinError.label}
          title={checkinError.lastError.title}
          message={checkinError.lastError.message}
          onClear={checkinError.clear}
          compact
        />
      ) : null}

      {helperNotice ? (
        <Banner
          variant={helperNotice.variant}
          title={helperNotice.title}
          message={helperNotice.message}
          actionLabel={helperNotice.retryable && !isOffline ? "Try again" : undefined}
          onAction={
            helperNotice.retryable && !isOffline
              ? () => {
                  void handleSubmit();
                }
              : undefined
          }
        />
      ) : null}
    </>
  );

  const footerContent = (
    <View style={styles.footerInner}>
      {isOffline ? (
        <Banner
          variant="warning"
          title="You can keep filling this out offline"
          message="Submit when your connection returns. Nothing is sent until you reconnect."
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
              label={primaryLabel}
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
              label={primaryLabel}
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
          label={primaryLabel}
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
  );

  if (auth.status === "loading") {
    return (
      <Screen
        scroll={false}
        auditLabel="CheckinScreen"
        banner={<TrustBanner status={trustStatus} offlineMode="onlineOnly" />}
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

  return (
    <Screen
      scroll={false}
      auditLabel="CheckinScreen"
      banner={
        <TrustBanner
          status={trustStatus}
          offlineMode="onlineOnly"
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
      {submittedCheckin ? (
        <CheckinConfirmationPanel
          testID="checkin-confirmation"
          submittedAtISO={submittedCheckin.submittedAtISO}
          summary={submittedCheckin.summary}
          chips={submittedCheckin.chips}
          notesPreview={submittedCheckin.notesPreview}
          onBackToToday={() => {
            setSubmittedCheckin(null);
            setNotice(null);
            router.replace("/(tabs)");
          }}
          onViewProgress={() => {
            setSubmittedCheckin(null);
            setNotice(null);
            router.push("/(tabs)/progress");
          }}
        />
      ) : (
        <CheckinFlowShell
          title="Daily check-in"
          subtitle={`Step ${activeStep + 1} of ${CHECKIN_STEPS.length}`}
          currentStepTitle={currentStep.label}
          currentStepDescription={currentStep.description}
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
              tone: "success",
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
          statusContent={
            <View style={styles.heroMetaRow}>
              <StatusPill label={friendlyDate} variant="info" accessible={false} />
              <StatusPill label="Safety routing on" variant="success" accessible={false} />
            </View>
          }
          helperContent={shellHelperContent}
          steps={CHECKIN_STEPS}
          activeStep={activeStep}
          onSelectStep={(index) => {
            setNotice(null);
            setActiveStep(index);
          }}
          footer={footerContent}
          footerSpacerHeight={160}
          scrollContentStyle={styles.container}
          scrollViewRef={scrollViewRef}
        >
          {renderCurrentStep()}
        </CheckinFlowShell>
      )}
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
      gap: tokens.spacing.lg,
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
    fixedChoiceStack: {
      gap: tokens.spacing.sm,
    },
    fixedChoiceRow: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: tokens.spacing.sm,
    },
    fixedChoiceButton: {
      flex: 1,
      minHeight: 86,
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: tokens.spacing.xs,
      paddingVertical: tokens.spacing.sm,
      gap: tokens.spacing.xs,
    },
    fixedChoiceButtonSelected: {
      borderColor: tokens.colors.primary,
      backgroundColor: tokens.colors.primarySoft,
    },
    fixedChoiceValue: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    fixedChoiceValueSelected: {
      color: tokens.colors.primary,
    },
    fixedChoiceCaption: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      textAlign: "center",
    },
    fixedChoiceCaptionSelected: {
      color: tokens.colors.primary,
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
      backgroundColor: tokens.colors.primarySoft,
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
      color: tokens.colors.primary,
    },
    choiceChipCaption: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      textAlign: "center",
    },
    choiceChipCaptionSelected: {
      color: tokens.colors.primary,
    },
    notesInput: {
      minHeight: 120,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.lg,
      paddingHorizontal: tokens.spacing.lg,
      paddingVertical: tokens.spacing.md,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      color: tokens.colors.text,
      backgroundColor: tokens.colors.surfaceSubtle,
    },
    stepperWrapper: {
      gap: tokens.spacing.sm,
    },
    stepperValueWrap: {
      flex: 1,
      minHeight: 72,
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surfaceSubtle,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: tokens.spacing.md,
    },
    scaleHintsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    scaleHint: {
      flex: 1,
      color: tokens.colors.textTertiary,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    inlineErrorText: {
      color: tokens.colors.danger,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
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
      textAlign: "center",
      color: tokens.colors.text,
      fontSize: tokens.typography.title.fontSize,
      lineHeight: tokens.typography.title.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    metricStack: {
      gap: tokens.spacing.lg,
    },
    metricStackCompact: {
      gap: tokens.spacing.md,
    },
    recoveryDisclosureCard: {
      gap: tokens.spacing.md,
      backgroundColor: tokens.colors.surfaceSubtle,
      borderColor: tokens.colors.border,
    },
    regionDetailStack: {
      gap: tokens.spacing.md,
      marginTop: tokens.spacing.sm,
    },
    regionDetailCard: {
      backgroundColor: tokens.colors.surfaceSubtle,
      borderColor: tokens.colors.border,
    },
    regionCardStack: {
      gap: tokens.spacing.lg,
    },
    regionCardHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: tokens.spacing.md,
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
    inlineTextButton: {
      minHeight: 36,
      borderRadius: tokens.radius.sm,
      paddingHorizontal: tokens.spacing.sm + 2,
      paddingVertical: tokens.spacing.xs + 2,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.colors.primarySoft,
      borderWidth: 1,
      borderColor: tokens.colors.primary,
    },
    inlineTextButtonPressed: {
      opacity: 0.84,
    },
    inlineTextButtonText: {
      color: tokens.colors.primary,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    reviewGrid: {
      gap: tokens.spacing.sm,
    },
    reviewGridItem: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.lg,
      padding: tokens.spacing.md,
      backgroundColor: tokens.colors.surfaceSubtle,
      gap: 2,
    },
    reviewLabel: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      letterSpacing: 0.2,
    },
    reviewValue: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    footerInner: {
      gap: tokens.spacing.sm,
    },
    footerHint: {
      color: tokens.colors.danger,
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
