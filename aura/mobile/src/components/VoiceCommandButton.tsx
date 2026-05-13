import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionErrorCode,
  type ExpoSpeechRecognitionErrorEvent,
  type ExpoSpeechRecognitionResultEvent,
} from "expo-speech-recognition";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from "react-native";

import { getPressFeedbackStyle } from "@/src/components/Motion";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { useTokens } from "@/src/theme/tokens";
import { stopReadAloud } from "@/src/utils/readAloud";
import {
  parseVoiceCommand,
  SUPPORTED_VOICE_COMMANDS,
  type VoiceCommandRoute,
} from "@/src/utils/voiceCommands";

type VoiceCommandStatus =
  | "idle"
  | "requestingPermission"
  | "listening"
  | "opening"
  | "help"
  | "unsupported"
  | "error"
  | "unavailable";

type VoiceCommandButtonProps = {
  onNavigate: (route: VoiceCommandRoute) => void;
  onGoBack: () => void;
  disabled?: boolean;
  locale?: string;
  testID?: string;
};

const ACCESSIBILITY_HINT = "Lets you open app screens using supported voice commands.";
const UNSUPPORTED_MESSAGE =
  "Command not supported. Voice commands can only open screens or stop reading.";
const CLINICAL_GUIDANCE_MESSAGE =
  " Use Chat, Check-in, or Safety guidance manually if you need to share symptoms.";
const TRANSIENT_MESSAGE_MS = 4000;
const TRANSIENT_MESSAGE_STATUSES: VoiceCommandStatus[] = [
  "unsupported",
  "unavailable",
  "error",
];

function toFriendlySpeechError(error: ExpoSpeechRecognitionErrorCode): {
  status: "error" | "unavailable";
  message: string;
} {
  switch (error) {
    case "not-allowed":
      return {
        status: "error",
        message:
          "Microphone permission was denied. Enable microphone and speech recognition access in system settings to use voice commands.",
      };
    case "service-not-allowed":
    case "language-not-supported":
      return {
        status: "unavailable",
        message: "Voice commands are not available on this device.",
      };
    case "network":
      return {
        status: "error",
        message: "Voice commands need an available speech recognizer. Nothing was opened.",
      };
    case "no-speech":
    case "speech-timeout":
      return {
        status: "error",
        message: "No supported command was heard. Try again or open the screen manually.",
      };
    case "interrupted":
    case "aborted":
      return {
        status: "error",
        message: "Voice command listening stopped.",
      };
    default:
      return {
        status: "error",
        message: "Voice command could not finish. Nothing was opened.",
      };
  }
}

function isClinicalLikeTranscript(transcript: string): boolean {
  return /\b(pain|hurt|unsafe|emergency|dizzy|fall|fell|bleeding|chest|breath|symptom|medication)\b/i.test(
    transcript,
  );
}

function formatOpeningMessage(command: string): string {
  const target = command.replace(/^open\s+/, "").trim();
  return target ? `Opening ${target}.` : "Opening screen.";
}

