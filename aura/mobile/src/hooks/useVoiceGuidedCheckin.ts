import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionErrorCode,
  type ExpoSpeechRecognitionErrorEvent,
  type ExpoSpeechRecognitionResultEvent,
} from "expo-speech-recognition";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";

import { stopReadAloud } from "@/src/utils/readAloud";
import type {
  GuidedCheckinStep,
  GuidedCheckinStepId,
  GuidedCheckinStepValue,
} from "@/src/utils/guidedCheckinSteps";
import type { GuidedCheckinParseResult } from "@/src/utils/guidedCheckinParser";

export type VoiceGuidedCheckinStatus =
  | "idle"
  | "askingQuestion"
  | "listening"
  | "interpreting"
  | "awaitingConfirmation"
  | "confirmed"
  | "skipped"
  | "error"
  | "review"
  | "complete";

export type GuidedCheckinReviewItem = {
  stepId: GuidedCheckinStepId;
  destinationLabel: string;
  valueLabel: string;
  transcript?: string;
  status: "confirmed" | "skipped";
};

type UseVoiceGuidedCheckinOptions = {
  steps: GuidedCheckinStep[];
  locale?: string;
};

const SAFE_GUIDANCE =
  "If this feels urgent or you feel unsafe, use the Safety screen or contact local emergency services. This voice guide will not submit or create an alert.";

function toFriendlySpeechError(error: ExpoSpeechRecognitionErrorCode): string {
  switch (error) {
    case "not-allowed":
      return "Microphone permission was denied. You can keep filling the check-in manually.";
    case "service-not-allowed":
    case "language-not-supported":
      return "Voice-guided check-in is not available on this device. You can keep filling the form manually.";
    case "network":
      return "Voice-guided check-in needs an available speech recognizer. Nothing was written.";
    case "no-speech":
    case "speech-timeout":
      return "No speech was heard. Try again, skip, or edit the field manually.";
    case "interrupted":
    case "aborted":
      return "Voice-guided listening stopped before an answer was ready.";
    default:
      return "Voice-guided check-in could not finish. Nothing was written.";
  }
}

function isEmergencyLikeTranscript(transcript: string): boolean {
  return /\b(emergency|urgent|unsafe|ambulance|911|999|112|chest pain|cannot breathe|can't breathe|bleeding|fell|fall|dizzy)\b/i.test(
    transcript,
  );
}

