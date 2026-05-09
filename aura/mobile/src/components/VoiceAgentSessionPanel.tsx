import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { createPatientVoiceSession } from "@/src/api/patient";
import { Card } from "@/src/components/Card";
import { getPressFeedbackStyle } from "@/src/components/Motion";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { stopReadAloud } from "@/src/utils/readAloud";
import {
  isRealtimeVoiceSessionSupported,
  startRealtimeVoiceSession,
  type RealtimeVoiceSessionHandle,
  type RealtimeVoiceSessionPhase,
} from "@/src/utils/realtimeVoiceSession";
import {
  parseVoiceActionProposal,
  type VoiceActionProposalResult,
} from "@/src/utils/voiceActionProposals";
import { useTokens } from "@/src/theme/tokens";

export type VoiceAgentSessionStatus =
  | "disabled"
  | "ready"
  | "requestingSession"
  | "requestingMicrophone"
  | "connectingAudio"
  | "live"
  | "stopping"
  | "ended"
  | "error"
  | "webUnsupported"
  | "nativeUnsupported";

type MicrophoneStatus =
  | "notRequested"
  | "requesting"
  | "granted"
  | "denied"
  | "unavailable";

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
  "Safe action proposals only.",
  "No confirmed clinical actions by voice yet.",
  "No auto-submit.",
  "No auto-send.",
  "No Realtime tools or server-side tool calling.",
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
  "Live browser audio may be heard by people nearby. Use a private space or headphones.",
];

const VOICE_HELP_COPY = [
  "You can ask Aura to open Check-in, Chat, Exercise plan, Appointments, Safety, or Coping tools.",
  "Aura can help draft text for review, but it will not send or submit it in this version.",
  "For urgent symptoms, use Safety or local emergency support.",
];

function isWebPlatform(): boolean {
  return Platform.OS === "web";
}

function initialStatus(token: string | null): VoiceAgentSessionStatus {
  if (!token) {
    return "disabled";
  }

  if (!isWebPlatform()) {
    return "nativeUnsupported";
  }

  return isRealtimeVoiceSessionSupported() ? "ready" : "webUnsupported";
}

function getBrowserDocument(): Document | null {
  const candidate = globalThis as typeof globalThis & {
    document?: Document;
  };

  return candidate.document ?? null;
}

function getRealtimeErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

