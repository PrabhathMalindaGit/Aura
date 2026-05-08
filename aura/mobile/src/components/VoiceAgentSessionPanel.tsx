import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Pressable, StyleSheet, Text, View } from "react-native";

import { createPatientVoiceSession } from "@/src/api/patient";
import { Card } from "@/src/components/Card";
import { getPressFeedbackStyle } from "@/src/components/Motion";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { useTokens } from "@/src/theme/tokens";

export type VoiceAgentSessionStatus =
  | "unavailable"
  | "ready"
  | "connecting"
  | "connected"
  | "ending"
  | "ended"
  | "error";

type PreparedSession = {
  id: string;
  model: string;
  expiresAt: string;
};

type VoiceAgentSessionPanelProps = {
  token: string | null;
  testID?: string;
};

type FriendlyFailure = {
  status: VoiceAgentSessionStatus;
  title: string;
  message: string;
};

const LIMITATIONS = [
  "Live audio connection is not enabled yet in V5-B1.",
  "No clinical actions by voice yet.",
  "Cannot submit check-ins.",
  "Cannot send messages.",
  "Cannot book or cancel appointments.",
  "Cannot create alerts.",
  "Cannot call emergency services.",
  "Use existing Safety, Check-in, or Messages flows for clinical actions.",
];

const PRIVACY_NOTES = [
  "No always-on microphone.",
  "No background listening.",
  "No raw audio storage.",
  "No transcript storage.",
  "Temporary client secret is kept in memory only and cleared on stop, background, unmount, error, or expiry.",
];

function mapFailure(error: unknown): FriendlyFailure {
  const apiError =
    error && typeof error === "object" && "status" in error
      ? (error as { status?: number })
      : null;

  if (apiError?.status === 404) {
    return {
      status: "unavailable",
      title: "Voice Agent unavailable",
      message: "Voice Agent prototype is not available right now.",
    };
  }

  if (apiError?.status === 401 || apiError?.status === 403) {
    return {
      status: "error",
      title: "Sign in again",
      message: "Your Aura session needs to be refreshed. Please sign in again.",
    };
  }

  if (apiError?.status === 429) {
    return {
      status: "error",
      title: "Try again later",
      message: "Too many Voice Agent starts. Please wait and try again.",
    };
  }

  return {
    status: "error",
    title: "Temporarily unavailable",
    message: "Voice Agent setup is temporarily unavailable. Please try again later.",
  };
}

function formatExpiry(expiresAt: string): string {
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) {
    return "Expiry unavailable";
  }

  const remainingSeconds = Math.max(0, Math.ceil((expiresAtMs - Date.now()) / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeLabel = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(expiresAtMs));

  if (remainingSeconds <= 0) {
    return `Expired at ${timeLabel}`;
  }

  if (minutes > 0) {
    return `Expires at ${timeLabel} (${minutes}m ${seconds}s)`;
  }

  return `Expires at ${timeLabel} (${seconds}s)`;
}

function statusLabel(status: VoiceAgentSessionStatus): string {
  switch (status) {
    case "unavailable":
      return "Unavailable";
    case "connecting":
      return "Preparing session";
    case "connected":
      return "Prototype session ready";
    case "ending":
      return "Ending session";
    case "ended":
      return "Session ended";
    case "error":
      return "Needs attention";
    case "ready":
    default:
      return "Ready";
  }
}

