import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Speech from "expo-speech";
import React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";

import { getPressFeedbackStyle } from "@/src/components/Motion";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { useTokens } from "@/src/theme/tokens";
import { stopReadAloud } from "@/src/utils/readAloud";

export type ReadAloudStatus = "idle" | "speaking" | "stopping" | "unavailable" | "error";

type ReadAloudButtonProps = {
  text: string;
  label?: string;
  disabled?: boolean;
  sourceId?: string;
  testID?: string;
  onStatusChange?: (status: ReadAloudStatus) => void;
};

const IDLE_HINT = "Reads this text aloud.";
const SPEAKING_HINT = "Stops the current read-aloud playback.";
const ERROR_MESSAGE = "Read-aloud is unavailable right now.";
const CONSERVATIVE_RATE = 0.88;

function getMaxSpeechInputLength(): number {
  const max = Speech.maxSpeechInputLength;
  return typeof max === "number" && Number.isFinite(max) && max > 0
    ? max
    : Number.MAX_SAFE_INTEGER;
}

export function normalizeReadAloudText(parts: Array<string | null | undefined>): string {
  const normalized = parts
    .map((part) => (typeof part === "string" ? part.replace(/\s+/g, " ").trim() : ""))
    .filter(Boolean)
    .join(". ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();

  if (!normalized) {
    return "";
  }

  const maxLength = getMaxSpeechInputLength();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  if (maxLength <= 3) {
    return normalized.slice(0, maxLength);
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

export function ReadAloudButton({
  text,
  label,
  disabled = false,
  sourceId: _sourceId,
  testID,
  onStatusChange,
}: ReadAloudButtonProps) {
  const tokens = useTokens();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const [status, setStatus] = useState<ReadAloudStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const hasRequestedSpeechRef = useRef(false);
  const activeRef = useRef(false);

  const speakableText = useMemo(() => normalizeReadAloudText([text]), [text]);
  const setReadAloudStatus = useCallback(
    (nextStatus: ReadAloudStatus, nextMessage: string | null = null) => {
      setStatus(nextStatus);
      setMessage(nextMessage);
      onStatusChange?.(nextStatus);
    },
    [onStatusChange],
  );

  const stopSpeech = useCallback(async () => {
    try {
      await stopReadAloud();
    } catch {
      setReadAloudStatus("error", ERROR_MESSAGE);
    }
  }, [setReadAloudStatus]);

  useEffect(() => {
    const appStateListener = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" || !activeRef.current) {
        return;
      }

      activeRef.current = false;
      setReadAloudStatus("stopping", null);
      void stopSpeech();
    });

    return () => {
      appStateListener.remove();
      if (hasRequestedSpeechRef.current) {
        void stopSpeech();
      }
      activeRef.current = false;
    };
  }, [setReadAloudStatus, stopSpeech]);

  const isSpeaking = status === "speaking";
  const isStopping = status === "stopping";
  const isUnavailable = status === "unavailable";
  const isDisabled = disabled || !speakableText || isStopping || isUnavailable;
  const accessibilityLabel = isSpeaking ? "Stop reading" : (label ?? "Read aloud");
  const accessibilityHint = isSpeaking ? SPEAKING_HINT : IDLE_HINT;

  const handlePress = useCallback(async () => {
    if (disabled || isStopping || isUnavailable) {
      return;
    }

    if (isSpeaking) {
      setReadAloudStatus("stopping", null);
      activeRef.current = false;
      await stopSpeech();
      return;
    }

    if (!speakableText) {
      setReadAloudStatus("unavailable", "There is no text to read aloud.");
      return;
    }

    hasRequestedSpeechRef.current = true;
    setReadAloudStatus("stopping", null);
    await stopSpeech();

    try {
      Speech.speak(speakableText, {
        rate: CONSERVATIVE_RATE,
        onStart: () => {
          activeRef.current = true;
          setReadAloudStatus("speaking", null);
        },
        onDone: () => {
          activeRef.current = false;
          setReadAloudStatus("idle", null);
        },
        onStopped: () => {
          activeRef.current = false;
          setReadAloudStatus("idle", null);
        },
        onError: () => {
          activeRef.current = false;
          setReadAloudStatus("error", ERROR_MESSAGE);
        },
      });
    } catch {
      activeRef.current = false;
      setReadAloudStatus("error", ERROR_MESSAGE);
    }
  }, [
    disabled,
    isSpeaking,
    isStopping,
    isUnavailable,
    setReadAloudStatus,
    speakableText,
    stopSpeech,
  ]);

  return (
    <View style={styles.wrapper}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{
          disabled: isDisabled,
          busy: isStopping || undefined,
          selected: isSpeaking,
        }}
        disabled={isDisabled}
        onPress={handlePress}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={({ pressed }) => [
          styles.button,
          isSpeaking ? styles.buttonActive : null,
          isDisabled ? styles.buttonDisabled : null,
          pressed && !isDisabled ? getPressFeedbackStyle(reduceMotion, 0.84) : null,
        ]}
      >
        <View accessible={false} importantForAccessibility="no-hide-descendants">
          <MaterialCommunityIcons
            name={isSpeaking ? "stop" : "volume-high"}
            size={20}
            color={isSpeaking ? tokens.colors.primaryTextOn : tokens.colors.primary}
          />
        </View>
      </Pressable>
      {message ? (
        <Text
          accessibilityRole={status === "error" || status === "unavailable" ? "alert" : "text"}
          style={[
            styles.message,
            status === "error" ? styles.errorMessage : styles.unavailableMessage,
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
      color: tokens.colors.textMuted,
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
