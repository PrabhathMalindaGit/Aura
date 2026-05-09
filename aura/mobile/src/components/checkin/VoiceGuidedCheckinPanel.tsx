import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { ReadAloudButton } from "@/src/components/ReadAloudButton";
import { useVoiceGuidedCheckin } from "@/src/hooks/useVoiceGuidedCheckin";
import { useTokens } from "@/src/theme/tokens";
import {
  getGuidedCheckinSteps,
  type GuidedCheckinStepId,
  type GuidedCheckinStepValue,
} from "@/src/utils/guidedCheckinSteps";
import type { GuidedCheckinMedicationStatus } from "@/src/utils/guidedCheckinParser";

type VoiceGuidedCheckinPanelProps = {
  initialExpanded?: boolean;
  beginOnMount?: boolean;
  includeSleep: boolean;
  onConfirmPain: (value: number) => void;
  onConfirmMood: (value: number) => void;
  onConfirmExercise: (value: number) => void;
  onConfirmMedicationStatus: (value: GuidedCheckinMedicationStatus) => void;
  onConfirmNotes: (value: string) => void;
  onConfirmSleepHours: (value: number) => void;
  onConfirmSleepQuality: (value: number) => void;
  onEditManually?: (stepId: GuidedCheckinStepId) => void;
  onRequestVoiceSubmitReview?: () => void;
  locale?: string;
  testID?: string;
};

function isMedicationStatus(value: GuidedCheckinStepValue): value is GuidedCheckinMedicationStatus {
  return value === "taken" || value === "missed" || value === "not_applicable";
}

