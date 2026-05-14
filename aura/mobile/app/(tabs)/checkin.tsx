import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionErrorEvent,
  type ExpoSpeechRecognitionResultEvent,
} from "expo-speech-recognition";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { createCheckin, getCheckinAdaptation } from "@/src/api/patient";
import { Banner, type BannerVariant } from "@/src/components/Banner";
import { Avatar } from "@/src/components/Avatar";
import { Card } from "@/src/components/Card";
import { EmptyState } from "@/src/components/EmptyState";
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
import { VoiceDictationButton } from "@/src/components/VoiceDictationButton";
import { ReadAloudButton, normalizeReadAloudText } from "@/src/components/ReadAloudButton";
import { FINAL_DEMO_VOICE_UI_ENABLED } from "@/src/config/finalDemoScope";
import { BodyMapSelector } from "@/src/components/checkin/BodyMapSelector";
import { CheckinConfirmationPanel } from "@/src/components/checkin/CheckinConfirmationPanel";
import { CheckinFieldBlock } from "@/src/components/checkin/CheckinFieldBlock";
import { CheckinFlowShell } from "@/src/components/checkin/CheckinFlowShell";
import { CheckinReviewCard } from "@/src/components/checkin/CheckinReviewCard";
import { CheckinSubmissionRecoveryCard } from "@/src/components/checkin/CheckinSubmissionRecoveryCard";
import { CheckinStepCard } from "@/src/components/checkin/CheckinStepCard";
import { SymptomChipGroup } from "@/src/components/checkin/SymptomChipGroup";
import { VoiceGuidedCheckinPanel } from "@/src/components/checkin/VoiceGuidedCheckinPanel";
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
import {
  canPatientUseCheckin,
  getCachedRecoverySupport,
  getCareModeNotice,
  setCachedRecoverySupport,
} from "@/src/state/recoverySupport";
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
import type { GuidedCheckinStepId } from "@/src/utils/guidedCheckinSteps";
import { parseVoiceSubmitConfirmation } from "@/src/utils/guidedCheckinParser";
import type { CheckinAdaptationDecision } from "@/src/types/models";
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
  HELP_LEVEL_LABELS,
  MEDICATION_REASON_OPTIONS,
  MEDICATION_STATUS_LABELS,
  hasMeaningfulCheckinDraft,
  helpLevelLabel,
  medicationStatusLabel,
  SAFETY_STATE_LABELS,
  safetyStateLabel,
  scaleLabel,
  summarizePrimaryBodyMap,
  SYMPTOM_FLAG_LABELS,
  toggleSymptomFlag,
} from "@/src/utils/checkin";
import { todayISO } from "@/src/utils/date";
import { normalizeUnknownError } from "@/src/utils/errors";
import { stopReadAloud } from "@/src/utils/readAloud";

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

const BODY_MAP_LIMIT = 12;
const CHECKIN_AUTO_SAVE_DELAY_MS = 450;
const FIVE_POINT_CHOICES = [1, 2, 3, 4, 5] as const;
const MOOD_EMOJI_LABELS: Record<number, string> = {
  1: "😟",
  2: "😕",
  3: "🙂",
  4: "😊",
  5: "🤩",
};
const REHAB_DIFFICULTY_EMOJI_LABELS: Record<number, string> = {
  1: "😌",
  2: "🙂",
  3: "😐",
  4: "😣",
  5: "🥵",
};
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

type VoiceSubmitReviewState =
  | "draftReady"
  | "needsRequiredFields"
  | "reviewSummary"
  | "awaitingVoiceConfirmation"
  | "confirmedSubmit"
  | "cancelled"
  | "submitting"
  | "submitted"
  | "highRiskRouted"
  | "offlineBlocked"
  | "expired";

type SubmitSource = "manual" | "voiceConfirmed";

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
  voiceGuided?: string | string[];
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

