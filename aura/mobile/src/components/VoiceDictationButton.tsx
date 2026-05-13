import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionErrorCode,
  type ExpoSpeechRecognitionErrorEvent,
  type ExpoSpeechRecognitionResultEvent,
} from "expo-speech-recognition";
import React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { getPressFeedbackStyle } from "@/src/components/Motion";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { useTokens } from "@/src/theme/tokens";

type VoiceDictationStatus =
  | "idle"
  | "requestingPermission"
  | "listening"
  | "processing"
  | "error"
  | "unavailable";

type VoiceDictationButtonProps = {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  locale?: string;
  onStatusChange?: (status: VoiceDictationStatus) => void;
  onDeviceOnly?: boolean;
  testID?: string;
};

const IDLE_HINT = "Adds spoken words to this text field for review before sending.";
const LISTENING_HINT = "Stops listening and adds the transcript for review.";

export function isVoiceDictationRuntimeSupported(): boolean {
  return Platform.OS !== "web";
}

function toFriendlySpeechError(error: ExpoSpeechRecognitionErrorCode): {
  status: "error" | "unavailable";
  message: string;
} {
  switch (error) {
    case "not-allowed":
      return {
        status: "error",
        message:
          "Microphone permission was denied. Enable microphone and speech recognition access in system settings to use dictation.",
      };
    case "service-not-allowed":
    case "language-not-supported":
      return {
        status: "unavailable",
        message:
          "Voice dictation is not available on this device. Type your message instead.",
      };
    case "network":
      return {
        status: "error",
        message:
          "Voice dictation needs an available speech recognizer. Nothing was sent.",
      };
    case "no-speech":
    case "speech-timeout":
      return {
        status: "error",
        message: "No speech was heard. Try again, or type your text.",
      };
    case "interrupted":
    case "aborted":
      return {
        status: "error",
        message: "Voice dictation stopped before a transcript was ready.",
      };
    default:
      return {
        status: "error",
        message: "Voice dictation could not finish. Nothing was sent.",
      };
  }
}