export function VoiceCommandButton({
  onNavigate,
  onGoBack,
  disabled = false,
  locale = "en-US",
  testID = "voice-command-button",
}: VoiceCommandButtonProps) {
  const tokens = useTokens();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const [status, setStatus] = useState<VoiceCommandStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const activeRef = useRef(false);
  const statusRef = useRef<VoiceCommandStatus>("idle");

  const setVoiceCommandStatus = useCallback(
    (nextStatus: VoiceCommandStatus, nextMessage: string | null = null) => {
      statusRef.current = nextStatus;
      setStatus(nextStatus);
      setMessage(nextMessage);
    },
    [],
  );

  const handleFinalTranscript = useCallback(
    async (transcript: string) => {
      activeRef.current = false;
      const result = parseVoiceCommand(transcript);

      if (result.type === "navigation") {
        setShowHelp(false);
        setVoiceCommandStatus("opening", formatOpeningMessage(result.command));
        onNavigate(result.route);
        return;
      }

      if (result.type === "goBack") {
        setShowHelp(false);
        setVoiceCommandStatus("opening", "Going back.");
        onGoBack();
        return;
      }

      if (result.type === "stopReading") {
        setShowHelp(false);
        try {
          await stopReadAloud();
          setVoiceCommandStatus("idle", "Read-aloud stopped.");
        } catch {
          setVoiceCommandStatus("error", "Read-aloud could not be stopped.");
        }
        return;
      }

      if (result.type === "help") {
        setShowHelp(true);
        setVoiceCommandStatus("help", "Supported voice commands are shown.");
        return;
      }

      setShowHelp(false);
      setVoiceCommandStatus(
        "unsupported",
        `${UNSUPPORTED_MESSAGE}${isClinicalLikeTranscript(transcript) ? CLINICAL_GUIDANCE_MESSAGE : ""}`,
      );
    },
    [onGoBack, onNavigate, setVoiceCommandStatus],
  );

  useEffect(() => {
    const startListener = ExpoSpeechRecognitionModule.addListener("start", () => {
      activeRef.current = true;
      setVoiceCommandStatus("listening", "Listening for a supported voice command.");
    });
    const endListener = ExpoSpeechRecognitionModule.addListener("end", () => {
      activeRef.current = false;
      if (
        statusRef.current === "error" ||
        statusRef.current === "unavailable" ||
        statusRef.current === "opening" ||
        statusRef.current === "unsupported" ||
        statusRef.current === "help"
      ) {
        return;
      }
      setVoiceCommandStatus("idle", null);
    });
    const resultListener = ExpoSpeechRecognitionModule.addListener(
      "result",
      (event: ExpoSpeechRecognitionResultEvent) => {
        if (!event.isFinal) {
          return;
        }

        const transcript = event.results
          .map((result) => result.transcript.trim())
          .find((candidate) => candidate.length > 0);

        if (!transcript) {
          setVoiceCommandStatus("unsupported", UNSUPPORTED_MESSAGE);
          return;
        }

        void handleFinalTranscript(transcript);
      },
    );
    const errorListener = ExpoSpeechRecognitionModule.addListener(
      "error",
      (event: ExpoSpeechRecognitionErrorEvent) => {
        activeRef.current = false;
        const friendly = toFriendlySpeechError(event.error);
        setVoiceCommandStatus(friendly.status, friendly.message);
      },
    );
    const nomatchListener = ExpoSpeechRecognitionModule.addListener("nomatch", () => {
      setVoiceCommandStatus("unsupported", UNSUPPORTED_MESSAGE);
    });
    const appStateListener = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" || !activeRef.current) {
        return;
      }

      ExpoSpeechRecognitionModule.abort();
      activeRef.current = false;
      setVoiceCommandStatus("idle", "Voice command listening stopped.");
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
  }, [handleFinalTranscript, setVoiceCommandStatus]);

  useEffect(() => {
    if (!message || !TRANSIENT_MESSAGE_STATUSES.includes(status)) {
      return undefined;
    }

    const transientStatus = status;
    const timer = setTimeout(() => {
      if (statusRef.current === transientStatus) {
        setVoiceCommandStatus("idle", null);
      }
    }, TRANSIENT_MESSAGE_MS);

    return () => clearTimeout(timer);
  }, [message, setVoiceCommandStatus, status]);

  const isListening = status === "listening";
  const isBusy = status === "requestingPermission" || status === "listening" || status === "opening";
  const isUnavailable = status === "unavailable";
  const isDisabled = disabled || isUnavailable || status === "requestingPermission" || status === "opening";
  const accessibilityLabel = isListening ? "Stop voice command" : "Start voice command";

  const handlePress = useCallback(async () => {
    if (disabled || status === "requestingPermission" || status === "opening") {
      return;
    }

    if (isListening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }

    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setShowHelp(false);
      setVoiceCommandStatus("unavailable", "Voice commands are not available on this device.");
      return;
    }

    if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
      setShowHelp(false);
      setVoiceCommandStatus(
        "unavailable",
        "On-device voice commands are not available on this device.",
      );
      return;
    }

    setShowHelp(false);
    setVoiceCommandStatus("requestingPermission", null);
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setVoiceCommandStatus(
        "error",
        "Microphone permission was denied. Enable microphone and speech recognition access in system settings to use voice commands.",
      );
      return;
    }

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
      setVoiceCommandStatus("error", "Voice command could not start. Nothing was opened.");
    }
  }, [disabled, isListening, locale, setVoiceCommandStatus, status]);

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={ACCESSIBILITY_HINT}
        accessibilityState={{
          disabled: isDisabled,
          busy: isBusy || undefined,
          selected: isListening,
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
        {status === "requestingPermission" || status === "opening" ? (
          <ActivityIndicator size="small" color={tokens.colors.primary} />
        ) : (
          <View accessible={false} importantForAccessibility="no-hide-descendants">
            <MaterialCommunityIcons
              name={isListening ? "microphone-off" : "microphone-outline"}
              size={22}
              color={isListening ? tokens.colors.primaryTextOn : tokens.colors.primary}
            />
          </View>
        )}
      </Pressable>

      {message ? (
        <Text
          accessibilityRole={
            status === "error" || status === "unavailable" || status === "unsupported"
              ? "alert"
              : "text"
          }
          accessibilityLiveRegion="polite"
          style={[
            styles.message,
            status === "error" || status === "unsupported" ? styles.errorMessage : null,
          ]}
        >
          {message}
        </Text>
      ) : null}

      {showHelp ? (
        <View
          accessibilityLabel="Supported voice commands"
          style={styles.helpPanel}
        >
          <Text style={styles.helpTitle}>Supported voice commands</Text>
          {SUPPORTED_VOICE_COMMANDS.map((command) => (
            <Text key={command} style={styles.helpItem}>
              {command}
            </Text>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss voice command help"
            onPress={() => {
              setShowHelp(false);
              setVoiceCommandStatus("idle", null);
            }}
            style={({ pressed }) => [
              styles.dismissButton,
              pressed ? getPressFeedbackStyle(reduceMotion, 0.9) : null,
            ]}
          >
            <Text style={styles.dismissText}>Dismiss</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    wrapper: {
      alignItems: "flex-end",
      gap: tokens.spacing.xs,
      maxWidth: 300,
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
      ...tokens.elevation.card,
    },
    buttonActive: {
      backgroundColor: tokens.colors.primary,
      borderColor: tokens.colors.primary,
    },
    buttonDisabled: {
      opacity: 0.55,
    },
    message: {
      maxWidth: 260,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
      color: tokens.colors.textMuted,
      paddingHorizontal: tokens.spacing.sm,
      paddingVertical: tokens.spacing.xs,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      textAlign: "right",
    },
    errorMessage: {
      color: tokens.colors.danger,
    },
    helpPanel: {
      width: 260,
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
      padding: tokens.spacing.md,
      gap: tokens.spacing.xs,
      ...tokens.elevation.card,
    },
    helpTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    helpItem: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    dismissButton: {
      minHeight: 48,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      alignItems: "center",
      justifyContent: "center",
      marginTop: tokens.spacing.xs,
      paddingHorizontal: tokens.spacing.sm,
    },
    dismissText: {
      color: tokens.colors.primary,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
  });
}