function mapFailure(error: unknown): FriendlyFailure {
  const realtimeCode = getRealtimeErrorCode(error);
  if (realtimeCode === "microphone_denied") {
    return {
      status: "error",
      title: "Microphone permission denied",
      message:
        "Microphone permission was denied. Enable microphone access in your browser to use the web Voice Agent demo.",
    };
  }

  if (realtimeCode === "unsupported") {
    return {
      status: "webUnsupported",
      title: "Browser unsupported",
      message:
        "This browser cannot start a live Voice Agent audio session. Use a browser with WebRTC and microphone support.",
    };
  }

  if (realtimeCode === "connection_failed") {
    return {
      status: "error",
      title: "Audio connection failed",
      message: "Voice Agent audio could not connect. Nothing was stored.",
    };
  }

  const apiError =
    error && typeof error === "object" && "status" in error
      ? (error as { status?: number })
      : null;

  if (apiError?.status === 404) {
    return {
      status: "disabled",
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
    case "disabled":
      return "Unavailable";
    case "requestingSession":
      return "Requesting session";
    case "requestingMicrophone":
      return "Requesting microphone";
    case "connectingAudio":
      return "Connecting audio";
    case "live":
      return "Live browser audio";
    case "stopping":
      return "Stopping session";
    case "ended":
      return "Session ended";
    case "error":
      return "Needs attention";
    case "webUnsupported":
      return "Browser unsupported";
    case "nativeUnsupported":
      return "Web demo only";
    case "ready":
    default:
      return "Ready";
  }
}

function microphoneLabel(status: MicrophoneStatus): string {
  switch (status) {
    case "requesting":
      return "Requesting browser permission";
    case "granted":
      return "Browser microphone active";
    case "denied":
      return "Permission denied";
    case "unavailable":
      return "Unavailable on this platform";
    case "notRequested":
    default:
      return "Not requested";
  }
}

function proposalOpenRoute(proposal: VoiceActionProposalResult | null): string | null {
  if (!proposal) {
    return null;
  }

  if (proposal.kind === "allowed" && proposal.action.type === "open_screen") {
    return proposal.action.route;
  }

  if (proposal.kind === "allowed" && proposal.action.type === "start_guided_checkin_screen") {
    return proposal.action.route;
  }

  if (proposal.kind === "proposal") {
    return proposal.action.route;
  }

  return null;
}

function proposalRouteWorkflowText(proposal: VoiceActionProposalResult | null): string | null {
  if (!proposal) {
    return null;
  }

  if (proposal.kind === "allowed" && proposal.action.type === "start_guided_checkin_screen") {
    return `${proposal.action.route}?voiceGuided=1`;
  }

  const route = proposalOpenRoute(proposal);
  return route;
}

function openedFeedbackLabel(label: string): string {
  return label.replace(/^Open\s+/, "").trim() || label;
}

function proposalStatusText(proposal: VoiceActionProposalResult | null): string {
  if (!proposal) {
    return "No voice action proposal is active.";
  }

  return `Voice action ${proposal.state}. Detected intent: ${proposal.detectedIntent || "None"}. Proposed action: ${proposal.proposedAction}. ${proposal.reviewReason}`;
}

export function VoiceAgentSessionPanel({
  token,
  testID = "voice-agent-session-panel",
}: VoiceAgentSessionPanelProps) {
  const router = useRouter();
  const tokens = useTokens();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const secretRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const requestInFlightRef = useRef(false);
  const realtimeSessionRef = useRef<RealtimeVoiceSessionHandle | null>(null);
  const [status, setStatus] = useState<VoiceAgentSessionStatus>(() =>
    initialStatus(token),
  );
  const [microphoneStatus, setMicrophoneStatus] = useState<MicrophoneStatus>(
    isWebPlatform() ? "notRequested" : "unavailable",
  );
  const [session, setSession] = useState<PreparedSession | null>(null);
  const [failure, setFailure] = useState<FriendlyFailure | null>(null);
  const [revision, setRevision] = useState(0);
  const [intentInput, setIntentInput] = useState("");
  const [proposal, setProposal] = useState<VoiceActionProposalResult | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const clearExpiryTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const stopRealtimeSession = useCallback(() => {
    if (realtimeSessionRef.current) {
      realtimeSessionRef.current.stop();
      realtimeSessionRef.current = null;
    }
  }, []);

  const clearProposal = useCallback(() => {
    setIntentInput("");
    setProposal(null);
  }, []);

  const clearSession = useCallback(
    (nextStatus: VoiceAgentSessionStatus = "ended") => {
      stopRealtimeSession();
      secretRef.current = null;
      requestInFlightRef.current = false;
      clearProposal();
      setSession(null);
      clearExpiryTimer();
      setMicrophoneStatus(isWebPlatform() ? "notRequested" : "unavailable");
      setStatus(nextStatus);
      setRevision((current) => current + 1);
    },
    [clearExpiryTimer, clearProposal, stopRealtimeSession],
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
      clearSession("ended");
    };
  }, [clearSession]);

  useEffect(() => {
    if (!token) {
      clearSession("disabled");
      setFailure({
        status: "disabled",
        title: "Sign in required",
        message: "Sign in to start a web Voice Agent demo session.",
      });
      return;
    }

    if (!isWebPlatform()) {
      clearSession("nativeUnsupported");
      setFailure(null);
      return;
    }

    if (!isRealtimeVoiceSessionSupported()) {
      clearSession("webUnsupported");
      setFailure(null);
      return;
    }

    if (
      (status === "disabled" && failure?.title === "Sign in required") ||
      status === "webUnsupported" ||
      status === "nativeUnsupported"
    ) {
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

  useEffect(() => {
    if (!isWebPlatform()) {
      return undefined;
    }

    const documentRef = getBrowserDocument();
    if (!documentRef?.addEventListener) {
      return undefined;
    }

    const handleVisibilityChange = () => {
      if (documentRef.visibilityState !== "hidden" || !secretRef.current) {
        return;
      }
      clearSession("ended");
    };

    documentRef.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      documentRef.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [clearSession]);

  const handlePhaseChange = useCallback((phase: RealtimeVoiceSessionPhase) => {
    if (!mountedRef.current || !secretRef.current) {
      return;
    }

    if (phase === "requestingMicrophone") {
      setMicrophoneStatus("requesting");
      setStatus("requestingMicrophone");
      return;
    }

    if (phase === "connectingAudio") {
      setMicrophoneStatus("granted");
      setStatus("connectingAudio");
      return;
    }

    setMicrophoneStatus("granted");
    setStatus("live");
  }, []);

  const handleStart = useCallback(async () => {
    if (
      !token ||
      !isWebPlatform() ||
      !isRealtimeVoiceSessionSupported() ||
      requestInFlightRef.current ||
      status === "requestingSession" ||
      status === "requestingMicrophone" ||
      status === "connectingAudio" ||
      status === "live" ||
      status === "stopping"
    ) {
      return;
    }

    requestInFlightRef.current = true;
    secretRef.current = null;
    stopRealtimeSession();
    setSession(null);
    clearExpiryTimer();
    setFailure(null);
    setMicrophoneStatus("notRequested");
    setStatus("requestingSession");

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
      scheduleExpiry(prepared.clientSecret.expiresAt);

      const realtimeSession = await startRealtimeVoiceSession({
        clientSecret: prepared.clientSecret.value,
        onPhaseChange: handlePhaseChange,
      });

      if (!mountedRef.current || !secretRef.current) {
        realtimeSession.stop();
        return;
      }

      realtimeSessionRef.current = realtimeSession;
      setMicrophoneStatus("granted");
      setStatus("live");
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }

      secretRef.current = null;
      stopRealtimeSession();
      setSession(null);
      clearExpiryTimer();
      const nextFailure = mapFailure(error);
      setFailure(nextFailure);
      setMicrophoneStatus(
        getRealtimeErrorCode(error) === "microphone_denied"
          ? "denied"
          : isWebPlatform()
            ? "notRequested"
            : "unavailable",
      );
      setStatus(nextFailure.status);
    } finally {
      requestInFlightRef.current = false;
    }
  }, [
    clearExpiryTimer,
    handlePhaseChange,
    scheduleExpiry,
    status,
    stopRealtimeSession,
    token,
  ]);

  const handleStop = useCallback(() => {
    if (!secretRef.current && !session) {
      clearProposal();
      return;
    }

    setStatus("stopping");
    clearSession("ended");
  }, [clearProposal, clearSession, session]);

  const handleReviewIntent = useCallback(() => {
    setActionFeedback(null);
    setProposal(parseVoiceActionProposal(intentInput));
  }, [intentInput]);

  const handleVoiceHelp = useCallback(() => {
    setActionFeedback(null);
    setProposal(parseVoiceActionProposal("voice help"));
  }, []);

  const handleCancelProposal = useCallback(() => {
    clearProposal();
  }, [clearProposal]);

  const handleOpenProposalScreen = useCallback(() => {
    const route = proposalOpenRoute(proposal);
    if (!route) {
      return;
    }

    if (proposal?.kind === "allowed" && proposal.action.type === "start_guided_checkin_screen") {
      router.push({
        pathname: proposal.action.route,
        params: { voiceGuided: "1" },
      } as never);
      setActionFeedback(`Opened ${proposal.action.label}. No care data was changed.`);
      clearProposal();
      return;
    }

    router.push(route as never);
    setActionFeedback(
      `Opened ${openedFeedbackLabel(proposal?.proposedAction ?? "screen")}. No care data was changed.`,
    );
    clearProposal();
  }, [clearProposal, proposal, router]);

  const handleOpenSafeRedirect = useCallback(
    (route: "/safety" | "/(tabs)/checkin" | "/(tabs)/chat") => {
      router.push(route as never);
      setActionFeedback("Opened a safe review screen. No care data was changed.");
      clearProposal();
    },
    [clearProposal, router],
  );

  const handleGoBackProposal = useCallback(() => {
    router.back();
    clearProposal();
  }, [clearProposal, router]);

  const handleStopReadingProposal = useCallback(async () => {
    await stopReadAloud();
    clearProposal();
  }, [clearProposal]);

  const isBusy =
    status === "requestingSession" ||
    status === "requestingMicrophone" ||
    status === "connectingAudio" ||
    status === "stopping";
  const canStart =
    Boolean(token) &&
    isWebPlatform() &&
    isRealtimeVoiceSessionSupported() &&
    !isBusy &&
    status !== "live";
  const showStop = Boolean(session) && status !== "ended" && status !== "error";
  const expiryLabel = session ? formatExpiry(session.expiresAt) : null;
  const statusText =
    status === "nativeUnsupported"
      ? "Live Voice Agent audio is available in the web demo for V5-B2. Native audio requires a later development-build implementation."
      : status === "webUnsupported"
        ? "This browser does not expose the WebRTC microphone APIs needed for the V5-B2-Web demo."
        : status === "requestingSession"
          ? "Requesting a backend-created temporary Realtime session."
          : status === "requestingMicrophone"
            ? "Waiting for browser microphone permission."
            : status === "connectingAudio"
              ? "Connecting browser audio to the Realtime session."
              : status === "live"
                ? "Live browser audio is connected. Voice conversation only; no app actions are available."
                : status === "ended"
                  ? "Session ended. The temporary client secret and audio connection have been cleared."
                  : failure?.message ?? "Ready to start a live browser Voice Agent demo.";
  const proposalLiveText = proposalStatusText(proposal);
  const proposalRoute = proposalOpenRoute(proposal);
  const proposalRouteWorkflow = proposalRouteWorkflowText(proposal);

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
              V5-B2-Web starts a browser Realtime audio demo only.
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
            status === "error" || status === "disabled" ? styles.statusBoxWarning : null,
          ]}
        >
          <Text style={styles.statusKicker}>Status</Text>
          <Text style={styles.statusTitle}>{statusLabel(status)}</Text>
          <Text style={styles.statusText}>{statusText}</Text>
        </View>

        <View style={styles.metaGrid}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Microphone</Text>
            <Text style={styles.metaValue}>{microphoneLabel(microphoneStatus)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Platform</Text>
            <Text style={styles.metaValue}>
              {isWebPlatform() ? "Expo web browser demo" : "Native live audio not enabled"}
            </Text>
          </View>
        </View>

        {session ? (
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
            accessibilityHint="Starts a web-only live browser audio session after requesting a temporary backend session."
            accessibilityState={{
              disabled: !canStart,
              busy: isBusy || undefined,
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
            {isBusy ? (
              <ActivityIndicator size="small" color={tokens.colors.primaryTextOn} />
            ) : (
              <MaterialCommunityIcons name="play-circle-outline" size={20} color={tokens.colors.primaryTextOn} />
            )}
            <Text style={styles.primaryButtonText}>
              {isBusy ? "Starting..." : "Start Voice Agent"}
            </Text>
          </Pressable>

          {showStop ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Stop Voice Agent"
              accessibilityHint="Stops browser audio and clears this temporary Voice Agent session from memory."
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
        <View style={styles.headerRow}>
          <View style={styles.iconWrap} accessible={false} importantForAccessibility="no-hide-descendants">
            <MaterialCommunityIcons name="shield-check-outline" size={22} color={tokens.colors.primary} />
          </View>
          <View style={styles.headerCopy}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              Voice action proposals
            </Text>
            <Text style={styles.subtitle}>
              V5-C2 reviews a local, deterministic whitelist before opening safe screens.
            </Text>
          </View>
        </View>

        <View style={styles.intentForm}>
          <TextInput
            accessibilityLabel="Voice action intent"
            accessibilityHint="Enter a spoken intent to review locally. Drafts stay on this screen until cleared."
            value={intentInput}
            onChangeText={setIntentInput}
            placeholder="Try: open chat"
            placeholderTextColor={tokens.colors.textMuted}
            style={styles.intentInput}
            multiline
          />
          <View style={styles.actionsRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Review voice action"
              accessibilityHint="Reviews this intent against Aura's local safe action whitelist."
              onPress={handleReviewIntent}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed ? getPressFeedbackStyle(reduceMotion, 0.88) : null,
              ]}
            >
              <MaterialCommunityIcons name="shield-search" size={20} color={tokens.colors.primaryTextOn} />
              <Text style={styles.primaryButtonText}>Review action</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Voice help"
              accessibilityHint="Shows supported Voice Agent proposal actions."
              onPress={handleVoiceHelp}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed ? getPressFeedbackStyle(reduceMotion, 0.9) : null,
              ]}
            >
              <MaterialCommunityIcons name="help-circle-outline" size={20} color={tokens.colors.primary} />
              <Text style={styles.secondaryButtonText}>Voice help</Text>
            </Pressable>
          </View>
        </View>

        <View
          accessible
          accessibilityRole={proposal?.kind === "blocked" ? "alert" : "text"}
          accessibilityLiveRegion="polite"
          accessibilityLabel={proposalLiveText}
          style={[
            styles.proposalBox,
            proposal?.kind === "blocked" ? styles.proposalBoxWarning : null,
          ]}
        >
          <Text style={styles.statusKicker}>Proposal state</Text>
          <Text style={styles.statusTitle}>{proposal?.state ?? "idle"}</Text>
          {proposal ? (
            <>
              <Text style={styles.resultLabel}>Detected intent</Text>
              <Text selectable style={styles.resultText}>{proposal.detectedIntent || "None"}</Text>
              <Text style={styles.resultLabel}>Proposed action</Text>
              <Text style={styles.resultText}>{proposal.proposedAction}</Text>
              {proposalRouteWorkflow ? (
                <>
                  <Text style={styles.resultLabel}>Proposed route or workflow</Text>
                  <Text selectable style={styles.resultText}>{proposalRouteWorkflow}</Text>
                </>
              ) : null}
              <Text style={styles.resultLabel}>Review reason</Text>
              <Text style={styles.statusText}>{proposal.reviewReason}</Text>
              {proposal.kind === "proposal" && "draftText" in proposal.action && proposal.action.draftText ? (
                <View style={styles.draftBox}>
                  <Text style={styles.resultLabel}>Reviewed draft</Text>
                  <Text selectable style={styles.resultText}>{proposal.action.draftText}</Text>
                </View>
              ) : null}
              {proposal.kind === "help" ? (
                <View style={styles.bulletList}>
                  {VOICE_HELP_COPY.map((item) => (
                    <Text key={item} style={styles.bulletText}>
                      {"\u2022"} {item}
                    </Text>
                  ))}
                </View>
              ) : null}
            </>
          ) : (
            <Text style={styles.statusText}>No voice action proposal is active.</Text>
          )}
        </View>

        {actionFeedback ? (
          <View
            accessible
            accessibilityRole="text"
            accessibilityLiveRegion="polite"
            accessibilityLabel={actionFeedback}
            style={styles.feedbackBox}
          >
            <Text style={styles.statusText}>{actionFeedback}</Text>
          </View>
        ) : null}

        {proposal ? (
          <View style={styles.actionsRow}>
            {proposalRoute ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open screen"
                accessibilityHint="Opens the existing Aura screen without sending, submitting, booking, logging, or passing draft text."
                onPress={handleOpenProposalScreen}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed ? getPressFeedbackStyle(reduceMotion, 0.9) : null,
                ]}
              >
                <MaterialCommunityIcons name="open-in-new" size={20} color={tokens.colors.primary} />
                <Text style={styles.secondaryButtonText}>Open screen</Text>
              </Pressable>
            ) : null}

            {proposal.kind === "blocked" ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open Safety"
                  accessibilityHint="Opens Aura's Safety screen for the normal review path."
                  onPress={() => handleOpenSafeRedirect("/safety")}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed ? getPressFeedbackStyle(reduceMotion, 0.9) : null,
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>Open Safety</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open Check-in"
                  accessibilityHint="Opens Check-in without submitting anything by voice."
                  onPress={() => handleOpenSafeRedirect("/(tabs)/checkin")}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed ? getPressFeedbackStyle(reduceMotion, 0.9) : null,
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>Open Check-in</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open Chat"
                  accessibilityHint="Opens Chat without sending anything by voice."
                  onPress={() => handleOpenSafeRedirect("/(tabs)/chat")}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed ? getPressFeedbackStyle(reduceMotion, 0.9) : null,
                  ]}
                >
                  <Text style={styles.secondaryButtonText}>Open Chat</Text>
                </Pressable>
              </>
            ) : null}

            {proposal.kind === "allowed" && proposal.action.type === "go_back" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Go back"
                accessibilityHint="Goes back without changing care data."
                onPress={handleGoBackProposal}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed ? getPressFeedbackStyle(reduceMotion, 0.9) : null,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Go back</Text>
              </Pressable>
            ) : null}

            {proposal.kind === "allowed" && proposal.action.type === "stop_session" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Stop proposed Voice Agent session"
                accessibilityHint="Stops browser audio and clears the current proposal."
                onPress={handleStop}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed ? getPressFeedbackStyle(reduceMotion, 0.9) : null,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Stop session</Text>
              </Pressable>
            ) : null}

            {proposal.kind === "allowed" && proposal.action.type === "stop_reading" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Stop reading"
                accessibilityHint="Stops Aura read-aloud playback without changing care data."
                onPress={() => {
                  void handleStopReadingProposal();
                }}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed ? getPressFeedbackStyle(reduceMotion, 0.9) : null,
                ]}
              >
                <Text style={styles.secondaryButtonText}>Stop reading</Text>
              </Pressable>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel voice action proposal"
              accessibilityHint="Clears the current proposal and any memory-only draft on this screen."
              onPress={handleCancelProposal}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed ? getPressFeedbackStyle(reduceMotion, 0.9) : null,
              ]}
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
          </View>
        ) : null}
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
          {!isWebPlatform() ? (
            <Text style={styles.bulletText}>
              {"\u2022"} Live Voice Agent audio is available in the web demo for V5-B2. Native audio requires a later development-build implementation.
            </Text>
          ) : null}
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
    intentForm: {
      gap: tokens.spacing.md,
    },
    intentInput: {
      minHeight: 76,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      padding: tokens.spacing.md,
      textAlignVertical: "top",
    },
    proposalBox: {
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surfaceElevated,
      padding: tokens.spacing.md,
      gap: tokens.spacing.xs,
    },
    proposalBoxWarning: {
      backgroundColor: tokens.colors.warningTextOn,
      borderColor: tokens.colors.warning,
    },
    feedbackBox: {
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surfaceElevated,
      padding: tokens.spacing.md,
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
    draftBox: {
      borderRadius: tokens.radius.sm,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.accentTextOn,
      padding: tokens.spacing.sm,
      gap: tokens.spacing.xs,
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