export function VoiceDictationButton({
  onTranscript,
  disabled = false,
  locale = "en-US",
  onStatusChange,
  onDeviceOnly = true,
  testID,
}: VoiceDictationButtonProps) {
  const tokens = useTokens();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const [status, setStatus] = useState<VoiceDictationStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const activeRef = useRef(false);
  const statusRef = useRef<VoiceDictationStatus>("idle");
  const runtimeSupported = isVoiceDictationRuntimeSupported();

  const setVoiceStatus = useCallback(
    (nextStatus: VoiceDictationStatus, nextMessage: string | null = null) => {
      statusRef.current = nextStatus;
      setStatus(nextStatus);
      setMessage(nextMessage);
      onStatusChange?.(nextStatus);
    },
    [onStatusChange],
  );

  useEffect(() => {
    if (!runtimeSupported) {
      return undefined;
    }

    const startListener = ExpoSpeechRecognitionModule.addListener("start", () => {
      activeRef.current = true;
      setVoiceStatus("listening", null);
    });
    const endListener = ExpoSpeechRecognitionModule.addListener("end", () => {
      activeRef.current = false;
      if (statusRef.current === "error" || statusRef.current === "unavailable") {
        return;
      }
      setVoiceStatus("idle", null);
    });
    const resultListener = ExpoSpeechRecognitionModule.addListener(
      "result",
      (event: ExpoSpeechRecognitionResultEvent) => {
        if (!activeRef.current) {
          return;
        }

        if (!event.isFinal) {
          return;
        }

        const transcript = event.results
          .map((result) => result.transcript.trim())
          .find((candidate) => candidate.length > 0);

        if (!transcript) {
          setVoiceStatus("error", "No speech was heard. Try again, or type your text.");
          return;
        }

        setVoiceStatus("processing", null);
        onTranscript(transcript);
      },
    );
    const errorListener = ExpoSpeechRecognitionModule.addListener(
      "error",
      (event: ExpoSpeechRecognitionErrorEvent) => {
        activeRef.current = false;
        const friendly = toFriendlySpeechError(event.error);
        setVoiceStatus(friendly.status, friendly.message);
      },
    );
    const nomatchListener = ExpoSpeechRecognitionModule.addListener("nomatch", () => {
      setVoiceStatus("error", "No speech was heard. Try again, or type your text.");
    });
    const appStateListener = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" || !activeRef.current) {
        return;
      }

      ExpoSpeechRecognitionModule.abort();
      activeRef.current = false;
      setVoiceStatus("error", "Voice dictation stopped before a transcript was ready.");
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
    };
  }, [onTranscript, runtimeSupported, setVoiceStatus]);

  const isBusy = status === "requestingPermission" || status === "listening" || status === "processing";
  const isListening = status === "listening";
  const isUnavailable = status === "unavailable";
  const isDisabled = disabled || isUnavailable || status === "requestingPermission" || status === "processing";
  const accessibilityLabel = isListening ? "Stop voice dictation" : "Start voice dictation";
  const accessibilityHint = isListening ? LISTENING_HINT : IDLE_HINT;

  const handlePress = useCallback(async () => {
    if (disabled || status === "requestingPermission" || status === "processing") {
      return;
    }

    if (isListening) {
      setVoiceStatus("processing", null);
      ExpoSpeechRecognitionModule.stop();
      return;
    }

    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setVoiceStatus(
        "unavailable",
        "Voice dictation is not available on this device. Type your message instead.",
      );
      return;
    }

    if (onDeviceOnly && !ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
      setVoiceStatus(
        "unavailable",
        "On-device voice dictation is not available on this device. Type your text instead.",
      );
      return;
    }

    setVoiceStatus("requestingPermission", null);
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setVoiceStatus(
        "error",
        "Microphone permission was denied. Enable microphone and speech recognition access in system settings to use dictation.",
      );
      return;
    }

    try {
      activeRef.current = true;
      ExpoSpeechRecognitionModule.start({
        lang: locale,
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
        requiresOnDeviceRecognition: onDeviceOnly,
        recordingOptions: {
          persist: false,
        },
      });
    } catch {
      activeRef.current = false;
      setVoiceStatus("error", "Voice dictation could not start. Nothing was sent.");
    }
  }, [disabled, isListening, locale, onDeviceOnly, setVoiceStatus, status]);

  if (!runtimeSupported) {
    return null;
  }

  return (
    <View style={styles.wrapper}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{
          disabled: isDisabled,
          busy: isBusy || undefined,
        }}
        disabled={isDisabled}
        onPress={handlePress}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={({ pressed }) => [
          styles.button,
          isListening ? styles.buttonActive : null,
          isDisabled ? styles.buttonDisabled : null,
          pressed && !isDisabled ? getPressFeedbackStyle(reduceMotion, 0.84) : null,
        ]}
      >
        {status === "requestingPermission" || status === "processing" ? (
          <ActivityIndicator
            size="small"
            color={isListening ? tokens.colors.primaryTextOn : tokens.colors.primary}
          />
        ) : (
          <View accessible={false} importantForAccessibility="no-hide-descendants">
            <MaterialCommunityIcons
              name={isListening ? "microphone-off" : "microphone"}
              size={20}
              color={isListening ? tokens.colors.primaryTextOn : tokens.colors.primary}
            />
          </View>
        )}
      </Pressable>
      {message ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={[
            styles.message,
            status === "unavailable" ? styles.unavailableMessage : styles.errorMessage,
          ]}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    wrapper: {
      alignItems: "center",
      gap: tokens.spacing.xs,
      maxWidth: 180,
    },
    button: {
      width: 48,
      height: 48,
      minWidth: 48,
      minHeight: 48,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonActive: {
      backgroundColor: tokens.colors.primary,
      borderColor: tokens.colors.primary,
    },
    buttonDisabled: {
      opacity: 0.55,
    },
    message: {
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      textAlign: "center",
      maxWidth: 180,
    },
    errorMessage: {
      color: tokens.colors.danger,
    },
    unavailableMessage: {
      color: tokens.colors.textMuted,
    },
  });
}