export function VoiceAgentSessionPanel({
  token,
  testID = "voice-agent-session-panel",
}: VoiceAgentSessionPanelProps) {
  const tokens = useTokens();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const secretRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const requestInFlightRef = useRef(false);
  const [status, setStatus] = useState<VoiceAgentSessionStatus>(
    token ? "ready" : "unavailable",
  );
  const [session, setSession] = useState<PreparedSession | null>(null);
  const [failure, setFailure] = useState<FriendlyFailure | null>(null);
  const [revision, setRevision] = useState(0);

  const clearExpiryTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const clearSession = useCallback(
    (nextStatus: VoiceAgentSessionStatus = "ended") => {
      secretRef.current = null;
      requestInFlightRef.current = false;
      setSession(null);
      clearExpiryTimer();
      setStatus(nextStatus);
      setRevision((current) => current + 1);
    },
    [clearExpiryTimer],
  );

  const scheduleExpiry = useCallback(
    (expiresAt: string) => {
      clearExpiryTimer();
      const expiresAtMs = Date.parse(expiresAt);
      if (!Number.isFinite(expiresAtMs)) {
        return;
      }

      const delay = Math.max(0, expiresAtMs - Date.now());
      timeoutRef.current = setTimeout(() => {
        if (!mountedRef.current) {
          return;
        }
        clearSession("ended");
      }, delay);
    },
    [clearExpiryTimer, clearSession],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      secretRef.current = null;
      clearExpiryTimer();
    };
  }, [clearExpiryTimer]);

  useEffect(() => {
    if (!token) {
      clearSession("unavailable");
      setFailure({
        status: "unavailable",
        title: "Sign in required",
        message: "Sign in to prepare a Voice Agent prototype session.",
      });
      return;
    }

    if (status === "unavailable" && failure?.title === "Sign in required") {
      setFailure(null);
      setStatus("ready");
    }
  }, [clearSession, failure?.title, status, token]);

  useEffect(() => {
    const appStateListener = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" || !secretRef.current) {
        return;
      }
      clearSession("ended");
    });

    return () => {
      appStateListener.remove();
    };
  }, [clearSession]);

  const handleStart = useCallback(async () => {
    if (!token || requestInFlightRef.current || status === "connecting") {
      return;
    }

    requestInFlightRef.current = true;
    secretRef.current = null;
    setSession(null);
    clearExpiryTimer();
    setFailure(null);
    setStatus("connecting");

    try {
      const prepared = await createPatientVoiceSession(token);
      if (!mountedRef.current) {
        return;
      }

      secretRef.current = prepared.clientSecret.value;
      setSession({
        id: prepared.session.id,
        model: prepared.session.model,
        expiresAt: prepared.clientSecret.expiresAt,
      });
      setStatus("connected");
      scheduleExpiry(prepared.clientSecret.expiresAt);
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      secretRef.current = null;
      setSession(null);
      clearExpiryTimer();
      const nextFailure = mapFailure(error);
      setFailure(nextFailure);
      setStatus(nextFailure.status);
    } finally {
      requestInFlightRef.current = false;
    }
  }, [clearExpiryTimer, scheduleExpiry, status, token]);

  const handleStop = useCallback(() => {
    if (status !== "connected") {
      return;
    }

    setStatus("ending");
    clearSession("ended");
  }, [clearSession, status]);

  const isConnecting = status === "connecting";
  const isPrepared = status === "connected" && session;
  const canStart = Boolean(token) && status !== "connecting" && status !== "unavailable";
  const showStop = Boolean(isPrepared);
  const expiryLabel = session ? formatExpiry(session.expiresAt) : null;
  const statusText =
    status === "connected"
      ? "Prototype session ready. No live voice conversation has started."
      : status === "ended"
        ? "Session ended. The temporary client secret has been cleared from memory."
        : failure?.message ?? "Ready to request a temporary prototype session.";

  return (
    <View testID={testID} style={styles.wrapper}>
      <Card padding={tokens.spacing.lg} style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.iconWrap} accessible={false} importantForAccessibility="no-hide-descendants">
            <MaterialCommunityIcons name="microphone-message" size={24} color={tokens.colors.primary} />
          </View>
          <View style={styles.headerCopy}>
            <Text accessibilityRole="header" style={styles.title}>
              Aura Voice Agent
            </Text>
            <Text style={styles.subtitle}>
              Prototype voice-agent session setup. V5-B1 prepares a backend session only.
            </Text>
          </View>
        </View>

        <View
          accessible
          accessibilityRole={failure ? "alert" : "text"}
          accessibilityLiveRegion="polite"
          accessibilityLabel={`Voice Agent status: ${statusLabel(status)}. ${statusText}`}
          style={[
            styles.statusBox,
            status === "error" || status === "unavailable" ? styles.statusBoxWarning : null,
          ]}
        >
          <Text style={styles.statusKicker}>Status</Text>
          <Text style={styles.statusTitle}>{statusLabel(status)}</Text>
          <Text style={styles.statusText}>{statusText}</Text>
        </View>

        {isPrepared ? (
          <View style={styles.metaGrid}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Session model</Text>
              <Text selectable style={styles.metaValue}>
                {session.model}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Session ID</Text>
              <Text selectable style={styles.metaValue}>
                {session.id}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Session expiry</Text>
              <Text key={revision} style={styles.metaValue}>
                {expiryLabel}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.actionsRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start Voice Agent"
            accessibilityHint="Requests a temporary prototype voice-agent session from Aura."
            accessibilityState={{
              disabled: !canStart,
              busy: isConnecting || undefined,
            }}
            disabled={!canStart}
            onPress={() => {
              void handleStart();
            }}
            style={({ pressed }) => [
              styles.primaryButton,
              !canStart ? styles.disabledButton : null,
              pressed && canStart ? getPressFeedbackStyle(reduceMotion, 0.88) : null,
            ]}
          >
            {isConnecting ? (
              <ActivityIndicator size="small" color={tokens.colors.primaryTextOn} />
            ) : (
              <MaterialCommunityIcons name="play-circle-outline" size={20} color={tokens.colors.primaryTextOn} />
            )}
            <Text style={styles.primaryButtonText}>
              {isConnecting ? "Preparing..." : "Start Voice Agent"}
            </Text>
          </Pressable>

          {showStop ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop Voice Agent"
              accessibilityHint="Clears this prepared prototype session and its temporary secret from memory."
              accessibilityState={{ disabled: false }}
              onPress={handleStop}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed ? getPressFeedbackStyle(reduceMotion, 0.9) : null,
              ]}
            >
              <MaterialCommunityIcons name="stop-circle-outline" size={20} color={tokens.colors.primary} />
              <Text style={styles.secondaryButtonText}>Stop Voice Agent</Text>
            </Pressable>
          ) : null}
        </View>
      </Card>

      <Card padding={tokens.spacing.lg} variant="outlined" style={styles.card}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Prototype limitations
        </Text>
        <View style={styles.bulletList}>
          {LIMITATIONS.map((item) => (
            <Text key={item} style={styles.bulletText}>
              {"\u2022"} {item}
            </Text>
          ))}
        </View>
      </Card>

      <Card padding={tokens.spacing.lg} variant="outlined" style={styles.card}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Privacy boundaries
        </Text>
        <View style={styles.bulletList}>
          {PRIVACY_NOTES.map((item) => (
            <Text key={item} style={styles.bulletText}>
              {"\u2022"} {item}
            </Text>
          ))}
        </View>
      </Card>
    </View>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    wrapper: {
      gap: tokens.spacing.md,
    },
    card: {
      gap: tokens.spacing.md,
    },
    headerRow: {
      flexDirection: "row",
      gap: tokens.spacing.md,
      alignItems: "center",
    },
    iconWrap: {
      width: 48,
      height: 48,
      borderRadius: tokens.radius.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.colors.primarySoft,
      borderWidth: 1,
      borderColor: tokens.colors.border,
    },
    headerCopy: {
      flex: 1,
      gap: tokens.spacing.xs,
      minWidth: 0,
    },
    title: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    subtitle: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    statusBox: {
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.accentTextOn,
      padding: tokens.spacing.md,
      gap: tokens.spacing.xs,
    },
    statusBoxWarning: {
      backgroundColor: tokens.colors.warningTextOn,
      borderColor: tokens.colors.warning,
    },
    statusKicker: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      textTransform: "uppercase",
    },
    statusTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    statusText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    metaGrid: {
      gap: tokens.spacing.sm,
    },
    metaItem: {
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surfaceElevated,
      padding: tokens.spacing.md,
      gap: 2,
    },
    metaLabel: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    metaValue: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    actionsRow: {
      gap: tokens.spacing.sm,
    },
    primaryButton: {
      minHeight: 52,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.primary,
      borderWidth: 1,
      borderColor: tokens.colors.primary,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: tokens.spacing.sm,
      paddingHorizontal: tokens.spacing.lg,
    },
    primaryButtonText: {
      color: tokens.colors.primaryTextOn,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    secondaryButton: {
      minHeight: 52,
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.surface,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: tokens.spacing.sm,
      paddingHorizontal: tokens.spacing.lg,
    },
    secondaryButtonText: {
      color: tokens.colors.primary,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    disabledButton: {
      opacity: 0.55,
    },
    sectionTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    bulletList: {
      gap: tokens.spacing.xs,
    },
    bulletText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
  });
}