export function VoiceGuidedCheckinPanel({
  initialExpanded = false,
  beginOnMount = false,
  includeSleep,
  onConfirmPain,
  onConfirmMood,
  onConfirmExercise,
  onConfirmMedicationStatus,
  onConfirmNotes,
  onConfirmSleepHours,
  onConfirmSleepQuality,
  onEditManually,
  onRequestVoiceSubmitReview,
  locale,
  testID = "voice-guided-checkin-panel",
}: VoiceGuidedCheckinPanelProps) {
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const [expanded, setExpanded] = useState(initialExpanded);
  const steps = useMemo(() => getGuidedCheckinSteps({ includeSleep }), [includeSleep]);
  const guided = useVoiceGuidedCheckin({ steps, locale });
  const beginGuidedCheckin = guided.begin;
  const result = guided.parseResult;
  const successResult = result?.ok ? result : null;
  const isListening = guided.status === "listening";
  const didBeginFromRouteRef = React.useRef(false);

  React.useEffect(() => {
    if (!initialExpanded) {
      return;
    }

    setExpanded(true);
  }, [initialExpanded]);

  React.useEffect(() => {
    if (!initialExpanded || !beginOnMount || didBeginFromRouteRef.current) {
      return;
    }

    didBeginFromRouteRef.current = true;
    beginGuidedCheckin();
  }, [beginGuidedCheckin, beginOnMount, initialExpanded]);

  const handleToggleExpanded = useCallback(() => {
    setExpanded((current) => {
      const next = !current;
      if (next && guided.status === "idle") {
        guided.begin();
      }
      return next;
    });
  }, [guided]);

  const handleConfirm = useCallback(() => {
    if (!guided.currentStep || !successResult) {
      return;
    }

    const value = successResult.value;
    switch (guided.currentStep.id) {
      case "pain":
        if (typeof value === "number") {
          onConfirmPain(value);
        }
        break;
      case "mood":
        if (typeof value === "number") {
          onConfirmMood(value);
        }
        break;
      case "exercise":
        if (typeof value === "number") {
          onConfirmExercise(value);
        }
        break;
      case "medication":
        if (isMedicationStatus(value)) {
          onConfirmMedicationStatus(value);
        }
        break;
      case "notes":
        if (typeof value === "string") {
          onConfirmNotes(value);
        }
        break;
      case "sleepHours":
        if (typeof value === "number") {
          onConfirmSleepHours(value);
        }
        break;
      case "sleepQuality":
        if (typeof value === "number") {
          onConfirmSleepQuality(value);
        }
        break;
    }

    guided.confirm();
  }, [
    guided,
    onConfirmExercise,
    onConfirmMedicationStatus,
    onConfirmMood,
    onConfirmNotes,
    onConfirmPain,
    onConfirmSleepHours,
    onConfirmSleepQuality,
    successResult,
  ]);

  const handleEditManually = useCallback(() => {
    if (!guided.currentStep) {
      return;
    }

    onEditManually?.(guided.currentStep.id);
  }, [guided.currentStep, onEditManually]);

  return (
    <View testID={testID} style={styles.panel}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          expanded
            ? "Collapse guided check-in voice assist"
            : "Expand guided check-in voice assist"
        }
        accessibilityHint="Shows or hides optional voice guidance for filling this check-in."
        accessibilityState={{ expanded }}
        onPress={handleToggleExpanded}
        style={({ pressed }) => [styles.headerButton, pressed ? styles.pressed : null]}
      >
        <View style={styles.headerIcon} accessible={false} importantForAccessibility="no-hide-descendants">
          <MaterialCommunityIcons
            name="microphone-message"
            size={22}
            color={tokens.colors.primary}
          />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Voice-guided check-in</Text>
          <Text style={styles.subtitle}>
            Optional. Review each answer before it fills the form.
          </Text>
        </View>
        <MaterialCommunityIcons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={22}
          color={tokens.colors.textMuted}
        />
      </Pressable>

      {expanded ? (
        <View style={styles.body}>
          <Text accessibilityLiveRegion="polite" style={styles.statusText}>
            {guided.message ??
              (guided.status === "review" || guided.status === "complete"
                ? "Guided answers are listed below. Submit check-in remains manual."
                : `Question ${Math.min(guided.stepIndex + 1, guided.totalSteps)} of ${guided.totalSteps}.`)}
          </Text>

          {guided.currentStep && guided.status !== "review" && guided.status !== "complete" ? (
            <View style={styles.questionCard}>
              <View style={styles.questionHeader}>
                <View style={styles.questionCopy}>
                  <Text style={styles.stepTitle}>{guided.currentStep.title}</Text>
                  <Text style={styles.questionText}>{guided.currentStep.question}</Text>
                  <Text style={styles.helperText}>{guided.currentStep.helperText}</Text>
                </View>
                <ReadAloudButton
                  text={guided.currentStep.readAloudText}
                  label="Read guided question"
                  sourceId={`guided-checkin-${guided.currentStep.id}`}
                  testID={`guided-checkin-${guided.currentStep.id}-read-aloud`}
                />
              </View>

              <View style={styles.actionRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    isListening
                      ? `Stop listening for ${guided.currentStep.title.toLowerCase()}`
                      : `Listen for ${guided.currentStep.title.toLowerCase()}`
                  }
                  accessibilityHint="Starts one voice answer for this check-in field."
                  accessibilityState={{ busy: isListening || undefined, selected: isListening }}
                  onPress={() => {
                    void guided.listen();
                  }}
                  style={({ pressed }) => [
                    styles.primaryAction,
                    isListening ? styles.primaryActionActive : null,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  {isListening ? (
                    <ActivityIndicator size="small" color={tokens.colors.primaryTextOn} />
                  ) : (
                    <MaterialCommunityIcons
                      name="microphone"
                      size={18}
                      color={tokens.colors.primaryTextOn}
                    />
                  )}
                  <Text style={styles.primaryActionText}>
                    {isListening ? "Stop listening" : "Listen"}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Skip guided question"
                  accessibilityHint="Moves to the next guided question without writing anything."
                  onPress={guided.skip}
                  style={({ pressed }) => [styles.secondaryAction, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.secondaryActionText}>Skip</Text>
                </Pressable>
              </View>

              {guided.transcript ? (
                <View style={styles.resultBox}>
                  <Text style={styles.resultLabel}>Transcript</Text>
                  <Text selectable style={styles.resultText}>
                    {guided.transcript}
                  </Text>
                </View>
              ) : null}

              {successResult && guided.currentStep ? (
                <View style={styles.resultBox}>
                  <Text style={styles.resultLabel}>Interpreted value</Text>
                  <Text style={styles.resultText}>
                    {guided.currentStep.formatValue(successResult.value)}
                  </Text>
                  <Text style={styles.helperText}>
                    Confidence: {successResult.confidence}. Destination:{" "}
                    {guided.currentStep.destinationLabel}.
                  </Text>
                </View>
              ) : null}

              {guided.status === "error" ? (
                <View style={styles.warningBox}>
                  <Text accessibilityRole="alert" style={styles.warningText}>
                    {guided.message ?? "That answer was unclear. Try again or edit manually."}
                  </Text>
                </View>
              ) : null}

              <View style={styles.actionRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Confirm guided answer"
                  accessibilityHint="Writes this reviewed answer to the existing check-in draft field."
                  accessibilityState={{ disabled: !successResult }}
                  disabled={!successResult}
                  onPress={handleConfirm}
                  style={({ pressed }) => [
                    styles.confirmAction,
                    !successResult ? styles.disabledAction : null,
                    pressed && successResult ? styles.pressed : null,
                  ]}
                >
                  <Text style={styles.confirmActionText}>Confirm</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retry guided answer"
                  accessibilityHint="Clears this voice answer without writing anything."
                  onPress={guided.retry}
                  style={({ pressed }) => [styles.secondaryAction, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.secondaryActionText}>Retry</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit guided answer manually"
                  accessibilityHint="Leaves the guided answer unwritten so you can use the manual form."
                  onPress={handleEditManually}
                  style={({ pressed }) => [styles.secondaryAction, pressed ? styles.pressed : null]}
                >
                  <Text style={styles.secondaryActionText}>Edit manually</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {guided.reviewItems.length > 0 ? (
            <View style={styles.reviewList}>
              <Text style={styles.reviewTitle}>Guided review</Text>
              {guided.reviewItems.map((item, index) => (
                <View key={`${item.stepId}-${index}`} style={styles.reviewItem}>
                  <Text style={styles.resultLabel}>{item.destinationLabel}</Text>
                  <Text style={styles.resultText}>{item.valueLabel}</Text>
                  {item.transcript ? (
                    <Text selectable style={styles.helperText}>
                      Heard: {item.transcript}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          {guided.status === "review" ? (
            <View style={styles.actionRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Complete guided check-in"
                accessibilityHint="Closes the guided flow. Submit check-in remains a separate manual action."
                onPress={guided.complete}
                style={({ pressed }) => [styles.secondaryAction, pressed ? styles.pressed : null]}
              >
                <Text style={styles.secondaryActionText}>Done reviewing</Text>
              </Pressable>
              {onRequestVoiceSubmitReview ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Review for voice submit"
                  accessibilityHint="Opens the screen-owned final review before any check-in can be submitted."
                  onPress={onRequestVoiceSubmitReview}
                  style={({ pressed }) => [
                    styles.secondaryAction,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Text style={styles.secondaryActionText}>Review for voice submit</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {onRequestVoiceSubmitReview && guided.status === "review" ? (
            <Text style={styles.helperText}>
              Submit check-in still uses the main Review step.
            </Text>
          ) : null}

          <Text style={styles.privacyText}>
            Voice guidance does not submit this check-in. Use headphones or stop read-aloud
            if others can hear private health information.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    panel: {
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
      overflow: "hidden",
      ...tokens.elevation.card,
    },
    headerButton: {
      minHeight: 72,
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.md,
      padding: tokens.spacing.md,
    },
    headerIcon: {
      width: 44,
      height: 44,
      borderRadius: tokens.radius.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.colors.primarySoft,
    },
    headerCopy: {
      flex: 1,
      gap: 2,
    },
    title: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    subtitle: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    body: {
      borderTopWidth: 1,
      borderTopColor: tokens.colors.border,
      padding: tokens.spacing.md,
      gap: tokens.spacing.md,
      backgroundColor: tokens.colors.surfaceElevated,
    },
    statusText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    questionCard: {
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
      padding: tokens.spacing.md,
      gap: tokens.spacing.md,
    },
    questionHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: tokens.spacing.md,
    },
    questionCopy: {
      flex: 1,
      gap: tokens.spacing.xs,
    },
    stepTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    questionText: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    helperText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    actionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    primaryAction: {
      minHeight: 48,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: tokens.spacing.xs,
    },
    primaryActionActive: {
      backgroundColor: tokens.colors.danger,
    },
    primaryActionText: {
      color: tokens.colors.primaryTextOn,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    secondaryAction: {
      minHeight: 48,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      alignItems: "center",
      justifyContent: "center",
    },
    secondaryActionText: {
      color: tokens.colors.primary,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    confirmAction: {
      minHeight: 48,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.success,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      alignItems: "center",
      justifyContent: "center",
    },
    confirmActionText: {
      color: tokens.colors.primaryTextOn,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    disabledAction: {
      opacity: 0.5,
    },
    resultBox: {
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surfaceSubtle,
      padding: tokens.spacing.md,
      gap: tokens.spacing.xs,
    },
    resultLabel: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    resultText: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    warningBox: {
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.warning,
      backgroundColor: tokens.colors.warningSoft,
      padding: tokens.spacing.md,
    },
    warningText: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    reviewList: {
      gap: tokens.spacing.sm,
    },
    reviewTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    reviewItem: {
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
      padding: tokens.spacing.md,
      gap: tokens.spacing.xs,
    },
    privacyText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    pressed: {
      opacity: 0.84,
    },
  });
}