export function useVoiceGuidedCheckin({
  steps,
  locale = "en-US",
}: UseVoiceGuidedCheckinOptions) {
  const [status, setStatus] = useState<VoiceGuidedCheckinStatus>("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [parseResult, setParseResult] =
    useState<GuidedCheckinParseResult<GuidedCheckinStepValue> | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reviewItems, setReviewItems] = useState<GuidedCheckinReviewItem[]>([]);
  const activeRef = useRef(false);
  const statusRef = useRef<VoiceGuidedCheckinStatus>("idle");
  const stepsRef = useRef(steps);
  const stepIndexRef = useRef(stepIndex);

  const currentStep = steps[stepIndex] ?? null;

  const setGuidedStatus = useCallback(
    (nextStatus: VoiceGuidedCheckinStatus, nextMessage: string | null = null) => {
      statusRef.current = nextStatus;
      setStatus(nextStatus);
      setMessage(nextMessage);
    },
    [],
  );

  useEffect(() => {
    stepsRef.current = steps;
    setStepIndex((current) => Math.min(current, Math.max(0, steps.length - 1)));
  }, [steps]);

  useEffect(() => {
    stepIndexRef.current = stepIndex;
  }, [stepIndex]);

  const begin = useCallback(() => {
    setStepIndex(0);
    setTranscript("");
    setParseResult(null);
    setReviewItems([]);
    setGuidedStatus(stepsRef.current.length > 0 ? "askingQuestion" : "complete", null);
  }, [setGuidedStatus]);

  const advance = useCallback(() => {
    setTranscript("");
    setParseResult(null);
    setMessage(null);
    setStepIndex((current) => {
      const next = current + 1;
      if (next >= stepsRef.current.length) {
        setGuidedStatus("review", "Review the guided answers below. Submit check-in is still manual.");
        return current;
      }
      setGuidedStatus("askingQuestion", null);
      return next;
    });
  }, [setGuidedStatus]);

  const handleTranscript = useCallback(
    (nextTranscript: string) => {
      const step = stepsRef.current[stepIndexRef.current];
      if (!step) {
        return;
      }

      setTranscript(nextTranscript);

      if (step.id !== "notes" && isEmergencyLikeTranscript(nextTranscript)) {
        setParseResult(null);
        setGuidedStatus("error", SAFE_GUIDANCE);
        return;
      }

      setGuidedStatus("interpreting", null);
      const result = step.parse(nextTranscript);
      setParseResult(result);
      if (result.ok) {
        setGuidedStatus("awaitingConfirmation", null);
        return;
      }

      setGuidedStatus("error", result.reason);
    },
    [setGuidedStatus],
  );

  useEffect(() => {
    const startListener = ExpoSpeechRecognitionModule.addListener("start", () => {
      activeRef.current = true;
      setGuidedStatus("listening", "Listening for your answer.");
    });
    const endListener = ExpoSpeechRecognitionModule.addListener("end", () => {
      activeRef.current = false;
      if (statusRef.current === "listening") {
        setGuidedStatus("askingQuestion", null);
      }
    });
    const resultListener = ExpoSpeechRecognitionModule.addListener(
      "result",
      (event: ExpoSpeechRecognitionResultEvent) => {
        if (!event.isFinal) {
          return;
        }

        activeRef.current = false;
        const nextTranscript = event.results
          .map((result) => result.transcript.trim())
          .find((candidate) => candidate.length > 0);

        if (!nextTranscript) {
          setGuidedStatus("error", "No speech was heard. Try again, skip, or edit manually.");
          return;
        }

        handleTranscript(nextTranscript);
      },
    );
    const errorListener = ExpoSpeechRecognitionModule.addListener(
      "error",
      (event: ExpoSpeechRecognitionErrorEvent) => {
        activeRef.current = false;
        setGuidedStatus("error", toFriendlySpeechError(event.error));
      },
    );
    const nomatchListener = ExpoSpeechRecognitionModule.addListener("nomatch", () => {
      activeRef.current = false;
      setGuidedStatus("error", "No clear answer was heard. Try again, skip, or edit manually.");
    });
    const appStateListener = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        return;
      }

      if (activeRef.current) {
        ExpoSpeechRecognitionModule.abort();
        activeRef.current = false;
        setGuidedStatus("error", "Voice-guided listening stopped.");
      }
      void stopReadAloud();
    });

    return () => {
      startListener.remove();
      endListener.remove();
      resultListener.remove();
      errorListener.remove();
      nomatchListener.remove();
      appStateListener.remove();
      if (activeRef.current) {
        ExpoSpeechRecognitionModule.abort();
        activeRef.current = false;
      }
      void stopReadAloud();
    };
  }, [handleTranscript, setGuidedStatus]);

  const listen = useCallback(async () => {
    if (!currentStep) {
      return;
    }

    if (statusRef.current === "listening") {
      ExpoSpeechRecognitionModule.stop();
      return;
    }

    await stopReadAloud();

    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setGuidedStatus(
        "error",
        "Voice-guided check-in is not available on this device. You can keep filling the form manually.",
      );
      return;
    }

    if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
      setGuidedStatus(
        "error",
        "On-device voice-guided check-in is not available on this device. You can keep filling the form manually.",
      );
      return;
    }

    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setGuidedStatus(
        "error",
        "Microphone permission was denied. You can keep filling the check-in manually.",
      );
      return;
    }

    setTranscript("");
    setParseResult(null);
    try {
      activeRef.current = true;
      ExpoSpeechRecognitionModule.start({
        lang: locale,
        continuous: false,
        interimResults: true,
        maxAlternatives: 1,
        requiresOnDeviceRecognition: true,
        recordingOptions: {
          persist: false,
        },
      });
    } catch {
      activeRef.current = false;
      setGuidedStatus("error", "Voice-guided listening could not start. Nothing was written.");
    }
  }, [currentStep, locale, setGuidedStatus]);

  const retry = useCallback(() => {
    setTranscript("");
    setParseResult(null);
    setGuidedStatus("askingQuestion", null);
  }, [setGuidedStatus]);

  const skip = useCallback(() => {
    const step = stepsRef.current[stepIndexRef.current];
    if (step) {
      setReviewItems((current) => [
        ...current,
        {
          stepId: step.id,
          destinationLabel: step.destinationLabel,
          valueLabel: "Skipped",
          status: "skipped",
        },
      ]);
    }
    setGuidedStatus("skipped", null);
    advance();
  }, [advance, setGuidedStatus]);

  const confirm = useCallback(() => {
    const step = stepsRef.current[stepIndexRef.current];
    const result = parseResult;
    if (!step || !result?.ok) {
      return;
    }

    setReviewItems((current) => [
      ...current,
      {
        stepId: step.id,
        destinationLabel: step.destinationLabel,
        valueLabel: step.formatValue(result.value),
        transcript,
        status: "confirmed",
      },
    ]);
    setGuidedStatus("confirmed", null);
    advance();
  }, [advance, parseResult, setGuidedStatus, transcript]);

  const complete = useCallback(() => {
    setGuidedStatus("complete", "Guided check-in complete. Review and submit manually when ready.");
  }, [setGuidedStatus]);

  return useMemo(
    () => ({
      status,
      currentStep,
      stepIndex,
      totalSteps: steps.length,
      transcript,
      parseResult,
      message,
      reviewItems,
      begin,
      listen,
      retry,
      skip,
      confirm,
      complete,
    }),
    [
      begin,
      complete,
      confirm,
      currentStep,
      listen,
      message,
      parseResult,
      retry,
      reviewItems,
      skip,
      status,
      stepIndex,
      steps.length,
      transcript,
    ],
  );
}