function appendReviewedTranscript(currentText: string, transcript: string, maxLength: number): string {
  const cleanTranscript = transcript.trim();
  if (!cleanTranscript) {
    return currentText;
  }

  const baseText = currentText.trimEnd();
  const separator = baseText.length > 0 ? " " : "";
  return `${baseText}${separator}${cleanTranscript}`.slice(0, maxLength);
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
  const accessibilityValue = { min, max, now: value, text: `${label}: ${displayValue}` };
  const canDecrease = value > min;
  const canIncrease = value < max;

  return (
    <View style={styles.stepperWrapper}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.stepperRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          accessibilityHint={
            canDecrease ? `Decreases ${label} by ${step}.` : `${label} is already at the minimum.`
          }
          accessibilityState={{ disabled: !canDecrease }}
          accessibilityValue={accessibilityValue}
          disabled={!canDecrease}
          onPress={() => onChange(clamp(value - step, min, max))}
          style={({ pressed }) => [
            styles.stepperButton,
            !canDecrease ? styles.stepperButtonDisabled : null,
            pressed ? styles.stepperButtonPressed : null,
          ]}
        >
          <Text style={styles.stepperButtonText}>−</Text>
        </Pressable>
        <View
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${label} current value ${displayValue}`}
          accessibilityValue={accessibilityValue}
          style={styles.stepperValueWrap}
        >
          <Text style={styles.stepperValue}>{displayValue}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          accessibilityHint={
            canIncrease ? `Increases ${label} by ${step}.` : `${label} is already at the maximum.`
          }
          accessibilityState={{ disabled: !canIncrease }}
          accessibilityValue={accessibilityValue}
          disabled={!canIncrease}
          onPress={() => onChange(clamp(value + step, min, max))}
          style={({ pressed }) => [
            styles.stepperButton,
            !canIncrease ? styles.stepperButtonDisabled : null,
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
  const clearDisabled = value === null;

  return (
    <View style={styles.optionalStepperWrapper}>
      <Stepper {...props} value={effectiveValue} onChange={onChange} />
      <View style={styles.optionalStepperFooter}>
        <Text style={styles.optionalValueHint}>{value === null ? "Not set" : "Set"}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Clear ${props.label}`}
          accessibilityHint={
            clearDisabled ? `${props.label} is not set.` : `Clears ${props.label}.`
          }
          accessibilityState={{ disabled: clearDisabled }}
          disabled={clearDisabled}
          onPress={() => onChange(null)}
          style={({ pressed }) => [
            styles.clearOptionalButton,
            clearDisabled ? styles.clearOptionalButtonDisabled : null,
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
  emojiOptions?: Record<number, string>;
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
    emojiOptions,
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
            accessibilityLabel={`Clear ${label}`}
            accessibilityHint={`Clears ${label}.`}
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
              accessibilityLabel={`Set ${label} to ${entry}, ${options[entry]}`}
              accessibilityState={{ selected }}
              onPress={() => onChange(entry)}
              style={({ pressed }) => [
                styles.choiceChip,
                selected ? styles.choiceChipSelected : null,
                pressed ? styles.choiceChipPressed : null,
              ]}
            >
              {emojiOptions ? (
                <Text
                  accessible={false}
                  style={[
                    styles.choiceChipEmoji,
                    selected ? styles.choiceChipEmojiSelected : null,
                  ]}
                >
                  {emojiOptions[entry]}
                </Text>
              ) : null}
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
  label: string;
  value: number | null;
  onChange: (nextValue: number) => void;
  options: Record<number, string>;
  emojiOptions?: Record<number, string>;
  helperText?: string;
  styles: ReturnType<typeof createStyles>;
}) {
  const { label, value, onChange, options, emojiOptions, helperText, styles } = params;

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
              accessibilityLabel={`Set ${label} to ${entry}, ${options[entry]}`}
              accessibilityState={{ selected }}
              onPress={() => onChange(entry)}
              style={({ pressed }) => [
                styles.fixedChoiceButton,
                selected ? styles.fixedChoiceButtonSelected : null,
                pressed ? styles.choiceChipPressed : null,
              ]}
            >
              {emojiOptions ? (
                <Text
                  accessible={false}
                  style={[
                    styles.fixedChoiceEmoji,
                    selected ? styles.fixedChoiceEmojiSelected : null,
                  ]}
                >
                  {emojiOptions[entry]}
                </Text>
              ) : null}
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
  const shouldOpenVoiceGuided = params.voiceGuided === "1";
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
  const careModeNotice = useMemo(() => getCareModeNotice(auth.patient), [auth.patient]);
  const checkinAvailable = canPatientUseCheckin(auth.patient);

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
  const [adaptationDecision, setAdaptationDecision] =
    useState<CheckinAdaptationDecision | null>(null);
  const [pendingValidationField, setPendingValidationField] =
    useState<CheckinValidationField | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const validationFieldOffsets = useRef<Partial<Record<CheckinValidationField, number>>>({});
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceSubmitExpiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceSubmitStateRef = useRef<VoiceSubmitReviewState>("draftReady");
  const [voiceSubmitState, setVoiceSubmitState] =
    useState<VoiceSubmitReviewState>("draftReady");
  const [voiceSubmitSummarySignature, setVoiceSubmitSummarySignature] = useState<string | null>(null);
  const [voiceSubmitMessage, setVoiceSubmitMessage] = useState<string | null>(null);
  const [isVoiceSubmitListening, setIsVoiceSubmitListening] = useState(false);

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

  useEffect(() => {
    let active = true;

    if (auth.status !== "signedIn" || !patientId || !date) {
      setAdaptationDecision(null);
      return () => {
        active = false;
      };
    }

    void (async () => {
      if (isOffline || !auth.token) {
        const cached = await getCachedRecoverySupport(patientId, date);
        if (active) {
          setAdaptationDecision(cached?.adaptation ?? null);
        }
        return;
      }

      try {
        const decision = await getCheckinAdaptation(auth.token, { date });
        if (!active) {
          return;
        }
        setAdaptationDecision(decision);

        const cached = await getCachedRecoverySupport(patientId, date);
        await setCachedRecoverySupport(patientId, date, {
          adaptation: decision,
          nudge: cached?.nudge ?? null,
        });
      } catch {
        if (!active) {
          return;
        }
        const cached = await getCachedRecoverySupport(patientId, date);
        setAdaptationDecision(cached?.adaptation ?? null);
      }
    })();

    return () => {
      active = false;
    };
  }, [auth.status, auth.token, date, isOffline, patientId]);

  useEffect(() => {
    if (adaptationDecision?.optionalSections.recovery === false) {
      setShowRecoveryDetails(true);
    }

    if (adaptationDecision?.optionalSections.dailyContext === false) {
      setShowDailyContext(true);
    }
  }, [
    adaptationDecision?.optionalSections.dailyContext,
    adaptationDecision?.optionalSections.recovery,
  ]);

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
    adaptationDecision?.optionalSections.dailyContext === false ||
    showDailyContext ||
    dailySignals.sleepHours !== null ||
    dailySignals.sleepQuality !== null ||
    dailySignals.sleepDisturbances !== null ||
    dailySignals.hydrationLevel !== null ||
    dailySignals.energyLevel !== null;
  const adaptationMessage = adaptationDecision?.explanation ?? null;

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

  const dailyContextSummary = useMemo(() => {
    const parts: string[] = [];

    if (dailySignals.sleepHours !== null) {
      parts.push(`${dailySignals.sleepHours.toFixed(1)} hours asleep`);
    }

    if (dailySignals.sleepQuality !== null) {
      parts.push(`Sleep quality ${scaleLabel(dailySignals.sleepQuality, FIVE_POINT_RECOVERY_LABELS).toLowerCase()}`);
    }

    if (dailySignals.sleepDisturbances !== null) {
      parts.push(
        `${dailySignals.sleepDisturbances} night disturbance${
          dailySignals.sleepDisturbances === 1 ? "" : "s"
        }`,
      );
    }

    if (dailySignals.hydrationLevel !== null) {
      parts.push(`Hydration ${scaleLabel(dailySignals.hydrationLevel, FIVE_POINT_SUPPORT_LABELS).toLowerCase()}`);
    }

    if (dailySignals.energyLevel !== null) {
      parts.push(`Energy ${scaleLabel(dailySignals.energyLevel, FIVE_POINT_SUPPORT_LABELS).toLowerCase()}`);
    }

    return parts.length > 0 ? parts.join(" · ") : "Not added";
  }, [dailySignals]);

  const reviewRows = useMemo(
    () => [
      {
        key: "mood",
        label: "Mood",
        value:
          support.mood === null
            ? scaleLabel(support.mood, FIVE_POINT_RECOVERY_LABELS)
            : `${MOOD_EMOJI_LABELS[support.mood]} ${scaleLabel(
                support.mood,
                FIVE_POINT_RECOVERY_LABELS,
              )}`,
      },
      {
        key: "stress",
        label: "Stress",
        value:
          support.stressLevel === null
            ? "Not set"
            : scaleLabel(support.stressLevel, FIVE_POINT_SUPPORT_LABELS),
      },
      {
        key: "recovery",
        label: "Recovery",
        value: `${recovery.exercisePercent}% complete · ${scaleLabel(
          recovery.difficultyLevel,
          FIVE_POINT_DIFFICULTY_LABELS,
        )} difficulty`,
      },
      {
        key: "medication",
        label: "Medication",
        value: medicationStatusLabel(adherence.medicationStatus),
      },
      {
        key: "context",
        label: "Daily context",
        value: dailyContextSummary,
      },
      {
        key: "support",
        label: "Support request",
        value:
          support.helpLevel === null
            ? HELP_LEVEL_LABELS.none
            : helpLevelLabel(support.helpLevel),
      },
      {
        key: "safety",
        label: "Safety",
        value:
          support.safetyState === null
            ? SAFETY_STATE_LABELS.safe
            : safetyStateLabel(support.safetyState),
      },
      {
        key: "extra-support",
        label: "Extra support",
        value: support.wantsExtraSupport ? "Requested" : "Not requested",
      },
      {
        key: "body-map",
        label: "Body areas",
        value: summarizePrimaryBodyMap(bodyMap),
      },
    ],
    [
      adherence.medicationStatus,
      bodyMap,
      dailyContextSummary,
      recovery.difficultyLevel,
      recovery.exercisePercent,
      support.helpLevel,
      support.mood,
      support.safetyState,
      support.stressLevel,
      support.wantsExtraSupport,
    ],
  );

  const voiceSubmitDraftSignature = useMemo(
    () =>
      JSON.stringify({
        date,
        pain,
        symptomFlags,
        recovery,
        adherence,
        support,
        dailySignals,
        bodyMap,
        notes,
      }),
    [adherence, bodyMap, dailySignals, date, notes, pain, recovery, support, symptomFlags],
  );

  const voiceSubmitSummaryText = useMemo(() => {
    const parts = [
      `Pain ${pain}/10`,
      support.mood === null
        ? "Mood not set"
        : `Mood ${support.mood}/5, ${scaleLabel(support.mood, FIVE_POINT_RECOVERY_LABELS)}`,
      `Exercises ${recovery.exercisePercent}% complete`,
      `Medication ${medicationStatusLabel(adherence.medicationStatus)}`,
    ];

    if (bodyMap.selectedRegions.length > 0) {
      parts.push(`Body areas: ${summarizePrimaryBodyMap(bodyMap)}`);
    }

    if (support.helpLevel && support.helpLevel !== "none") {
      parts.push(`Support request: ${helpLevelLabel(support.helpLevel)}`);
    }

    if (support.safetyState && support.safetyState !== "safe") {
      parts.push(`Safety: ${safetyStateLabel(support.safetyState)}`);
    }

    if (dailyContextSummary !== "Not added") {
      parts.push(`Daily context: ${dailyContextSummary}`);
    }

    const notesPreview = notes.trim();
    if (notesPreview) {
      parts.push(`Notes: ${notesPreview.slice(0, 180)}`);
    }

    parts.push("Urgent symptoms still go through Aura's normal safety review");
    return parts.join(". ");
  }, [
    adherence.medicationStatus,
    bodyMap,
    dailyContextSummary,
    notes,
    pain,
    recovery.exercisePercent,
    support.helpLevel,
    support.mood,
    support.safetyState,
  ]);

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

  const clearVoiceSubmitExpiryTimer = useCallback(() => {
    if (voiceSubmitExpiryTimerRef.current) {
      clearTimeout(voiceSubmitExpiryTimerRef.current);
      voiceSubmitExpiryTimerRef.current = null;
    }
  }, []);

  const updateVoiceSubmitState = useCallback((nextState: VoiceSubmitReviewState) => {
    voiceSubmitStateRef.current = nextState;
    setVoiceSubmitState(nextState);
  }, []);

  const startVoiceSubmitExpiryTimer = useCallback(() => {
    clearVoiceSubmitExpiryTimer();
    voiceSubmitExpiryTimerRef.current = setTimeout(() => {
      setVoiceSubmitSummarySignature(null);
      setIsVoiceSubmitListening(false);
      setVoiceSubmitMessage("Voice submit review expired. Review again before submitting.");
      updateVoiceSubmitState("expired");
    }, 30_000);
  }, [clearVoiceSubmitExpiryTimer, updateVoiceSubmitState]);

  useEffect(
    () => () => {
      clearVoiceSubmitExpiryTimer();
    },
    [clearVoiceSubmitExpiryTimer],
  );

  useEffect(() => {
    if (
      !voiceSubmitSummarySignature ||
      voiceSubmitSummarySignature === voiceSubmitDraftSignature ||
      voiceSubmitState === "submitting" ||
      voiceSubmitState === "submitted" ||
      voiceSubmitState === "highRiskRouted"
    ) {
      return;
    }

    clearVoiceSubmitExpiryTimer();
    setVoiceSubmitSummarySignature(null);
    setIsVoiceSubmitListening(false);
    setVoiceSubmitMessage("Check-in changed. Review again before voice submit.");
    updateVoiceSubmitState("draftReady");
  }, [
    clearVoiceSubmitExpiryTimer,
    updateVoiceSubmitState,
    voiceSubmitDraftSignature,
    voiceSubmitState,
    voiceSubmitSummarySignature,
  ]);

  const handlePrepareVoiceSubmitReview = useCallback(() => {
    if (validationState) {
      clearVoiceSubmitExpiryTimer();
      setVoiceSubmitSummarySignature(null);
      setVoiceSubmitMessage("Voice submit needs one more answer.");
      updateVoiceSubmitState("needsRequiredFields");
      setSubmittedCheckin(null);
      setNotice({
        variant: "warning",
        title: "Voice submit needs one more answer.",
        message: validationState.message,
      });
      setActiveStep(validationState.stepIndex);
      setPendingValidationField(validationState.field);
      return;
    }

    setVoiceSubmitSummarySignature(voiceSubmitDraftSignature);
    setVoiceSubmitMessage("Review this summary, then say yes submit or press Confirm submit.");
    updateVoiceSubmitState("reviewSummary");
    startVoiceSubmitExpiryTimer();
  }, [
    clearVoiceSubmitExpiryTimer,
    startVoiceSubmitExpiryTimer,
    updateVoiceSubmitState,
    validationState,
    voiceSubmitDraftSignature,
  ]);

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

  const activeBodyRegionDetail = useMemo(() => {
    const region = bodyMap.primaryRegion ?? bodyMap.selectedRegions[0] ?? null;
    if (!region) {
      return null;
    }

    return {
      region,
      selection: bodyMap.selections[region] ?? {
        intensity: pain > 0 ? pain : 5,
        type: "ache" as BodyMapPainType,
      },
      additionalCount: Math.max(0, bodyMap.selectedRegions.length - 1),
    };
  }, [bodyMap, pain]);

  const submitCheckin = async ({ source }: { source: SubmitSource } = { source: "manual" }) => {
    if (isSubmitting) {
      return;
    }

    if (!auth.token) {
      if (source === "voiceConfirmed") {
        clearVoiceSubmitExpiryTimer();
        setVoiceSubmitMessage("Your session expired. Please sign in again.");
        updateVoiceSubmitState("expired");
      }
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
      if (source === "voiceConfirmed") {
        clearVoiceSubmitExpiryTimer();
        setVoiceSubmitSummarySignature(null);
        setVoiceSubmitMessage("Voice submit needs one more answer.");
        updateVoiceSubmitState("needsRequiredFields");
      }
      setSubmittedCheckin(null);
      setNotice(null);
      setActiveStep(validationState.stepIndex);
      setPendingValidationField(validationState.field);
      return;
    }

    if (isOffline) {
      if (source === "voiceConfirmed") {
        clearVoiceSubmitExpiryTimer();
        setVoiceSubmitSummarySignature(null);
        setVoiceSubmitMessage("Voice submit is paused while you’re offline.");
        updateVoiceSubmitState("offlineBlocked");
      }
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
    if (source === "voiceConfirmed") {
      clearVoiceSubmitExpiryTimer();
      setVoiceSubmitMessage("Submitting this reviewed check-in.");
      updateVoiceSubmitState("submitting");
    }
    let response: Awaited<ReturnType<typeof createCheckin>> | null = null;

    try {
      response = await createCheckin(auth.token, payload);
    } catch (error) {
      if (isApiError(error) && error.status === 409) {
        await Promise.allSettled([checkinError.clear(), checkinsRefresh.refreshLocal()]);
        if (source === "voiceConfirmed") {
          setVoiceSubmitSummarySignature(null);
          setVoiceSubmitMessage("Today’s check-in is already saved.");
          updateVoiceSubmitState("submitted");
        }
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
      if (source === "voiceConfirmed") {
        setVoiceSubmitMessage(normalized.message);
        updateVoiceSubmitState("reviewSummary");
      }
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
      if (source === "voiceConfirmed") {
        setVoiceSubmitSummarySignature(null);
        setVoiceSubmitMessage("Submitted. Aura is opening the normal Safety review.");
        updateVoiceSubmitState("highRiskRouted");
      }
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
    if (source === "voiceConfirmed") {
      setVoiceSubmitSummarySignature(null);
      setVoiceSubmitMessage("Submitted.");
      updateVoiceSubmitState("submitted");
    }
    setSubmittedCheckin({
      submittedAtISO,
      summary: reviewSummary,
      chips: reviewChips,
      notesPreview: notes.trim() || undefined,
    });
    setNotice(null);
    resetForm();
  };

  const handleSubmit = () => submitCheckin({ source: "manual" });

  const canUseCurrentVoiceSubmitReview =
    voiceSubmitSummarySignature === voiceSubmitDraftSignature &&
    (voiceSubmitState === "reviewSummary" ||
      voiceSubmitState === "awaitingVoiceConfirmation" ||
      voiceSubmitState === "confirmedSubmit");

  const handleCancelVoiceSubmit = useCallback((message = "Voice submit cancelled.") => {
    clearVoiceSubmitExpiryTimer();
    setVoiceSubmitSummarySignature(null);
    setIsVoiceSubmitListening(false);
    setVoiceSubmitMessage(message);
    updateVoiceSubmitState("cancelled");
    if (isVoiceSubmitListening) {
      ExpoSpeechRecognitionModule.abort();
    }
  }, [
    clearVoiceSubmitExpiryTimer,
    isVoiceSubmitListening,
    updateVoiceSubmitState,
  ]);

  const submitReviewedVoiceCheckin = useCallback(() => {
    if (!canUseCurrentVoiceSubmitReview) {
      setVoiceSubmitMessage("Review again before voice submit.");
      updateVoiceSubmitState("expired");
      return;
    }

    updateVoiceSubmitState("confirmedSubmit");
    setVoiceSubmitMessage("Voice submit confirmed.");
    void submitCheckin({ source: "voiceConfirmed" });
  }, [canUseCurrentVoiceSubmitReview, submitCheckin, updateVoiceSubmitState]);

  const handleVoiceSubmitTranscript = useCallback(
    (transcript: string) => {
      setIsVoiceSubmitListening(false);
      if (voiceSubmitStateRef.current !== "awaitingVoiceConfirmation") {
        return;
      }

      if (voiceSubmitSummarySignature !== voiceSubmitDraftSignature) {
        clearVoiceSubmitExpiryTimer();
        setVoiceSubmitSummarySignature(null);
        setVoiceSubmitMessage("Check-in changed. Review again before voice submit.");
        updateVoiceSubmitState("draftReady");
        return;
      }

      const result = parseVoiceSubmitConfirmation(transcript);
      if (result === "confirm") {
        submitReviewedVoiceCheckin();
        return;
      }

      if (result === "cancel") {
        handleCancelVoiceSubmit();
        return;
      }

      setVoiceSubmitMessage("That was not a clear submit confirmation. Say yes submit, confirm submit, or submit check-in.");
      updateVoiceSubmitState("awaitingVoiceConfirmation");
    },
    [
      clearVoiceSubmitExpiryTimer,
      handleCancelVoiceSubmit,
      submitReviewedVoiceCheckin,
      updateVoiceSubmitState,
      voiceSubmitDraftSignature,
      voiceSubmitSummarySignature,
    ],
  );

  const handleListenForVoiceSubmitConfirmation = useCallback(async () => {
    if (!canUseCurrentVoiceSubmitReview) {
      setVoiceSubmitMessage(
        voiceSubmitStateRef.current === "expired"
          ? "Voice submit review expired. Review again before submitting."
          : "Review again before voice submit.",
      );
      updateVoiceSubmitState("expired");
      return;
    }

    updateVoiceSubmitState("awaitingVoiceConfirmation");
    setVoiceSubmitMessage("Listening for yes submit, confirm submit, or submit check-in.");
    setIsVoiceSubmitListening(true);

    await stopReadAloud();

    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setIsVoiceSubmitListening(false);
      setVoiceSubmitMessage("Voice confirmation is not available on this device. Use Confirm submit or manual submit.");
      return;
    }

    if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
      setIsVoiceSubmitListening(false);
      setVoiceSubmitMessage("On-device voice confirmation is not available on this device. Use Confirm submit or manual submit.");
      return;
    }

    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setIsVoiceSubmitListening(false);
      setVoiceSubmitMessage("Microphone permission was denied. Use Confirm submit or manual submit.");
      return;
    }

    try {
      ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        continuous: false,
        interimResults: true,
        maxAlternatives: 1,
        requiresOnDeviceRecognition: true,
        recordingOptions: {
          persist: false,
        },
      });
    } catch {
      setIsVoiceSubmitListening(false);
      setVoiceSubmitMessage("Voice confirmation could not start. Nothing was submitted.");
      updateVoiceSubmitState("reviewSummary");
    }
  }, [canUseCurrentVoiceSubmitReview, updateVoiceSubmitState]);

  useEffect(() => {
    const startListener = ExpoSpeechRecognitionModule.addListener("start", () => {
      if (voiceSubmitStateRef.current === "awaitingVoiceConfirmation") {
        setIsVoiceSubmitListening(true);
      }
    });
    const endListener = ExpoSpeechRecognitionModule.addListener("end", () => {
      setIsVoiceSubmitListening(false);
    });
    const resultListener = ExpoSpeechRecognitionModule.addListener(
      "result",
      (event: ExpoSpeechRecognitionResultEvent) => {
        if (!event.isFinal || voiceSubmitStateRef.current !== "awaitingVoiceConfirmation") {
          return;
        }

        const transcript = event.results
          .map((result) => result.transcript.trim())
          .find((candidate) => candidate.length > 0);

        handleVoiceSubmitTranscript(transcript ?? "");
      },
    );
    const errorListener = ExpoSpeechRecognitionModule.addListener(
      "error",
      (_event: ExpoSpeechRecognitionErrorEvent) => {
        if (voiceSubmitStateRef.current === "awaitingVoiceConfirmation") {
          setIsVoiceSubmitListening(false);
          setVoiceSubmitMessage("That was not a clear submit confirmation. Nothing was submitted.");
        }
      },
    );
    const nomatchListener = ExpoSpeechRecognitionModule.addListener("nomatch", () => {
      if (voiceSubmitStateRef.current === "awaitingVoiceConfirmation") {
        setIsVoiceSubmitListening(false);
        setVoiceSubmitMessage("That was not a clear submit confirmation. Nothing was submitted.");
      }
    });

    return () => {
      startListener.remove();
      endListener.remove();
      resultListener.remove();
      errorListener.remove();
      nomatchListener.remove();
      if (voiceSubmitStateRef.current === "awaitingVoiceConfirmation") {
        ExpoSpeechRecognitionModule.abort();
      }
    };
  }, [handleVoiceSubmitTranscript]);

  const handleNotesDictationTranscript = useCallback((transcript: string) => {
    setNotice(null);
    setNotes((current) => appendReviewedTranscript(current, transcript, 1200));
  }, []);

  const renderQuestionReadAloud = (parts: Array<string | null | undefined>, sourceId: string) => (
    <ReadAloudButton
      text={normalizeReadAloudText(parts)}
      label="Read question"
      sourceId={sourceId}
      testID={`${sourceId}-read-aloud`}
    />
  );

  const handleGuidedEditManually = useCallback((stepId: GuidedCheckinStepId) => {
    setNotice(null);

    if (stepId === "pain") {
      setActiveStep(0);
      return;
    }

    if (stepId === "exercise" || stepId === "medication") {
      setActiveStep(1);
      if (stepId === "medication") {
        setShowRecoveryDetails(true);
      }
      return;
    }

    setActiveStep(2);
    if (stepId === "sleepHours" || stepId === "sleepQuality") {
      setShowDailyContext(true);
    }
  }, []);

  const guidedCheckinPanel = FINAL_DEMO_VOICE_UI_ENABLED ? (
    <VoiceGuidedCheckinPanel
      initialExpanded={shouldOpenVoiceGuided}
      beginOnMount={shouldOpenVoiceGuided}
      includeSleep={shouldShowDailyContext}
      onConfirmPain={(value) => {
        setNotice(null);
        setPain(value);
      }}
      onConfirmMood={(value) => {
        setNotice(null);
        setSupport((current) => ({ ...current, mood: value }));
      }}
      onConfirmExercise={(value) => {
        setNotice(null);
        setRecovery((current) => ({ ...current, exercisePercent: value }));
      }}
      onConfirmMedicationStatus={(value) => {
        setNotice(null);
        setShowRecoveryDetails(true);
        setAdherence((current) => ({
          ...current,
          medicationStatus: value,
          medicationReason: value === "taken" ? null : current.medicationReason,
        }));
      }}
      onConfirmNotes={(value) => {
        setNotice(null);
        setNotes((current) => appendReviewedTranscript(current, value, 1200));
      }}
      onConfirmSleepHours={(value) => {
        setNotice(null);
        setShowDailyContext(true);
        setDailySignals((current) => ({ ...current, sleepHours: value }));
      }}
      onConfirmSleepQuality={(value) => {
        setNotice(null);
        setShowDailyContext(true);
        setDailySignals((current) => ({ ...current, sleepQuality: value }));
      }}
      onEditManually={handleGuidedEditManually}
      onRequestVoiceSubmitReview={() => {
        setNotice(null);
        setActiveStep(3);
        handlePrepareVoiceSubmitReview();
      }}
    />
  ) : null;

  const renderSymptomsStep = () => (
    <CheckinStepCard
      compact
      title="How your body feels today"
      description="Start with pain, then add any symptoms and body areas that need attention."
      icon="checkin"
      tone="warning"
    >
      <CheckinFieldBlock
        title="Pain level"
        description="Use the full range from no pain to worst pain today."
        accessory={renderQuestionReadAloud(
          ["Pain level", "Use the full range from no pain to worst pain today."],
          "checkin-pain",
        )}
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
        compact
        accessory={
          symptomFlags.length > 0 ? (
            <StatusPill
              label={`${symptomFlags.length} selected`}
              variant="info"
              accessible={false}
            />
          ) : null
        }
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
        compact
        accessory={
          bodyMap.selectedRegions.length > 0 ? (
            <StatusPill
              label={`${bodyMap.selectedRegions.length} area${
                bodyMap.selectedRegions.length === 1 ? "" : "s"
              }`}
              variant="info"
              accessible={false}
            />
          ) : null
        }
      >
        <BodyMapSelector
          value={bodyMap}
          onToggleRegion={handleToggleRegion}
          onSetPrimaryRegion={handleSetPrimaryRegion}
        />

        {activeBodyRegionDetail ? (
          <View style={styles.regionDetailStack}>
            <Card
              key={`region-${activeBodyRegionDetail.region}`}
              variant="outlined"
              padding={tokens.spacing.lg}
              style={styles.regionDetailCard}
            >
              <View style={styles.regionCardStack}>
                <View style={styles.regionCardHeader}>
                  <View style={styles.regionHeaderCopy}>
                    <Text style={styles.fieldLabel}>
                      {regionLabel(activeBodyRegionDetail.region)}
                    </Text>
                    <Text style={styles.helperText}>
                      {activeBodyRegionDetail.additionalCount > 0
                        ? `${activeBodyRegionDetail.additionalCount} other selected area${
                            activeBodyRegionDetail.additionalCount === 1 ? "" : "s"
                          } stay summarized above. Tap another selected region to bring it forward.`
                        : "Edit the most bothersome area here."}
                    </Text>
                  </View>
                  <View style={styles.regionHeaderActions}>
                    <StatusPill label="Primary" variant="success" accessible={false} />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${regionLabel(activeBodyRegionDetail.region)}`}
                      onPress={() => handleToggleRegion(activeBodyRegionDetail.region)}
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
                  value={activeBodyRegionDetail.selection.intensity}
                  min={0}
                  max={10}
                  step={1}
                  leftHint="Mild"
                  rightHint="Severe"
                  valueFormatter={(value) => `${value}/10`}
                  onChange={(value) =>
                    updateBodyMapSelection(activeBodyRegionDetail.region, { intensity: value })
                  }
                />

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Symptom type</Text>
                  <View style={styles.chipRow}>
                    {BODY_MAP_PAIN_TYPES.map((type) => {
                      const selected = activeBodyRegionDetail.selection.type === type;
                      return (
                        <Pressable
                          key={`${activeBodyRegionDetail.region}-${type}`}
                          accessibilityRole="button"
                          accessibilityLabel={`Set ${regionLabel(
                            activeBodyRegionDetail.region,
                          )} type ${painTypeLabel(type)}`}
                          accessibilityState={{ selected }}
                          onPress={() =>
                            updateBodyMapSelection(activeBodyRegionDetail.region, { type })
                          }
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
      <Card
        variant="outlined"
        padding={tokens.spacing.md}
        style={styles.primaryGroupCard}
      >
        <View style={styles.groupStack}>
          <CheckinFieldBlock
            title="Exercise completion"
            description="Estimate how much of today’s plan you were able to do."
            compact
            accessory={renderQuestionReadAloud(
              [
                "Exercise completion",
                "Estimate how much of today’s plan you were able to do.",
                "Use 10% steps for a quick estimate.",
              ],
              "checkin-exercise-completion",
            )}
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
            accessory={renderQuestionReadAloud(
              [
                "How rehab felt",
                "Start with the main effort rating for today’s plan.",
                "1 is very easy and 5 is very hard.",
              ],
              "checkin-rehab-felt",
            )}
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
                emojiOptions: REHAB_DIFFICULTY_EMOJI_LABELS,
                styles,
              })}
            </View>
          </CheckinFieldBlock>

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
                      accessibilityLabel="Clear medication reason"
                      accessibilityHint="Clears why medication was missed or not needed."
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
      </Card>
    </CheckinStepCard>
  );

  const renderSupportStep = () => (
    <CheckinStepCard
      compact
      title="Mood, context, and support"
      description="Share how you feel today and whether you need extra help."
      icon="coping"
      tone="success"
    >
      <Card
        variant="outlined"
        padding={tokens.spacing.md}
        style={styles.primaryGroupCard}
      >
        <View style={styles.groupStack}>
          <CheckinFieldBlock
            title="Mood"
            description="Choose the number that best matches your mood today."
            compact
            accessory={renderQuestionReadAloud(
              [
                "Mood",
                "Choose the number that best matches your mood today.",
                "1 is very low and 5 is very strong.",
              ],
              "checkin-mood",
            )}
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
              label: "Mood",
              value: support.mood,
              onChange: (value) => {
                setNotice(null);
                setSupport((current) => ({ ...current, mood: value }));
              },
              helperText: "1 is very low and 5 is very strong.",
              options: FIVE_POINT_RECOVERY_LABELS,
              emojiOptions: MOOD_EMOJI_LABELS,
              styles,
            })}
            {support.mood ? (
              <View
                accessible
                accessibilityRole="text"
                accessibilityLabel={`Mood selected: ${scaleLabel(
                  support.mood,
                  FIVE_POINT_RECOVERY_LABELS,
                )}`}
                style={styles.moodPreviewCard}
              >
                <Text accessible={false} style={styles.moodPreviewEmoji}>
                  {MOOD_EMOJI_LABELS[support.mood]}
                </Text>
                <View style={styles.moodPreviewCopy}>
                  <Text style={styles.moodPreviewLabel}>Selected mood</Text>
                  <Text style={styles.moodPreviewValue}>
                    {scaleLabel(support.mood, FIVE_POINT_RECOVERY_LABELS)}
                  </Text>
                </View>
              </View>
            ) : null}
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
        </View>
      </Card>

      <Card
        variant="outlined"
        padding={tokens.spacing.md}
        style={styles.secondaryGroupCard}
      >
        <View style={styles.groupStack}>
          <CheckinFieldBlock
            title="Daily context"
            description="Add extra sleep, hydration, and energy detail when it helps explain your day."
            compact
            accessory={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  shouldShowDailyContext
                    ? "Hide daily context details"
                    : "Add daily context details"
                }
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
              <View style={styles.metricStackCompact}>
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
                    setDailySignals((current) => ({
                      ...current,
                      sleepDisturbances: value,
                    }));
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
                These extra details are optional and can be added when they help tell the
                story of today.
              </Text>
            )}
          </CheckinFieldBlock>

          <CheckinFieldBlock
            title="Notes"
            description="Add anything you want your clinician to review today."
            compact
            accessory={renderQuestionReadAloud(
              [
                "Notes",
                "Add anything you want your clinician to review today.",
                "Notes can still help your care team spot issues that need follow-up.",
              ],
              "checkin-notes",
            )}
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
              accessibilityLabel="Check-in notes for your care team"
              accessibilityHint="Optional. Add text here for review before you submit."
            />
            {FINAL_DEMO_VOICE_UI_ENABLED ? (
              <VoiceDictationButton
                onTranscript={handleNotesDictationTranscript}
                testID="checkin-notes-voice-dictation"
              />
            ) : null}
            <Text style={styles.helperText}>
              Notes can still help your care team spot issues that need follow-up.
            </Text>
          </CheckinFieldBlock>
        </View>
      </Card>

      <Card
        variant="outlined"
        padding={tokens.spacing.md}
        style={styles.primaryGroupCard}
      >
        <CheckinFieldBlock
          title="Support need"
          description="Tell us if you want a follow-up or need urgent help today."
          compact
          accessory={renderQuestionReadAloud(
            ["Support need", "Tell us if you want a follow-up or need urgent help today."],
            "checkin-support-need",
          )}
        >
          <SegmentedControl
            value={support.helpLevel ?? "none"}
            onChange={(value: "none" | "follow_up" | "urgent") => {
              setNotice(null);
              setSupport((current) => ({ ...current, helpLevel: value }));
            }}
            options={[
              { value: "none", label: HELP_LEVEL_LABELS.none },
              { value: "follow_up", label: HELP_LEVEL_LABELS.follow_up },
              { value: "urgent", label: HELP_LEVEL_LABELS.urgent },
            ]}
            allowWrap
            tone="accent"
            accessibilityLabel="Support request"
          />
        </CheckinFieldBlock>
      </Card>

      <Card
        variant="outlined"
        padding={tokens.spacing.md}
        style={styles.safetyGroupCard}
      >
        <View style={styles.groupStack}>
          <CheckinFieldBlock
            title="Safety"
            description="If you feel unsafe, choose that here and submit your check-in so we can route help appropriately."
            compact
            accessory={renderQuestionReadAloud(
              [
                "Safety",
                "If you feel unsafe, choose that here and submit your check-in so we can route help appropriately.",
              ],
              "checkin-safety",
            )}
          >
            <SegmentedControl
              value={support.safetyState ?? "safe"}
              onChange={(value: "safe" | "unsure" | "unsafe") => {
                setNotice(null);
                setSupport((current) => ({ ...current, safetyState: value }));
              }}
              options={[
                { value: "safe", label: SAFETY_STATE_LABELS.safe },
                { value: "unsure", label: SAFETY_STATE_LABELS.unsure },
                { value: "unsafe", label: SAFETY_STATE_LABELS.unsafe },
              ]}
              allowWrap
              tone="primary"
              accessibilityLabel="Current safety state"
            />
          </CheckinFieldBlock>

          <View style={styles.supportSwitchRow}>
            <View style={styles.supportSwitchCopy}>
              <Text style={styles.supportSwitchTitle}>Extra support today</Text>
              <Text style={styles.supportSwitchDescription}>
                Use this if you would like a little more encouragement or practical support
                without needing urgent help.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Extra support today"
              accessibilityHint="Turn on if you would like non-urgent encouragement or practical support today."
              accessibilityRole="switch"
              accessibilityState={{ checked: support.wantsExtraSupport }}
              value={support.wantsExtraSupport}
              onValueChange={(value) => {
                setNotice(null);
                setSupport((current) => ({ ...current, wantsExtraSupport: value }));
              }}
            />
          </View>
        </View>
      </Card>
    </CheckinStepCard>
  );

  const renderVoiceSubmitReviewPanel = () => {
    if (!FINAL_DEMO_VOICE_UI_ENABLED) {
      return null;
    }

    const canReviewSubmit = canUseCurrentVoiceSubmitReview && !isSubmitting;
    const canListen =
      canReviewSubmit &&
      voiceSubmitState !== "confirmedSubmit";
    const statusRole =
      voiceSubmitState === "needsRequiredFields" ||
      voiceSubmitState === "offlineBlocked" ||
      voiceSubmitState === "expired"
        ? "alert"
        : "text";

    return (
      <Card
        variant="outlined"
        padding={tokens.spacing.md}
        style={styles.voiceSubmitCard}
      >
        <View style={styles.groupStack}>
          <View style={styles.inlineHeaderRow}>
            <View style={styles.sectionStackCompact}>
              <Text accessibilityRole="header" style={styles.fieldLabel}>
                Voice submit review
              </Text>
              <Text style={styles.helperText}>
                I’ll submit this exact check-in after you say ‘yes submit.’ Urgent
                symptoms still go through Aura’s normal safety review.
              </Text>
            </View>
            <ReadAloudButton
              text={voiceSubmitSummaryText}
              label="Read voice submit summary"
              sourceId="voice-submit-review-summary"
              testID="voice-submit-review-read-summary"
            />
          </View>

          {voiceSubmitSummarySignature ? (
            <View
              accessible
              accessibilityRole="summary"
              accessibilityLabel={`Voice submit summary. ${voiceSubmitSummaryText}`}
              style={styles.voiceSubmitSummaryBox}
            >
              <Text selectable style={styles.reviewValue}>
                {voiceSubmitSummaryText}
              </Text>
            </View>
          ) : null}

          <View
            accessible
            accessibilityRole={statusRole}
            accessibilityLiveRegion="polite"
            accessibilityLabel={`Voice submit state: ${voiceSubmitState}. ${voiceSubmitMessage ?? "Ready to review."}`}
            style={[
              styles.voiceSubmitStatusBox,
              statusRole === "alert" ? styles.voiceSubmitStatusWarning : null,
            ]}
          >
            <Text style={styles.reviewLabel}>Voice submit state</Text>
            <Text style={styles.helperText}>
              {voiceSubmitMessage ?? "Review the summary before any voice submit can happen."}
            </Text>
          </View>

          <View style={styles.voiceSubmitActionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Review for voice submit"
              accessibilityHint="Builds a current read-only summary before any voice submit can happen."
              onPress={handlePrepareVoiceSubmitReview}
              style={({ pressed }) => [
                styles.voiceSubmitSecondaryButton,
                pressed ? styles.voiceSubmitButtonPressed : null,
              ]}
            >
              <Text style={styles.voiceSubmitSecondaryButtonText}>Review for voice submit</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Listen for voice submit confirmation"
              accessibilityHint="Listens once for yes submit, confirm submit, or submit check-in."
              accessibilityState={{
                disabled: !canListen,
                busy: isVoiceSubmitListening || undefined,
              }}
              disabled={!canListen}
              onPress={() => {
                void handleListenForVoiceSubmitConfirmation();
              }}
              style={({ pressed }) => [
                styles.voiceSubmitSecondaryButton,
                !canListen ? styles.voiceSubmitButtonDisabled : null,
                pressed && canListen ? styles.voiceSubmitButtonPressed : null,
              ]}
            >
              {isVoiceSubmitListening ? (
                <ActivityIndicator size="small" color={tokens.colors.primary} />
              ) : null}
              <Text style={styles.voiceSubmitSecondaryButtonText}>
                Listen for confirmation
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Confirm voice check-in submit"
              accessibilityHint="Submits the reviewed check-in through the same normal submit path."
              accessibilityState={{
                disabled: !canReviewSubmit,
                busy: isSubmitting || undefined,
              }}
              disabled={!canReviewSubmit}
              onPress={submitReviewedVoiceCheckin}
              style={({ pressed }) => [
                styles.voiceSubmitPrimaryButton,
                !canReviewSubmit ? styles.voiceSubmitButtonDisabled : null,
                pressed && canReviewSubmit ? styles.voiceSubmitButtonPressed : null,
              ]}
            >
              <Text style={styles.voiceSubmitPrimaryButtonText}>Confirm submit</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel voice submit"
              accessibilityHint="Clears the current voice submit review without submitting."
              onPress={() => handleCancelVoiceSubmit()}
              style={({ pressed }) => [
                styles.voiceSubmitSecondaryButton,
                pressed ? styles.voiceSubmitButtonPressed : null,
              ]}
            >
              <Text style={styles.voiceSubmitSecondaryButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Card>
    );
  };

  const renderReviewStep = () => (
    <CheckinStepCard
      compact
      title="Final review"
      description="Take a final look before you submit."
      icon="success"
      tone="success"
    >
      <Card
        variant="outlined"
        padding={tokens.spacing.md}
        style={styles.reviewSummaryCard}
      >
        <View style={styles.groupStack}>
          {(support.helpLevel === "urgent" || support.safetyState === "unsafe") ? (
            <View style={styles.reviewAlertBlock}>
              <StatusPill
                label="Immediate follow-up may be triggered"
                variant="warning"
                accessible={false}
              />
              <Text style={styles.helperText}>
                Urgent help requests or feeling unsafe use the same safety routing already
                in place.
              </Text>
            </View>
          ) : null}

          <CheckinReviewCard
            summary={reviewSummary}
            chips={reviewChips}
            notesPreview={notes.trim() ? notes.trim() : undefined}
          />
        </View>
      </Card>

      {renderVoiceSubmitReviewPanel()}

      <View style={styles.reviewRowList}>
        {reviewRows.map((row) => (
          <View key={row.key} style={styles.reviewGridItem}>
            <Text style={styles.reviewLabel}>{row.label}</Text>
            <Text style={styles.reviewValue}>{row.value}</Text>
          </View>
        ))}
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

  const showExpandedDetailAction =
    adaptationDecision?.mode === "shortened" &&
    !shouldShowDailyContext;
  const shellFooterSpacerHeight = tokens.spacing.xxxl * 2 + tokens.spacing.sm;

  const shellHelperContent =
    adaptationMessage ||
    showExpandedDetailAction ||
    submissionRecovery ||
    checkinError.lastError ||
    helperNotice ? (
      <View style={styles.shellHelperStack}>
        {adaptationMessage || showExpandedDetailAction ? (
          <View style={styles.shellHelperIntro}>
            {adaptationMessage ? (
              <Text style={styles.heroAdaptationNote}>{adaptationMessage}</Text>
            ) : null}
            {showExpandedDetailAction ? (
              <View style={styles.shellHelperAction}>
                <SecondaryButton
                  label="Add more detail"
                  onPress={() => {
                    setNotice(null);
                    setShowDailyContext(true);
                  }}
                />
              </View>
            ) : null}
          </View>
        ) : null}

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
      </View>
    ) : null;

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
          <View style={styles.footerBackButtonSlot}>
            <SecondaryButton
              label="Back"
              size="compact"
              disabled={isSubmitting}
              onPress={() => {
                setNotice(null);
                setActiveStep((current) => Math.max(0, current - 1));
              }}
            />
          </View>
          <View style={styles.footerPrimaryButtonSlot}>
            <PrimaryButton
              label={primaryLabel}
              size="compact"
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
          <View style={styles.footerBackButtonSlot}>
            <SecondaryButton
              label="Back"
              size="compact"
              disabled={isSubmitting}
              onPress={() => {
                setNotice(null);
                setActiveStep((current) => Math.max(0, current - 1));
              }}
            />
          </View>
          <View style={styles.footerPrimaryButtonSlot}>
            <PrimaryButton
              label={primaryLabel}
              size="compact"
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
          size="compact"
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

  if (!checkinAvailable && careModeNotice) {
    return (
      <Screen
        scroll={false}
        auditLabel="CheckinScreen"
        banner={<TrustBanner status={trustStatus} offlineMode="onlineOnly" />}
      >
        <CheckinFlowShell
          title="Daily check-in"
          subtitle={`Step 1 of ${CHECKIN_STEPS.length}`}
          currentStepTitle="Check-in unavailable"
          currentStepDescription={careModeNotice.title}
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
              icon: "progress",
              onPress: () => {
                router.push("/(tabs)/progress" as never);
              },
              accessibilityLabel: "Open Progress",
              tone: "muted",
            },
          ]}
          statusContent={
            <View style={styles.heroStatusStack}>
              <View style={styles.heroMetaRow}>
                <StatusPill label={friendlyDate} variant="info" accessible={false} />
                <StatusPill label="Read-only" variant="neutral" accessible={false} />
              </View>
              <TrustCues
                status={trustStatus}
                offlineMode="onlineOnly"
                lastUpdatedLabel={checkinsRefresh.label}
                lastUpdatedAt={checkinsRefresh.lastRefreshedAt}
                showLastUpdated
                showPending
                showSavedLocalHint
              />
            </View>
          }
          helperContent={
            <Banner
              variant="info"
              title={careModeNotice.title}
              message={careModeNotice.message}
            />
          }
          steps={CHECKIN_STEPS}
          activeStep={0}
          onSelectStep={() => undefined}
          footer={
            <View style={styles.footerInner}>
              <PrimaryButton
                label="Back to Today"
                onPress={() => {
                  router.replace("/(tabs)");
                }}
              />
            </View>
          }
          footerSpacerHeight={shellFooterSpacerHeight}
        >
          <EmptyState
            title="Check-ins are not active right now"
            description={careModeNotice.message}
            ctaLabel="View progress"
            onCtaPress={() => {
              router.push("/(tabs)/progress");
            }}
          />
        </CheckinFlowShell>
      </Screen>
    );
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
            <View style={styles.heroStatusStack}>
              <View style={styles.heroMetaRow}>
                <StatusPill label={friendlyDate} variant="info" accessible={false} />
                <StatusPill label="Safety routing on" variant="success" accessible={false} />
                {adaptationDecision?.mode === "shortened" ? (
                  <StatusPill label="Shorter today" variant="neutral" accessible={false} />
                ) : null}
                {adaptationDecision?.mode === "expanded" ? (
                  <StatusPill label="Extra detail today" variant="warning" accessible={false} />
                ) : null}
              </View>
              <TrustCues
                status={trustStatus}
                offlineMode="onlineOnly"
                lastUpdatedLabel={checkinsRefresh.label}
                lastUpdatedAt={checkinsRefresh.lastRefreshedAt}
                showLastUpdated
                showPending
                showSavedLocalHint
              />
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
          footerSpacerHeight={shellFooterSpacerHeight}
          scrollViewRef={scrollViewRef}
        >
          {guidedCheckinPanel}
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
    heroMetaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    heroStatusStack: {
      gap: tokens.spacing.xs,
    },
    heroAdaptationNote: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    shellHelperStack: {
      gap: tokens.spacing.sm,
    },
    shellHelperIntro: {
      gap: tokens.spacing.sm,
    },
    shellHelperAction: {
      alignSelf: "flex-start",
    },
    sectionStack: {
      gap: tokens.spacing.md,
    },
    sectionStackCompact: {
      flex: 1,
      gap: tokens.spacing.xs,
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
      minWidth: 0,
      minHeight: 96,
      borderRadius: tokens.radius.xl,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: "rgba(255, 255, 255, 0.9)",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: tokens.spacing.xs,
      paddingVertical: tokens.spacing.sm,
      gap: 2,
    },
    fixedChoiceButtonSelected: {
      borderColor: tokens.colors.primary,
      backgroundColor: "#EAF2FF",
      shadowColor: "rgba(47, 111, 237, 0.28)",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 1,
      shadowRadius: 10,
      elevation: 2,
    },
    fixedChoiceEmoji: {
      fontSize: 22,
      lineHeight: 28,
      marginBottom: 2,
      transform: [{ scale: 0.96 }],
    },
    fixedChoiceEmojiSelected: {
      transform: [{ scale: 1.08 }],
    },
    fixedChoiceValue: {
      color: tokens.colors.text,
      fontSize: 23,
      lineHeight: 27,
      fontWeight: tokens.typography.weights.semibold,
    },
    fixedChoiceValueSelected: {
      color: tokens.colors.primary,
    },
    fixedChoiceCaption: {
      color: tokens.colors.textMuted,
      fontSize: 12,
      lineHeight: 16,
      textAlign: "center",
      fontWeight: tokens.typography.weights.medium,
    },
    fixedChoiceCaptionSelected: {
      color: tokens.colors.primary,
    },
    choiceChip: {
      minWidth: 56,
      minHeight: 44,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: "rgba(183, 199, 211, 0.9)",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      gap: 2,
      backgroundColor: "rgba(255, 255, 255, 0.92)",
    },
    choiceChipSelected: {
      backgroundColor: "#EAF2FF",
      borderColor: tokens.colors.primary,
      shadowColor: "rgba(47, 111, 237, 0.18)",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 1,
      shadowRadius: 8,
      elevation: 1,
    },
    choiceChipPressed: {
      opacity: 0.82,
    },
    choiceChipEmoji: {
      fontSize: 20,
      lineHeight: 24,
      marginBottom: 1,
    },
    choiceChipEmojiSelected: {
      transform: [{ scale: 1.06 }],
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
      borderColor: "rgba(183, 199, 211, 0.9)",
      borderRadius: tokens.radius.xl,
      paddingHorizontal: tokens.spacing.lg,
      paddingVertical: tokens.spacing.md,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      color: tokens.colors.text,
      backgroundColor: "rgba(255, 255, 255, 0.88)",
    },
    stepperWrapper: {
      gap: tokens.spacing.sm,
    },
    stepperValueWrap: {
      flex: 1,
      minHeight: 72,
      borderRadius: tokens.radius.xl,
      borderWidth: 1,
      borderColor: "rgba(183, 199, 211, 0.92)",
      backgroundColor: "rgba(255, 255, 255, 0.9)",
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
    clearOptionalButtonDisabled: {
      opacity: 0.5,
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
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: "rgba(183, 199, 211, 0.92)",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255, 255, 255, 0.92)",
    },
    stepperButtonPressed: {
      opacity: 0.8,
    },
    stepperButtonDisabled: {
      opacity: 0.5,
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
    groupStack: {
      gap: tokens.spacing.md,
    },
    primaryGroupCard: {
      backgroundColor: "rgba(255, 255, 255, 0.9)",
      borderColor: "rgba(196, 211, 222, 0.9)",
      borderRadius: tokens.radius.xl,
      shadowColor: "rgba(24, 48, 66, 0.06)",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 1,
      shadowRadius: 18,
      elevation: 1,
    },
    secondaryGroupCard: {
      backgroundColor: "rgba(255, 252, 247, 0.9)",
      borderColor: "rgba(216, 205, 185, 0.72)",
      borderRadius: tokens.radius.xl,
    },
    safetyGroupCard: {
      backgroundColor: "rgba(255, 247, 232, 0.95)",
      borderColor: "rgba(201, 137, 43, 0.24)",
      borderRadius: tokens.radius.xl,
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
    supportSwitchRow: {
      minHeight: 64,
      borderWidth: 1,
      borderColor: "rgba(196, 211, 222, 0.9)",
      borderRadius: tokens.radius.xl,
      paddingHorizontal: tokens.spacing.lg,
      paddingVertical: tokens.spacing.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
      backgroundColor: "rgba(255, 255, 255, 0.92)",
    },
    moodPreviewCard: {
      borderWidth: 1,
      borderColor: "rgba(47, 143, 131, 0.28)",
      borderRadius: tokens.radius.xl,
      backgroundColor: "rgba(234, 247, 244, 0.76)",
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
    },
    moodPreviewEmoji: {
      width: 40,
      height: 40,
      borderRadius: 20,
      textAlign: "center",
      lineHeight: 36,
      fontSize: 24,
      backgroundColor: "rgba(255, 255, 255, 0.78)",
      overflow: "hidden",
    },
    moodPreviewCopy: {
      flex: 1,
      gap: 1,
    },
    moodPreviewLabel: {
      color: tokens.colors.textMuted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: tokens.typography.weights.medium,
    },
    moodPreviewValue: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    supportSwitchCopy: {
      flex: 1,
      gap: 2,
      marginRight: tokens.spacing.sm,
    },
    supportSwitchTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    supportSwitchDescription: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    reviewSummaryCard: {
      backgroundColor: tokens.colors.surfaceElevated,
      borderColor: tokens.colors.border,
    },
    voiceSubmitCard: {
      backgroundColor: tokens.colors.surface,
      borderColor: tokens.colors.primary,
    },
    voiceSubmitSummaryBox: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surfaceSubtle,
      padding: tokens.spacing.md,
    },
    voiceSubmitStatusBox: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.surfaceSubtle,
      padding: tokens.spacing.md,
      gap: 2,
    },
    voiceSubmitStatusWarning: {
      borderColor: tokens.colors.warning,
      backgroundColor: tokens.colors.warningSoft,
    },
    voiceSubmitActionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    voiceSubmitPrimaryButton: {
      minHeight: 48,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      alignItems: "center",
      justifyContent: "center",
    },
    voiceSubmitPrimaryButtonText: {
      color: tokens.colors.primaryTextOn,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    voiceSubmitSecondaryButton: {
      minHeight: 48,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: tokens.spacing.xs,
    },
    voiceSubmitSecondaryButtonText: {
      color: tokens.colors.primary,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    voiceSubmitButtonDisabled: {
      opacity: 0.5,
    },
    voiceSubmitButtonPressed: {
      opacity: 0.84,
    },
    reviewAlertBlock: {
      gap: tokens.spacing.xs,
    },
    reviewRowList: {
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
      gap: tokens.spacing.md,
      alignItems: "center",
    },
    footerBackButtonSlot: {
      flex: 0.82,
      minWidth: 0,
    },
    footerPrimaryButtonSlot: {
      flex: 1.18,
      minWidth: 0,
    },
  });
}
