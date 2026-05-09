import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionErrorEvent,
  type ExpoSpeechRecognitionResultEvent,
} from "expo-speech-recognition";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { isApiError, type ApiError } from "@/src/api/client";
import {
  chatHistory,
  extractConfirmedSendMessages,
  sendChat,
  type ChatItem,
  type PatientChatHistory,
  type PatientCommunicationSummaryState,
  type ChatSendResponse,
} from "@/src/api/patient";
import { listPatientTasks } from "@/src/api/tasks";
import { Avatar } from "@/src/components/Avatar";
import { Banner, type BannerVariant } from "@/src/components/Banner";
import { Card } from "@/src/components/Card";
import { MessagesShell } from "@/src/components/communication/MessagesShell";
import { WorkflowMessageCard } from "@/src/components/communication/WorkflowMessageCard";
import { EmptyState } from "@/src/components/EmptyState";
import { GlassPanel } from "@/src/components/GlassPanel";
import type { DomainIconKey } from "@/src/components/IconSet";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { Screen } from "@/src/components/Screen";
import { SkeletonBlock } from "@/src/components/Skeleton";
import { StatusPill, type StatusPillVariant } from "@/src/components/StatusPill";
import { TipCard } from "@/src/components/TipCard";
import { TrustBanner } from "@/src/components/TrustBanner";
import { VoiceDictationButton } from "@/src/components/VoiceDictationButton";
import { ReadAloudButton } from "@/src/components/ReadAloudButton";
import { useAuth } from "@/src/state/auth";
import {
  getCachedChat,
  setCachedChat,
  type ChatLocalAttempt,
} from "@/src/state/chatCache";
import { getCachedTasks, setCachedTasks } from "@/src/state/tasksCache";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { canPatientUseMessages, getCareModeNotice } from "@/src/state/recoverySupport";
import { useLastRefreshed } from "@/src/state/refresh";
import { useTrustStatus } from "@/src/state/trustStatus";
import { useTokens } from "@/src/theme/tokens";
import type { PatientTaskItem } from "@/src/types/task";
import { useDevRenderAudit } from "@/src/dev/renderAudit";
import { normalizeUnknownError } from "@/src/utils/errors";
import { stopReadAloud } from "@/src/utils/readAloud";
import {
  derivePatientTaskAction,
  formatPatientTaskSourceLabel,
  formatTaskDueLabel,
  groupTasksByPatientIntent,
  isCommunicationTask,
} from "@/src/utils/tasks";
import { parseVoiceChatSendConfirmation } from "@/src/utils/voiceChatSendConfirmation";

// Layout: Single Screen wrapper; avoid nested ScrollView.
type MessageItem = ChatItem & {
  localId: string;
};

type NoticeState = {
  variant: BannerVariant;
  title: string;
  message: string;
  actionLabel?: string;
  action?: () => void;
};

type PromptSummary = {
  title: string;
  text: string;
  chips?: string[];
  tone?: "info" | "warning";
  statusLabel?: string;
  actionLabel: string;
  action: () => void;
};

type ChatDevParams = {
  devPreset?: string | string[];
  devToken?: string | string[];
  focusComposer?: string | string[];
};

const CHAT_LIMIT = 50;
const COMPACT_GROUP_GAP_MS = 5 * 60 * 1000;
const STALE_SYNC_AFTER_MS = 2 * 60 * 60 * 1000;
const VOICE_SEND_REVIEW_EXPIRES_MS = 30_000;
const VOICE_SEND_REVIEW_COPY =
  "I’ll send this exact message after you say ‘yes send.’ High-risk content still goes through Aura’s normal safety review. Aura does not call emergency services.";

type VoiceSendReviewState =
  | "draftReady"
  | "needsMessage"
  | "reviewMessage"
  | "awaitingVoiceConfirmation"
  | "confirmedSend"
  | "cancelled"
  | "sending"
  | "sent"
  | "highRiskRouted"
  | "offlineBlocked"
  | "expired";

type VoiceSendReviewSnapshot = {
  rawDraft: string;
  messageToReview: string;
};

type ChatSendOutcome =
  | "empty"
  | "authRequired"
  | "readOnly"
  | "offlineBlocked"
  | "sent"
  | "highRiskRouted"
  | "failed";

type QuickAction = {
  key: string;
  label: string;
  icon: DomainIconKey;
  accessibilityLabel: string;
  route: string;
};

function toLocalId(item: ChatItem, index: number): string {
  if (item.id) {
    return `server-${item.id}`;
  }
  if (item.createdAt) {
    return `${item.role}-${item.createdAt}-${index}`;
  }
  return `${item.role}-${index}-${item.text.slice(0, 12)}`;
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

function toRenderable(items: ChatItem[]): MessageItem[] {
  return items.map((item, index) => ({
    ...item,
    localId: toLocalId(item, index),
  }));
}

function dedupeMessagesByIdentity(items: MessageItem[]): MessageItem[] {
  const seenServerIds = new Set<string>();
  const deduped: MessageItem[] = [];

  for (const item of items) {
    if (item.id) {
      if (seenServerIds.has(item.id)) {
        continue;
      }
      seenServerIds.add(item.id);
    }
    deduped.push(item);
  }

  return deduped;
}

function toPersisted(items: MessageItem[]): ChatItem[] {
  return items.map((item) => ({
    id: item.id,
    role: item.role,
    text: item.text,
    createdAt: item.createdAt,
  }));
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

function toMessageTime(iso?: string): number | null {
  if (!iso) {
    return null;
  }
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
}

function isSameLocalDay(leftTs: number, rightTs: number): boolean {
  const left = new Date(leftTs);
  const right = new Date(rightTs);
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function shouldShowDaySeparator(items: MessageItem[], index: number): boolean {
  if (index === 0) {
    return true;
  }

  const current = items[index];
  const previous = items[index - 1];
  if (!current || !previous) {
    return false;
  }

  const currentTs = toMessageTime(current.createdAt);
  const previousTs = toMessageTime(previous.createdAt);
  if (currentTs === null || previousTs === null) {
    return false;
  }

  return !isSameLocalDay(currentTs, previousTs);
}

function isCompactGroup(items: MessageItem[], index: number): boolean {
  if (index === 0) {
    return false;
  }

  const current = items[index];
  const previous = items[index - 1];
  if (!current || !previous || current.role !== previous.role) {
    return false;
  }

  const currentTs = toMessageTime(current.createdAt);
  const previousTs = toMessageTime(previous.createdAt);
  if (currentTs === null || previousTs === null) {
    return true;
  }

  return Math.abs(currentTs - previousTs) < COMPACT_GROUP_GAP_MS;
}

function isGroupStart(items: MessageItem[], index: number): boolean {
  if (index === 0) {
    return true;
  }

  const current = items[index];
  const previous = items[index - 1];
  if (!current || !previous) {
    return true;
  }

  if (current.role !== previous.role) {
    return true;
  }

  return !isCompactGroup(items, index);
}

function formatConversationTimeLabel(iso?: string): string | null {
  const timestamp = toMessageTime(iso);
  if (timestamp === null) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatConversationDayLabel(
  iso?: string,
  now: Date = new Date(),
): string | null {
  const timestamp = toMessageTime(iso);
  if (timestamp === null) {
    return null;
  }

  const date = new Date(timestamp);
  if (isSameLocalDay(timestamp, now.getTime())) {
    return "Today";
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameLocalDay(timestamp, yesterday.getTime())) {
    return "Yesterday";
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

function normalizeChatError(error: unknown): ApiError {
  if (isApiError(error)) {
    return error;
  }

  const fallback = normalizeUnknownError(error);
  return {
    title: fallback.title,
    message: fallback.message,
    kind: fallback.kind,
    retryable: fallback.retryable,
    detail: fallback.detail,
  };
}

function isDefiniteNoWrite(error: ApiError): boolean {
  if (error.kind === "offline") {
    return true;
  }

  if (error.status === 400 || error.status === 401 || error.status === 403) {
    return true;
  }

  return error.status === 502;
}

function toSendFailureState(error: ApiError): {
  localAttemptStatus: Exclude<ChatLocalAttempt["status"], "sending">;
  message: string;
  kind: ApiError["kind"];
  retryable: boolean;
} {
  if (isDefiniteNoWrite(error)) {
    if (error.kind === "offline") {
      return {
        localAttemptStatus: "failed",
        message: "Offline · Nothing was sent.",
        kind: "offline",
        retryable: true,
      };
    }

    if (error.status === 401 || error.status === 403) {
      return {
        localAttemptStatus: "failed",
        message: "Nothing was sent. Please sign in again before retrying.",
        kind: "validation",
        retryable: true,
      };
    }

    if (error.status === 400) {
      return {
        localAttemptStatus: "failed",
        message: "Nothing was sent. Please review your message and try again.",
        kind: "validation",
        retryable: true,
      };
    }

    return {
      localAttemptStatus: "failed",
      message: "Nothing was sent. Chat is temporarily unavailable.",
      kind: "server",
      retryable: true,
    };
  }

  return {
    localAttemptStatus: "unknown",
    message: "Delivery not confirmed. Refresh chat before sending again.",
    kind: error.kind,
    retryable: false,
  };
}

function getLocalAttemptTitle(status: ChatLocalAttempt["status"]): string {
  if (status === "sending") {
    return "Sending…";
  }
  if (status === "failed") {
    return "Failed · Nothing was sent.";
  }
  return "Delivery not confirmed.";
}

function getLocalAttemptTone(status: ChatLocalAttempt["status"]): "info" | "warning" {
  return status === "sending" ? "info" : "warning";
}

function toFriendlyMessage(error: ApiError, fallbackTitle: string): {
  title: string;
  message: string;
  kind: "offline" | "network" | "server" | "validation" | "unknown";
  retryable: boolean;
} {
  if (error.kind === "offline") {
    return {
      title: fallbackTitle,
      message: "You’re offline. Nothing was sent.",
      kind: "offline",
      retryable: true,
    };
  }

  if (error.kind === "network") {
    return {
      title: fallbackTitle,
      message: "Couldn’t reach the service. Please try again.",
      kind: "network",
      retryable: true,
    };
  }

  if (error.kind === "server") {
    return {
      title: fallbackTitle,
      message: "Service unavailable. Please try again shortly.",
      kind: "server",
      retryable: true,
    };
  }

  if (error.kind === "validation") {
    return {
      title: fallbackTitle,
      message: error.message || "Please review your input and try again.",
      kind: "validation",
      retryable: false,
    };
  }

  return {
    title: fallbackTitle,
    message: error.message || "Something went wrong. Please try again.",
    kind: "unknown",
    retryable: true,
  };
}

export default function ChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<ChatDevParams>();
  const auth = useAuth();
  const isOffline = useIsOffline();
  const reduceMotion = useReducedMotion();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  useDevRenderAudit("ChatScreen");

  const {
    label: chatRefreshLabel,
    lastRefreshedAt: chatLastRefreshedAt,
    refreshLocal: refreshChatStamp,
  } = useLastRefreshed("chat");
  const tasksRefresh = useLastRefreshed("tasks");
  const {
    label: chatLoadErrorLabel,
    lastError: chatLoadLastError,
    setLocalError: setChatLoadError,
    clear: clearChatLoadError,
  } = useLastError("chatLoad");
  const {
    lastError: chatSendLastError,
    setLocalError: setChatSendError,
    clear: clearChatSendError,
  } = useLastError("chatSend");

  const listRef = useRef<FlatList<MessageItem>>(null);
  const inputRef = useRef<TextInput>(null);
  const isLoadingHistoryRef = useRef(false);
  const messagesRef = useRef<MessageItem[]>([]);
  const localAttemptRef = useRef<ChatLocalAttempt | null>(null);
  const voiceSendStateRef = useRef<VoiceSendReviewState>("draftReady");
  const voiceSendExpiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patientId = auth.patient?.id ?? "";
  const patientLabel = auth.patient?.displayName ?? auth.patient?.id ?? "Patient";
  const patientPhotoUri = useMemo(() => extractPatientPhotoUri(auth.patient), [auth.patient]);
  const messagesAvailable = canPatientUseMessages(auth.patient);
  const careModeNotice = useMemo(() => getCareModeNotice(auth.patient), [auth.patient]);
  const trustStatus = useTrustStatus({
    patientId,
    errorRecords: [chatLoadLastError, chatSendLastError],
    includePendingSync: false,
  });

  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [localAttempt, setLocalAttempt] = useState<ChatLocalAttempt | null>(null);
  const [workflowTasks, setWorkflowTasks] = useState<PatientTaskItem[]>([]);
  const [patientCommunicationSummary, setPatientCommunicationSummary] = useState<
    PatientCommunicationSummaryState | null | undefined
  >(undefined);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isSafetyChecking, setIsSafetyChecking] = useState(false);
  const [showingOfflineCache, setShowingOfflineCache] = useState(false);
  const [voiceSendState, setVoiceSendState] = useState<VoiceSendReviewState>("draftReady");
  const [voiceSendSnapshot, setVoiceSendSnapshot] = useState<VoiceSendReviewSnapshot | null>(null);
  const [voiceSendMessage, setVoiceSendMessage] = useState<string | null>(null);
  const [isVoiceSendListening, setIsVoiceSendListening] = useState(false);

  const chatSyncPill = useMemo(() => {
    if (!chatLastRefreshedAt || !Number.isFinite(chatLastRefreshedAt)) {
      return {
        label: "Not synced yet",
        variant: "neutral" as StatusPillVariant,
      };
    }

    const isStale = Date.now() - chatLastRefreshedAt >= STALE_SYNC_AFTER_MS;
    const variant: StatusPillVariant = isStale ? "warning" : "neutral";
    return {
      label: `Last synced ${chatRefreshLabel}`,
      variant,
    };
  }, [chatLastRefreshedAt, chatRefreshLabel]);
  const [notice, setNotice] = useState<NoticeState | null>(null);

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

  const focusComposer = useMemo(() => {
    if (Array.isArray(params.focusComposer)) {
      return params.focusComposer[0] ?? "";
    }
    return params.focusComposer ?? "";
  }, [params.focusComposer]);

  const isSendDisabled = useMemo(
    () => isSending || isOffline || !messagesAvailable || !draft.trim(),
    [draft, isOffline, isSending, messagesAvailable]
  );
  const hasDraft = draft.trim().length > 0;

  const latestPatientLocalId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const item = messages[index];
      if (item?.role === "patient") {
        return item.localId;
      }
    }
    return null;
  }, [messages]);

  const latestAssistantMessage = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const item = messages[index];
      if (item?.role === "assistant") {
        return item;
      }
    }
    return null;
  }, [messages]);

  const patientMessageCount = useMemo(
    () => messages.filter((item) => item.role === "patient").length,
    [messages]
  );

  const inlineAssistantTip = useMemo(() => {
    if (!latestAssistantMessage || patientMessageCount < 2) {
      return null;
    }

    const text = latestAssistantMessage.text.toLowerCase();

    if (text.includes("exercise") || text.includes("plan")) {
      return {
        targetLocalId: latestAssistantMessage.localId,
        tone: "info" as const,
        title: "Open today’s plan",
        text: "Continue with your assigned exercises.",
        actionLabel: "Open plan",
        action: () => {
          router.push("/exercise-plan" as never);
        },
        icon: "exercise" as const,
      };
    }

    if (text.includes("check-in")) {
      return {
        targetLocalId: latestAssistantMessage.localId,
        tone: "info" as const,
        title: "Start today’s check-in",
        text: "Keep your daily recovery timeline up to date.",
        actionLabel: "Open check-in",
        action: () => {
          router.push("/(tabs)/checkin" as never);
        },
        icon: "checkin" as const,
      };
    }

    if (text.includes("breathing") || text.includes("grounding")) {
      return {
        targetLocalId: latestAssistantMessage.localId,
        tone: "safety" as const,
        title: "Open coping tools",
        text: "Use breathing or grounding guidance now.",
        actionLabel: "Open coping tools",
        action: () => {
          router.push("/coping-tools" as never);
        },
        icon: "coping" as const,
      };
    }

    return null;
  }, [latestAssistantMessage, patientMessageCount, router]);

  const quickActions = useMemo<QuickAction[]>(
    () => [
      {
        key: "tasks",
        label: "Tasks",
        icon: "tasks",
        accessibilityLabel: "Open tasks",
        route: "/tasks",
      },
      {
        key: "plan",
        label: "Plan",
        icon: "exercise",
        accessibilityLabel: "Open plan",
        route: "/exercise-plan",
      },
      {
        key: "checkin",
        label: "Check-in",
        icon: "checkin",
        accessibilityLabel: "Open check-in",
        route: "/(tabs)/checkin",
      },
      {
        key: "progress",
        label: "Progress",
        icon: "progress",
        accessibilityLabel: "Open progress",
        route: "/(tabs)/progress",
      },
      {
        key: "coping",
        label: "Coping",
        icon: "coping",
        accessibilityLabel: "Open coping tools",
        route: "/coping-tools",
      },
    ],
    []
  );

  const focusComposerAction = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const communicationPrompts = useMemo(
    () => {
      const grouped = groupTasksByPatientIntent(
        workflowTasks
        .filter((task) => isCommunicationTask(task) && (task.status === "open" || task.status === "in_progress"))
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
      );

      return grouped.slice(0, 2);
    },
    [workflowTasks],
  );
  const taskPromptSummary = useMemo<PromptSummary | null>(() => {
    const task = communicationPrompts[0];
    if (!task) {
      return null;
    }

    const dueLabel = formatTaskDueLabel(task);
    const action = derivePatientTaskAction(task);
    const extraCount = Math.max(0, communicationPrompts.length - 1);
    const isDelayed =
      dueLabel === "Overdue" || task.priority === "urgent" || task.priority === "high";

    return {
      title: isDelayed ? "Response delayed" : "Care team reviewing",
      text: isDelayed
        ? "A reply is taking longer than expected. You can still message your care team here."
        : "Your care team is reviewing the latest update. You can still message here at any time.",
      chips: [
        dueLabel,
        extraCount > 0
          ? `+${extraCount} more update${extraCount === 1 ? "" : "s"}`
          : formatPatientTaskSourceLabel(task),
      ].filter((value): value is string => Boolean(value)),
      tone: isDelayed ? ("warning" as const) : ("info" as const),
      statusLabel: isDelayed ? "Response delayed" : "Care team reviewing",
      actionLabel: action.icon === "chat" ? "Reply here" : action.label,
      action: () => {
        router.push(action.href as never);
      },
    };
  }, [communicationPrompts, router]);
  const promptSummary = useMemo<PromptSummary | null>(() => {
    if (patientCommunicationSummary === "care_team_reviewing") {
      return {
        title: "Care team reviewing",
        text: "Your care team is reviewing your latest update. You can still message here at any time.",
        chips: [],
        tone: "info",
        statusLabel: "Care team reviewing",
        actionLabel: "Reply here",
        action: focusComposerAction,
      };
    }

    if (patientCommunicationSummary === "response_delayed") {
      return {
        title: "Response delayed",
        text: "A reply is taking longer than expected. You can still message your care team here.",
        chips: [],
        tone: "warning",
        statusLabel: "Response delayed",
        actionLabel: "Reply here",
        action: focusComposerAction,
      };
    }

    if (patientCommunicationSummary === null) {
      return null;
    }

    return taskPromptSummary;
  }, [focusComposerAction, patientCommunicationSummary, taskPromptSummary]);
  const contextNotice = localAttempt ? null : notice;
  const hasHeaderContext =
    Boolean(careModeNotice) ||
    Boolean(showingOfflineCache && !isOffline) ||
    Boolean(contextNotice) ||
    Boolean(chatLoadLastError);
  const threadLead = useMemo(() => {
    if (promptSummary) {
      return (
        <WorkflowMessageCard
          compact
          title={promptSummary.title}
          text={promptSummary.text}
          chips={promptSummary.chips}
          tone={promptSummary.tone}
          statusLabel={promptSummary.statusLabel}
          actionLabel={promptSummary.actionLabel}
          onAction={promptSummary.action}
        />
      );
    }

    if (messagesAvailable) {
      return (
        <Banner
          variant="info"
          title="You can still message here"
          message="Your care team conversation stays available even when there is no open prompt."
        />
      );
    }

    return (
      <Banner
        variant="info"
        title="Conversation history stays available"
        message="Earlier messages remain here even when routine messaging is no longer active for this care status."
      />
    );
  }, [messagesAvailable, promptSummary]);
  const messageShortcuts = useMemo(
    () =>
      quickActions.map((action) => ({
        ...action,
        onPress: () => {
          router.push(action.route as never);
        },
      })),
    [quickActions, router],
  );

  const loadWorkflowTasks = useCallback(async () => {
    if (!auth.token || !patientId) {
      return;
    }

    if (isOffline) {
      const cached = await getCachedTasks(patientId);
      setWorkflowTasks(cached?.items ?? []);
      return;
    }

    try {
      const items = await listPatientTasks(auth.token, {
        status: ["open", "in_progress"],
        limit: 20,
      });
      setWorkflowTasks(items);
      await Promise.all([setCachedTasks(patientId, items), tasksRefresh.refreshLocal()]);
    } catch {
      const cached = await getCachedTasks(patientId);
      setWorkflowTasks(cached?.items ?? []);
    }
  }, [auth.token, isOffline, patientId, tasksRefresh]);

  const persistChatSnapshot = useCallback(
    (
      nextMessages: MessageItem[] = messagesRef.current,
      nextLocalAttempt: ChatLocalAttempt | null = localAttemptRef.current
    ) => {
      if (!patientId) {
        return;
      }
      void setCachedChat(patientId, {
        confirmedMessages: toPersisted(nextMessages),
        localAttempt: nextLocalAttempt,
      });
    },
    [patientId]
  );

  const applyConfirmedMessages = useCallback(
    (nextMessages: MessageItem[], persist = true) => {
      const deduped = dedupeMessagesByIdentity(nextMessages);
      messagesRef.current = deduped;
      setMessages(deduped);
      if (persist) {
        persistChatSnapshot(deduped, localAttemptRef.current);
      }
    },
    [persistChatSnapshot]
  );

  const replaceConfirmedHistory = useCallback(
    (items: ChatItem[], persist = true) => {
      applyConfirmedMessages(toRenderable(items), persist);
    },
    [applyConfirmedMessages]
  );

  const setLocalAttemptState = useCallback(
    (nextLocalAttempt: ChatLocalAttempt | null, persist = true) => {
      localAttemptRef.current = nextLocalAttempt;
      setLocalAttempt(nextLocalAttempt);
      if (persist) {
        persistChatSnapshot(messagesRef.current, nextLocalAttempt);
      }
    },
    [persistChatSnapshot]
  );

  // Keep dependencies stable (functions/primitives only) to avoid repeated effect reloads.
  const loadHistory = useCallback(async () => {
    if (!auth.token || !patientId || isLoadingHistoryRef.current) {
      return;
    }

    isLoadingHistoryRef.current = true;
    setIsLoading(true);
    setNotice(null);

    try {
      if (isOffline) {
        const cached = await getCachedChat(patientId);
        replaceConfirmedHistory(cached?.confirmedMessages ?? [], false);
        setLocalAttemptState(cached?.localAttempt ?? null, false);
        setPatientCommunicationSummary(undefined);
        setShowingOfflineCache(Boolean(cached && cached.confirmedMessages.length > 0));
        return;
      }

      const history = (await chatHistory(auth.token, CHAT_LIMIT)) as
        | PatientChatHistory
        | ChatItem[];
      const historyItems = Array.isArray(history) ? history : history.items;
      replaceConfirmedHistory(historyItems, false);
      setPatientCommunicationSummary(
        Array.isArray(history) ? undefined : history.patientCommunicationSummary,
      );
      setShowingOfflineCache(false);
      await refreshChatStamp();
      await clearChatLoadError();
      persistChatSnapshot(
        dedupeMessagesByIdentity(toRenderable(historyItems)),
        localAttemptRef.current
      );
    } catch (error) {
      const normalized = normalizeChatError(error);
      const friendly = toFriendlyMessage(normalized, "Couldn’t load history");
      await setChatLoadError({
        title: friendly.title,
        message: friendly.message,
        kind: friendly.kind,
        retryable: friendly.retryable,
      });

      const cached = await getCachedChat(patientId);
      if (cached) {
        replaceConfirmedHistory(cached.confirmedMessages, false);
        setLocalAttemptState(cached.localAttempt, false);
        setShowingOfflineCache(cached.confirmedMessages.length > 0);
      }
      setPatientCommunicationSummary(undefined);

      setNotice({
        variant: "warning",
        title: friendly.title,
        message: friendly.message,
        actionLabel: friendly.retryable ? "Retry" : undefined,
        action: friendly.retryable
          ? () => {
              void loadHistory();
            }
          : undefined,
      });
    } finally {
      isLoadingHistoryRef.current = false;
      setIsLoading(false);
    }
  }, [
    auth.token,
    clearChatLoadError,
    replaceConfirmedHistory,
    refreshChatStamp,
    isOffline,
    patientId,
    persistChatSnapshot,
    setChatLoadError,
    setLocalAttemptState,
  ]);

  const clearVoiceSendExpiryTimer = useCallback(() => {
    if (voiceSendExpiryTimerRef.current) {
      clearTimeout(voiceSendExpiryTimerRef.current);
      voiceSendExpiryTimerRef.current = null;
    }
  }, []);

  const updateVoiceSendState = useCallback((nextState: VoiceSendReviewState) => {
    voiceSendStateRef.current = nextState;
    setVoiceSendState(nextState);
  }, []);

  const startVoiceSendExpiryTimer = useCallback(() => {
    clearVoiceSendExpiryTimer();
    voiceSendExpiryTimerRef.current = setTimeout(() => {
      setVoiceSendSnapshot(null);
      setIsVoiceSendListening(false);
      setVoiceSendMessage("Voice send review expired. Review again before sending.");
      updateVoiceSendState("expired");
    }, VOICE_SEND_REVIEW_EXPIRES_MS);
  }, [clearVoiceSendExpiryTimer, updateVoiceSendState]);

  useEffect(
    () => () => {
      clearVoiceSendExpiryTimer();
    },
    [clearVoiceSendExpiryTimer],
  );

  const handleSend = useCallback(
    async (overrideMessage?: string): Promise<ChatSendOutcome> => {
      if (!auth.token || !patientId) {
        router.replace("/(auth)/login");
        return "authRequired";
      }

      const messageToSend = (overrideMessage ?? draft).trim();
      if (!messageToSend) {
        return "empty";
      }

      if (!messagesAvailable) {
        setNotice({
          variant: "info",
          title: careModeNotice?.title ?? "Messages are read-only",
          message:
            careModeNotice?.message ??
            "Routine messaging is no longer active here. Earlier messages stay available in this archive view.",
        });
        return "readOnly";
      }

      const attemptStartedAt = new Date().toISOString();

      if (isOffline) {
        const failureState = toSendFailureState({
          title: "Couldn’t send",
          message: "Offline · Nothing was sent.",
          kind: "offline",
          retryable: true,
        });
        await setChatSendError({
          title: "Couldn’t send",
          message: failureState.message,
          kind: failureState.kind,
          retryable: true,
        });
        setLocalAttemptState({
          text: messageToSend,
          status: failureState.localAttemptStatus,
          createdAt: attemptStartedAt,
        });
        setNotice({
          variant: "warning",
          title: "Couldn’t send",
          message: failureState.message,
        });
        return "offlineBlocked";
      }

      if (!overrideMessage) {
        setDraft("");
      }

      setNotice(null);
      setIsSending(true);
      setIsSafetyChecking(true);
      setLocalAttemptState({
        text: messageToSend,
        status: "sending",
        createdAt: attemptStartedAt,
      });

      try {
        const response: ChatSendResponse = await sendChat(auth.token, messageToSend);
        await clearChatSendError();
        setLocalAttemptState(null);
        setPatientCommunicationSummary(null);
        setShowingOfflineCache(false);

        const confirmedMessages = extractConfirmedSendMessages(response);
        const appended: ChatItem[] = [
          ...toPersisted(messagesRef.current),
          ...(confirmedMessages.user ? [confirmedMessages.user] : []),
          ...(confirmedMessages.assistant ? [confirmedMessages.assistant] : []),
        ];

        if (response.risk?.level === "high") {
          const reasonCodes = response.risk.reasonCodes ?? [];
          const routeParams: Record<string, string> = {};
          if (response.alertId) {
            routeParams.alertId = response.alertId;
          }
          if (reasonCodes.length > 0) {
            routeParams.reasonCodes = reasonCodes.join(",");
          }

          if (confirmedMessages.user) {
            replaceConfirmedHistory(appended);
          }
          await refreshChatStamp();

          router.push({
            pathname: "/safety",
            params: routeParams,
          });
          return "highRiskRouted";
        }

        if (confirmedMessages.user) {
          replaceConfirmedHistory(appended);
        }

        if (confirmedMessages.user && !confirmedMessages.assistant) {
          setNotice({
            variant: "info",
            title: "Reply unavailable",
            message: "Your message was sent. Refresh chat to load Aura’s reply.",
          });
        }

        await refreshChatStamp();
        return "sent";
      } catch (error) {
        const normalized = normalizeChatError(error);
        const failureState = toSendFailureState(normalized);

        await setChatSendError({
          title: "Couldn’t send",
          message: failureState.message,
          kind: failureState.kind,
          retryable: failureState.localAttemptStatus === "failed",
        });
        setLocalAttemptState({
          text: messageToSend,
          status: failureState.localAttemptStatus,
          createdAt: attemptStartedAt,
        });

        setNotice({
          variant: "warning",
          title: "Couldn’t send",
          message: failureState.message,
        });
        return "failed";
      } finally {
        setIsSafetyChecking(false);
        setIsSending(false);
      }
    },
    [
      auth.token,
      careModeNotice?.message,
      careModeNotice?.title,
      clearChatSendError,
      draft,
      isOffline,
      messagesAvailable,
      patientId,
      replaceConfirmedHistory,
      refreshChatStamp,
      router,
      setChatSendError,
      setLocalAttemptState,
    ]
  );

  const handleRetryLocalAttempt = useCallback(() => {
    if (localAttemptRef.current?.status !== "failed") {
      return;
    }
    void handleSend(localAttemptRef.current.text);
  }, [handleSend]);

  const handleDictationTranscript = useCallback((transcript: string) => {
    setDraft((current) => appendReviewedTranscript(current, transcript, 1000));
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (
      !voiceSendSnapshot ||
      voiceSendSnapshot.rawDraft === draft ||
      voiceSendState === "sending" ||
      voiceSendState === "sent" ||
      voiceSendState === "highRiskRouted"
    ) {
      return;
    }

    clearVoiceSendExpiryTimer();
    setVoiceSendSnapshot(null);
    setIsVoiceSendListening(false);
    setVoiceSendMessage("Message changed. Review again before voice send.");
    updateVoiceSendState("draftReady");
  }, [
    clearVoiceSendExpiryTimer,
    draft,
    updateVoiceSendState,
    voiceSendSnapshot,
    voiceSendState,
  ]);

  const canUseCurrentVoiceSendReview =
    Boolean(voiceSendSnapshot) &&
    voiceSendSnapshot?.rawDraft === draft &&
    (voiceSendState === "reviewMessage" ||
      voiceSendState === "awaitingVoiceConfirmation" ||
      voiceSendState === "confirmedSend");

  const handlePrepareVoiceSendReview = useCallback(() => {
    const messageToReview = draft.trim();
    if (!messageToReview) {
      clearVoiceSendExpiryTimer();
      setVoiceSendSnapshot(null);
      setIsVoiceSendListening(false);
      setVoiceSendMessage("Voice send needs a message.");
      updateVoiceSendState("needsMessage");
      return;
    }

    setVoiceSendSnapshot({
      rawDraft: draft,
      messageToReview,
    });
    setVoiceSendMessage("Review this message, then say yes send or press Confirm send.");
    updateVoiceSendState("reviewMessage");
    startVoiceSendExpiryTimer();
  }, [
    clearVoiceSendExpiryTimer,
    draft,
    startVoiceSendExpiryTimer,
    updateVoiceSendState,
  ]);

  const handleCancelVoiceSend = useCallback((message = "Voice send cancelled.") => {
    clearVoiceSendExpiryTimer();
    setVoiceSendSnapshot(null);
    setIsVoiceSendListening(false);
    setVoiceSendMessage(message);
    updateVoiceSendState("cancelled");
    if (isVoiceSendListening) {
      ExpoSpeechRecognitionModule.abort();
    }
  }, [
    clearVoiceSendExpiryTimer,
    isVoiceSendListening,
    updateVoiceSendState,
  ]);

  const sendReviewedVoiceMessage = useCallback(async () => {
    if (!canUseCurrentVoiceSendReview || !voiceSendSnapshot) {
      setVoiceSendMessage("Review again before voice send.");
      updateVoiceSendState("expired");
      return;
    }

    updateVoiceSendState("confirmedSend");
    setVoiceSendMessage("Voice send confirmed.");
    clearVoiceSendExpiryTimer();

    setVoiceSendMessage("Sending this reviewed message.");
    updateVoiceSendState("sending");
    const outcome = await handleSend();

    if (outcome === "offlineBlocked") {
      setVoiceSendSnapshot(null);
      setVoiceSendMessage("Voice send is paused while you’re offline. Nothing was sent.");
      updateVoiceSendState("offlineBlocked");
      return;
    }

    if (outcome === "highRiskRouted") {
      setVoiceSendSnapshot(null);
      setVoiceSendMessage("Sent. Aura is opening the normal Safety review.");
      updateVoiceSendState("highRiskRouted");
      return;
    }

    if (outcome === "sent") {
      setVoiceSendSnapshot(null);
      setVoiceSendMessage("Sent.");
      updateVoiceSendState("sent");
      return;
    }

    if (outcome === "empty") {
      setVoiceSendMessage("Voice send needs a message.");
      updateVoiceSendState("needsMessage");
      return;
    }

    if (outcome === "readOnly") {
      setVoiceSendSnapshot(null);
      setVoiceSendMessage("Messages are read-only. Nothing was sent.");
      updateVoiceSendState("expired");
      return;
    }

    if (outcome === "authRequired") {
      setVoiceSendSnapshot(null);
      setVoiceSendMessage("Your session expired. Please sign in again.");
      updateVoiceSendState("expired");
      return;
    }

    setVoiceSendMessage("Couldn’t confirm delivery. Review chat before sending again.");
    updateVoiceSendState("reviewMessage");
  }, [
    canUseCurrentVoiceSendReview,
    clearVoiceSendExpiryTimer,
    handleSend,
    updateVoiceSendState,
    voiceSendSnapshot,
  ]);

  const handleVoiceSendTranscript = useCallback(
    (transcript: string) => {
      setIsVoiceSendListening(false);
      if (voiceSendStateRef.current !== "awaitingVoiceConfirmation") {
        return;
      }

      if (!voiceSendSnapshot || voiceSendSnapshot.rawDraft !== draft) {
        clearVoiceSendExpiryTimer();
        setVoiceSendSnapshot(null);
        setVoiceSendMessage("Message changed. Review again before voice send.");
        updateVoiceSendState("draftReady");
        return;
      }

      const result = parseVoiceChatSendConfirmation(transcript);
      if (result === "confirm") {
        void sendReviewedVoiceMessage();
        return;
      }

      if (result === "cancel") {
        handleCancelVoiceSend();
        return;
      }

      setVoiceSendMessage("That was not a clear send confirmation. Say yes send, confirm send, or send message.");
      updateVoiceSendState("awaitingVoiceConfirmation");
    },
    [
      clearVoiceSendExpiryTimer,
      draft,
      handleCancelVoiceSend,
      sendReviewedVoiceMessage,
      updateVoiceSendState,
      voiceSendSnapshot,
    ],
  );

  const handleListenForVoiceSendConfirmation = useCallback(async () => {
    if (!canUseCurrentVoiceSendReview) {
      setVoiceSendMessage(
        voiceSendStateRef.current === "expired"
          ? "Voice send review expired. Review again before sending."
          : "Review again before voice send.",
      );
      updateVoiceSendState("expired");
      return;
    }

    updateVoiceSendState("awaitingVoiceConfirmation");
    setVoiceSendMessage("Listening for yes send, confirm send, or send message.");
    setIsVoiceSendListening(true);

    await stopReadAloud();

    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      setIsVoiceSendListening(false);
      setVoiceSendMessage("Voice confirmation is not available on this device. Use Confirm send or manual Send.");
      return;
    }

    if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
      setIsVoiceSendListening(false);
      setVoiceSendMessage("On-device voice confirmation is not available on this device. Use Confirm send or manual Send.");
      return;
    }

    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setIsVoiceSendListening(false);
      setVoiceSendMessage("Microphone permission was denied. Use Confirm send or manual Send.");
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
      setIsVoiceSendListening(false);
      setVoiceSendMessage("Voice confirmation could not start. Nothing was sent.");
      updateVoiceSendState("reviewMessage");
    }
  }, [canUseCurrentVoiceSendReview, updateVoiceSendState]);

  useEffect(() => {
    const startListener = ExpoSpeechRecognitionModule.addListener("start", () => {
      if (voiceSendStateRef.current === "awaitingVoiceConfirmation") {
        setIsVoiceSendListening(true);
      }
    });
    const endListener = ExpoSpeechRecognitionModule.addListener("end", () => {
      setIsVoiceSendListening(false);
    });
    const resultListener = ExpoSpeechRecognitionModule.addListener(
      "result",
      (event: ExpoSpeechRecognitionResultEvent) => {
        if (!event.isFinal || voiceSendStateRef.current !== "awaitingVoiceConfirmation") {
          return;
        }

        const transcript = event.results
          .map((result) => result.transcript.trim())
          .find((candidate) => candidate.length > 0);

        handleVoiceSendTranscript(transcript ?? "");
      },
    );
    const errorListener = ExpoSpeechRecognitionModule.addListener(
      "error",
      (_event: ExpoSpeechRecognitionErrorEvent) => {
        if (voiceSendStateRef.current === "awaitingVoiceConfirmation") {
          setIsVoiceSendListening(false);
          setVoiceSendMessage("That was not a clear send confirmation. Nothing was sent.");
        }
      },
    );
    const nomatchListener = ExpoSpeechRecognitionModule.addListener("nomatch", () => {
      if (voiceSendStateRef.current === "awaitingVoiceConfirmation") {
        setIsVoiceSendListening(false);
        setVoiceSendMessage("That was not a clear send confirmation. Nothing was sent.");
      }
    });

    return () => {
      startListener.remove();
      endListener.remove();
      resultListener.remove();
      errorListener.remove();
      nomatchListener.remove();
      if (voiceSendStateRef.current === "awaitingVoiceConfirmation") {
        ExpoSpeechRecognitionModule.abort();
      }
    };
  }, [handleVoiceSendTranscript]);

  const handleRefreshUnknownAttempt = useCallback(() => {
    void loadHistory();
  }, [loadHistory]);

  const handleDismissLocalAttempt = useCallback(() => {
    setLocalAttemptState(null);
    setNotice(null);
    void clearChatSendError();
  }, [clearChatSendError, setLocalAttemptState]);

  const localAttemptActions = useMemo(() => {
    if (!localAttempt || localAttempt.status === "sending") {
      return [];
    }

    if (localAttempt.status === "failed") {
      return [
        {
          label: "Retry",
          onPress: handleRetryLocalAttempt,
          disabled: isSending || isSafetyChecking || isOffline,
        },
        {
          label: "Dismiss",
          kind: "secondary" as const,
          onPress: handleDismissLocalAttempt,
        },
      ];
    }

    return [
      {
        label: "Refresh chat",
        onPress: handleRefreshUnknownAttempt,
        disabled: isSending || isSafetyChecking || isOffline,
      },
      {
        label: "Dismiss",
        kind: "secondary" as const,
        onPress: handleDismissLocalAttempt,
      },
    ];
  }, [
    handleDismissLocalAttempt,
    handleRefreshUnknownAttempt,
    handleRetryLocalAttempt,
    isOffline,
    isSafetyChecking,
    isSending,
    localAttempt,
  ]);

  const renderItem = useCallback(
    ({ item, index }: { item: MessageItem; index: number }) => {
      const showDaySeparator = shouldShowDaySeparator(messages, index);
      const showGroupMeta = isGroupStart(messages, index);
      const compact = !showGroupMeta && isCompactGroup(messages, index);
      const dayLabel = showDaySeparator ? formatConversationDayLabel(item.createdAt) : null;
      const timeLabel = showGroupMeta ? formatConversationTimeLabel(item.createdAt) : null;

      if (item.role === "system") {
        const isSafetySystem = item.text.toLowerCase().includes("safety");
        return (
          <View style={[styles.messageGroup, compact ? styles.messageGroupCompact : null]}>
            {dayLabel ? (
              <View style={styles.dayDivider}>
                <View style={styles.dayDividerLine} />
                <Text style={styles.dayDividerText}>{dayLabel}</Text>
                <View style={styles.dayDividerLine} />
              </View>
            ) : null}

            {timeLabel ? <Text style={styles.messageMetaText}>{`Care update · ${timeLabel}`}</Text> : null}

            <TipCard
              compact
              tone={isSafetySystem ? "safety" : "neutral"}
              leading={{
                type: "icon",
                icon: isSafetySystem ? "safety" : "info",
                tone: isSafetySystem ? "accent" : "muted",
              }}
              text={item.text}
            />
          </View>
        );
      }

      const isPatient = item.role === "patient";
      const showAssistantAvatar = !isPatient && isGroupStart(messages, index);
      const showSentLabel = isPatient && item.localId === latestPatientLocalId;
      const showInlineTip =
        !isPatient &&
        inlineAssistantTip !== null &&
        item.localId === inlineAssistantTip.targetLocalId;
      const metaLabel = isPatient ? "You" : "Care team";

      return (
        <View style={[styles.messageGroup, compact ? styles.messageGroupCompact : null]}>
          {dayLabel ? (
            <View style={styles.dayDivider}>
              <View style={styles.dayDividerLine} />
              <Text style={styles.dayDividerText}>{dayLabel}</Text>
              <View style={styles.dayDividerLine} />
            </View>
          ) : null}

          <View style={[styles.messageRow, isPatient ? styles.rowPatient : styles.rowAssistant]}>
            {!isPatient ? (
              showAssistantAvatar ? (
                <View style={styles.assistantAvatarWrap}>
                  <Avatar
                    size={28}
                    name="Aura"
                    fallback="icon"
                    iconKey="chat"
                    accessibilityLabel="Aura assistant avatar"
                  />
                </View>
              ) : (
                <View style={styles.assistantAvatarSpacer} />
              )
            ) : null}

            <View style={[styles.bubbleWrap, isPatient ? styles.patientBubbleWrap : styles.assistantBubbleWrap]}>
              {timeLabel ? (
                <Text
                  style={[
                    styles.messageMetaText,
                    isPatient ? styles.messageMetaTextRight : null,
                  ]}
                >
                  {`${metaLabel} · ${timeLabel}`}
                </Text>
              ) : null}

              <View
                style={[
                  styles.bubble,
                  isPatient ? styles.bubblePatient : styles.bubbleAssistant,
                ]}
              >
                <Text
                  style={[
                    styles.messageText,
                    isPatient ? styles.messageTextPatient : styles.messageTextAssistant,
                  ]}
                >
                  {item.text}
                </Text>
              </View>

              {!isPatient ? (
                <View style={styles.readAloudRow}>
                  <ReadAloudButton
                    text={item.text}
                    sourceId={item.id ?? item.localId}
                    testID={`chat-read-aloud-${item.id ?? item.localId}`}
                  />
                </View>
              ) : null}

              {showInlineTip && inlineAssistantTip ? (
                <TipCard
                  compact
                  tone={inlineAssistantTip.tone}
                  leading={{
                    type: "icon",
                    icon: inlineAssistantTip.icon,
                    tone: "accent",
                  }}
                  title={inlineAssistantTip.title}
                  text={inlineAssistantTip.text}
                  actions={[
                    {
                      label: inlineAssistantTip.actionLabel,
                      kind: "secondary",
                      onPress: inlineAssistantTip.action,
                    },
                  ]}
                />
              ) : null}
            </View>
          </View>

          {isPatient && showSentLabel ? (
            <View style={[styles.deliveryMetaRow, isPatient ? styles.deliveryMetaRight : null]}>
              <View style={styles.deliveryMetaItem}>
                <MaterialCommunityIcons
                  name="check"
                  size={12}
                  color={tokens.colors.textMuted}
                />
                <Text style={styles.deliveryText}>Sent</Text>
              </View>
            </View>
          ) : null}
        </View>
      );
    },
    [inlineAssistantTip, latestPatientLocalId, messages, styles, tokens.colors.textMuted]
  );

  useEffect(() => {
    if (auth.status !== "signedIn") {
      return;
    }
    void loadHistory();
  }, [auth.status, loadHistory]);

  useEffect(() => {
    if (auth.status !== "signedIn") {
      return;
    }
    void loadWorkflowTasks();
  }, [auth.status, loadWorkflowTasks]);

  useEffect(() => {
    if (!__DEV__ || auth.status !== "signedIn") {
      return;
    }

    if (devPreset === "low") {
      setDraft("I completed my exercises and feel okay.");
      setNotice({
        variant: "info",
        title: "Preset loaded",
        message: "Inserted low-risk test message.",
      });
      router.setParams({ devPreset: "", devToken: "" });
      return;
    }

    if (devPreset === "high") {
      setDraft("I have chest pain right now.");
      setNotice({
        variant: "warning",
        title: "Preset loaded",
        message: "Inserted high-risk test message.",
      });
      router.setParams({ devPreset: "", devToken: "" });
    }
  }, [auth.status, devPreset, devToken, router]);

  useEffect(() => {
    if (!focusComposer) {
      return;
    }

    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 48);

    router.setParams({ focusComposer: "" });
    return () => clearTimeout(timer);
  }, [focusComposer, router]);

  useEffect(() => {
    if (messages.length === 0) {
      return;
    }
    const timer = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: !reduceMotion });
    }, 40);
    return () => clearTimeout(timer);
  }, [messages.length, reduceMotion]);

  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    const seen = new Set<string>();
    for (const item of messages) {
      if (seen.has(item.localId)) {
        console.warn(`[chat] duplicate message key detected: ${item.localId}`);
        break;
      }
      seen.add(item.localId);
    }
  }, [messages]);

  if (auth.status === "loading") {
    return (
      <Screen title="Messages" scroll={false}>
        <View style={styles.centered}>
          <SkeletonBlock width="60%" height={18} style={styles.loadingSkeleton} />
          <SkeletonBlock width="72%" height={54} style={styles.loadingSkeleton} />
          <SkeletonBlock width="58%" height={54} style={styles.loadingSkeleton} />
        </View>
      </Screen>
    );
  }

  if (auth.status === "signedOut") {
    return <Redirect href="/(auth)/login" />;
  }

  const canReviewVoiceSend = canUseCurrentVoiceSendReview && !isSending;
  const canListenForVoiceSend =
    canReviewVoiceSend && voiceSendState !== "confirmedSend";
  const voiceSendStatusRole =
    voiceSendState === "needsMessage" ||
    voiceSendState === "offlineBlocked" ||
    voiceSendState === "expired"
      ? "alert"
      : "text";
  const voiceSendSummaryText = voiceSendSnapshot
    ? `Message to send: ${voiceSendSnapshot.messageToReview}. ${VOICE_SEND_REVIEW_COPY}`
    : VOICE_SEND_REVIEW_COPY;

  return (
    <Screen
      scroll={false}
      auditLabel="ChatScreen"
      banner={
        <TrustBanner
          status={trustStatus}
          offlineMode="onlineOnly"
          onRetry={() => {
            void loadHistory();
          }}
        />
      }
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <MessagesShell
          title="Messages"
          subtitle="Care team support"
          left={
            <Avatar
              size={40}
              name={patientLabel}
              photoUrl={patientPhotoUri ?? undefined}
              ring={trustStatus.kind === "ok" ? "ok" : "attention"}
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
              icon: "coping",
              onPress: () => {
                router.push("/coping-tools" as never);
              },
              accessibilityLabel: "Open coping tools",
              tone: "muted",
            },
          ]}
          statusContent={
            <View style={styles.statusRow}>
              <StatusPill
                label={isOffline ? "Offline" : "Live messages"}
                variant={isOffline ? "warning" : "success"}
                accessible={false}
              />
              <StatusPill
                label={chatSyncPill.label}
                variant={chatSyncPill.variant}
                accessible={false}
              />
              {isSafetyChecking ? (
                <StatusPill label="Safety check" variant="info" accessible={false} />
              ) : null}
            </View>
          }
          contextContent={
            hasHeaderContext ? (
              <View style={styles.contextBand}>
              {careModeNotice ? (
                <Banner
                  variant="info"
                  title={careModeNotice.title}
                  message={careModeNotice.message}
                />
              ) : null}

              {showingOfflineCache && !isOffline ? (
                <Banner
                  variant="info"
                  title="Showing saved messages"
                  message="Live chat is temporarily unavailable."
                />
              ) : null}

              {contextNotice ? (
                <Banner
                  variant={contextNotice.variant}
                  title={contextNotice.title}
                  message={contextNotice.message}
                  actionLabel={contextNotice.actionLabel}
                  onAction={contextNotice.action}
                />
              ) : null}

              {chatLoadLastError ? (
                <LastFailedAttempt
                  label="Last history load failure"
                  value={chatLoadErrorLabel}
                  title={chatLoadLastError.title}
                  message={chatLoadLastError.message}
                  onClear={clearChatLoadError}
                  compact
                />
              ) : null}
              </View>
            ) : null
          }
          shortcuts={messageShortcuts}
          composer={
            <GlassPanel
              fallbackVariant="surface"
              fallbackOpacity={0.9}
              style={styles.composerPanel}
              accessibilityLabel="Chat composer panel"
            >
              {isOffline ? (
                <Banner
                  variant="warning"
                  title="Offline — sending is paused"
                  message="Reconnect to send messages."
                />
              ) : null}

              {localAttempt ? (
                <TipCard
                  compact
                  tone={getLocalAttemptTone(localAttempt.status)}
                  leading={{
                    type: "icon",
                    icon:
                      localAttempt.status === "sending"
                        ? "chat"
                        : localAttempt.status === "failed"
                          ? "warning"
                          : "info",
                    tone: localAttempt.status === "sending" ? "accent" : "warning",
                  }}
                  title={getLocalAttemptTitle(localAttempt.status)}
                  text={localAttempt.text}
                  actions={localAttemptActions}
                  testID="chat-local-attempt"
                />
              ) : null}

              {messagesAvailable ? (
                <>
                  <View style={styles.voiceSendCard}>
                    <View style={styles.voiceSendHeaderRow}>
                      <View style={styles.voiceSendTitleGroup}>
                        <Text accessibilityRole="header" style={styles.voiceSendTitle}>
                          Voice send review
                        </Text>
                        <Text style={styles.voiceSendCopy}>
                          {VOICE_SEND_REVIEW_COPY}
                        </Text>
                      </View>
                      <ReadAloudButton
                        text={voiceSendSummaryText}
                        label="Read voice message summary"
                        sourceId="voice-send-review-summary"
                        testID="voice-send-review-read-summary"
                      />
                    </View>

                    {voiceSendSnapshot ? (
                      <View
                        accessible
                        accessibilityRole="summary"
                        accessibilityLabel={`Voice send message summary. Message to send: ${voiceSendSnapshot.messageToReview}`}
                        style={styles.voiceSendSummaryBox}
                      >
                        <Text selectable style={styles.voiceSendMessageText}>
                          {voiceSendSnapshot.messageToReview}
                        </Text>
                      </View>
                    ) : null}

                    <View
                      accessible
                      accessibilityRole={voiceSendStatusRole}
                      accessibilityLiveRegion="polite"
                      accessibilityLabel={`Voice send state: ${voiceSendState}. ${voiceSendMessage ?? "Ready to review."}`}
                      style={[
                        styles.voiceSendStatusBox,
                        voiceSendStatusRole === "alert" ? styles.voiceSendStatusWarning : null,
                      ]}
                    >
                      <Text style={styles.voiceSendStatusLabel}>Voice send state</Text>
                      <Text style={styles.voiceSendStatusText}>
                        {voiceSendMessage ?? "Review the message before any voice send can happen."}
                      </Text>
                    </View>

                    <View style={styles.voiceSendActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Review for voice send"
                        accessibilityHint="Builds a current exact message review before any voice send can happen."
                        onPress={handlePrepareVoiceSendReview}
                        style={({ pressed }) => [
                          styles.voiceSendSecondaryButton,
                          pressed ? styles.voiceSendButtonPressed : null,
                        ]}
                      >
                        <Text style={styles.voiceSendSecondaryButtonText}>Review for voice send</Text>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Listen for voice send confirmation"
                        accessibilityHint="Listens once for yes send, confirm send, or send message."
                        accessibilityState={{
                          disabled: !canListenForVoiceSend,
                          busy: isVoiceSendListening || undefined,
                        }}
                        disabled={!canListenForVoiceSend}
                        onPress={() => {
                          void handleListenForVoiceSendConfirmation();
                        }}
                        style={({ pressed }) => [
                          styles.voiceSendSecondaryButton,
                          !canListenForVoiceSend ? styles.voiceSendButtonDisabled : null,
                          pressed && canListenForVoiceSend ? styles.voiceSendButtonPressed : null,
                        ]}
                      >
                        {isVoiceSendListening ? (
                          <ActivityIndicator size="small" color={tokens.colors.primary} />
                        ) : null}
                        <Text style={styles.voiceSendSecondaryButtonText}>
                          Listen for confirmation
                        </Text>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Confirm voice chat send"
                        accessibilityHint="Sends the reviewed message through the same normal chat send path."
                        accessibilityState={{
                          disabled: !canReviewVoiceSend,
                          busy: isSending || undefined,
                        }}
                        disabled={!canReviewVoiceSend}
                        onPress={() => {
                          void sendReviewedVoiceMessage();
                        }}
                        style={({ pressed }) => [
                          styles.voiceSendPrimaryButton,
                          !canReviewVoiceSend ? styles.voiceSendButtonDisabled : null,
                          pressed && canReviewVoiceSend ? styles.voiceSendButtonPressed : null,
                        ]}
                      >
                        <Text style={styles.voiceSendPrimaryButtonText}>Confirm send</Text>
                      </Pressable>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Cancel voice send"
                        accessibilityHint="Clears the current voice send review without sending."
                        onPress={() => handleCancelVoiceSend()}
                        style={({ pressed }) => [
                          styles.voiceSendSecondaryButton,
                          pressed ? styles.voiceSendButtonPressed : null,
                        ]}
                      >
                        <Text style={styles.voiceSendSecondaryButtonText}>Cancel</Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.inputRow}>
                    <TextInput
                      ref={inputRef}
                      value={draft}
                      onChangeText={setDraft}
                      placeholder="Message your care team..."
                      placeholderTextColor={tokens.colors.textMuted}
                      accessibilityLabel="Message input"
                      multiline
                      maxLength={1000}
                      style={styles.input}
                      editable={!isSending}
                      textAlignVertical="top"
                    />

                    <VoiceDictationButton
                      disabled={isSending}
                      onTranscript={handleDictationTranscript}
                      testID="chat-voice-dictation"
                    />

                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={isSending ? "Sending message" : "Send message"}
                      accessibilityState={{ disabled: isSendDisabled, busy: isSending || undefined }}
                      disabled={isSendDisabled}
                      onPress={() => {
                        void handleSend();
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={({ pressed }) => [
                        styles.sendButton,
                        hasDraft && !isOffline ? styles.sendButtonReady : styles.sendButtonIdle,
                        isSendDisabled ? styles.sendButtonDisabled : null,
                        pressed && !isSendDisabled ? styles.sendButtonPressed : null,
                      ]}
                    >
                      {isSending ? (
                        <ActivityIndicator size="small" color={tokens.colors.primaryTextOn} />
                      ) : (
                        <View accessible={false} importantForAccessibility="no-hide-descendants">
                          <MaterialCommunityIcons
                            name="send"
                            size={18}
                            color={hasDraft && !isOffline ? tokens.colors.primaryTextOn : tokens.colors.primary}
                          />
                        </View>
                      )}
                    </Pressable>
                  </View>
                </>
              ) : (
                <Banner
                  variant="info"
                  title="Messages are archived"
                  message="Earlier conversation stays available here, but routine messaging is no longer active for this care status."
                />
              )}
            </GlassPanel>
          }
        >
          <Card padding={0} style={styles.conversationCard}>
            <View style={styles.listWrapper}>
              {threadLead ? <View style={styles.threadLeadWrap}>{threadLead}</View> : null}
              {isLoading && messages.length === 0 ? (
                <View style={styles.loadingList}>
                  <View style={styles.rowAssistant}>
                    <SkeletonBlock width="66%" height={56} style={styles.loadingBubble} />
                  </View>
                  <View style={styles.rowPatient}>
                    <SkeletonBlock width="52%" height={56} style={styles.loadingBubble} />
                  </View>
                  <View style={styles.rowAssistant}>
                    <SkeletonBlock width="60%" height={56} style={styles.loadingBubble} />
                  </View>
                </View>
              ) : (
                <FlatList
                  ref={listRef}
                  data={messages}
                  keyExtractor={(item) => (item.id ? `msg-${item.id}` : item.localId)}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.messageList}
                  renderItem={renderItem}
                  ListEmptyComponent={
                    <View style={styles.emptyStateContent}>
                      <EmptyState
                        variant="compact"
                        illustrationKey={isOffline ? "offline" : "chat"}
                        title={isOffline ? "Offline — message history unavailable" : "No messages yet"}
                        description={
                          isOffline
                            ? "Reconnect to load your conversation. You can write a message once the connection returns."
                            : "When you send a message here, your care team conversation will appear in this space."
                        }
                        ctaLabel={isOffline ? undefined : "Start a message"}
                        onCtaPress={
                          isOffline
                            ? undefined
                            : () => {
                                inputRef.current?.focus();
                              }
                        }
                      />

                      <View style={styles.emptyTips}>
                        <TipCard
                          tone="info"
                          leading={{ type: "icon", icon: "chat", tone: "accent" }}
                          title="Try a quick question"
                          text="You can ask about exercises, pain, or scheduling."
                          chips={["Exercises", "Pain", "Schedule"]}
                          onPress={() => {
                            setDraft("Can I do my exercises today?");
                            inputRef.current?.focus();
                          }}
                          compact
                        />
                        <TipCard
                          tone="safety"
                          leading={{ type: "icon", icon: "coping", tone: "accent" }}
                          title="Need a calming tool?"
                          text="Open coping tools for guided breathing and grounding."
                          actions={[
                            {
                              label: "Open Coping Tools",
                              kind: "secondary",
                              onPress: () => {
                                router.push("/coping-tools" as never);
                              },
                            },
                          ]}
                          compact
                        />
                      </View>
                    </View>
                  }
                />
              )}
            </View>
          </Card>
        </MessagesShell>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    flex: {
      flex: 1,
    },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: tokens.spacing.sm,
    },
    loadingSkeleton: {
      alignSelf: "center",
    },
    statusRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    contextBand: {
      gap: tokens.spacing.sm,
    },
    conversationCard: {
      flex: 1,
      backgroundColor: tokens.colors.surfaceSubtle,
      borderColor: tokens.colors.border,
      overflow: "hidden",
    },
    listWrapper: {
      flex: 1,
      minHeight: 0,
    },
    threadLeadWrap: {
      paddingHorizontal: tokens.spacing.lg,
      paddingTop: tokens.spacing.sm,
    },
    loadingList: {
      flex: 1,
      justifyContent: "center",
      gap: tokens.spacing.md,
      padding: tokens.spacing.lg,
    },
    loadingBubble: {
      borderRadius: tokens.radius.lg,
    },
    messageList: {
      paddingHorizontal: tokens.spacing.lg,
      paddingTop: tokens.spacing.sm,
      paddingBottom: tokens.spacing.xl,
      gap: tokens.spacing.xs,
    },
    emptyStateContent: {
      padding: tokens.spacing.lg,
      gap: tokens.spacing.sm,
    },
    emptyTips: {
      gap: tokens.spacing.sm,
    },
    messageGroup: {
      gap: tokens.spacing.xs,
      marginBottom: tokens.spacing.sm,
    },
    messageGroupCompact: {
      marginBottom: 2,
    },
    dayDivider: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
      marginTop: tokens.spacing.sm,
      marginBottom: tokens.spacing.xs,
    },
    dayDividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: tokens.colors.border,
    },
    dayDividerText: {
      color: tokens.colors.textTertiary,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      textAlign: "center",
      fontWeight: tokens.typography.weights.medium,
    },
    messageRow: {
      width: "100%",
      flexDirection: "row",
    },
    rowPatient: {
      justifyContent: "flex-end",
    },
    rowAssistant: {
      justifyContent: "flex-start",
      alignItems: "flex-start",
    },
    assistantAvatarWrap: {
      width: 34,
      paddingTop: 2,
      marginRight: tokens.spacing.xs,
      alignItems: "flex-start",
    },
    assistantAvatarSpacer: {
      width: 34,
      marginRight: tokens.spacing.xs,
    },
    bubbleWrap: {
      gap: tokens.spacing.xs,
      minWidth: 0,
    },
    messageMetaText: {
      color: tokens.colors.textTertiary,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    messageMetaTextRight: {
      textAlign: "right",
    },
    patientBubbleWrap: {
      maxWidth: "84%",
      alignItems: "flex-end",
    },
    assistantBubbleWrap: {
      flex: 1,
      alignItems: "flex-start",
    },
    bubble: {
      maxWidth: "100%",
      borderRadius: tokens.radius.lg,
      paddingHorizontal: tokens.spacing.lg,
      paddingVertical: tokens.spacing.md,
      borderWidth: 1,
    },
    bubblePatient: {
      backgroundColor: tokens.colors.primarySoft,
      borderColor: tokens.colors.primary,
    },
    bubbleAssistant: {
      backgroundColor: tokens.colors.surface,
      borderColor: tokens.colors.border,
    },
    messageText: {
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    messageTextPatient: {
      color: tokens.colors.text,
    },
    messageTextAssistant: {
      color: tokens.colors.text,
    },
    readAloudRow: {
      alignSelf: "flex-start",
    },
    deliveryMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
      marginTop: 2,
    },
    deliveryMetaItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    deliveryMetaRight: {
      justifyContent: "flex-end",
      paddingHorizontal: tokens.spacing.xs,
    },
    deliveryText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    composerPanel: {
      gap: tokens.spacing.sm,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.xl,
    },
    voiceSendCard: {
      gap: tokens.spacing.sm,
      padding: tokens.spacing.md,
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
    },
    voiceSendHeaderRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    voiceSendTitleGroup: {
      flex: 1,
      gap: tokens.spacing.xs,
    },
    voiceSendTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    voiceSendCopy: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    voiceSendSummaryBox: {
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surfaceSubtle,
      padding: tokens.spacing.md,
    },
    voiceSendMessageText: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    voiceSendStatusBox: {
      borderRadius: tokens.radius.md,
      backgroundColor: tokens.colors.surfaceSubtle,
      padding: tokens.spacing.sm,
      gap: 2,
    },
    voiceSendStatusWarning: {
      borderWidth: 1,
      borderColor: tokens.colors.warning,
    },
    voiceSendStatusLabel: {
      color: tokens.colors.textTertiary,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    voiceSendStatusText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    voiceSendActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    voiceSendPrimaryButton: {
      minHeight: 44,
      borderRadius: tokens.radius.md,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.colors.primary,
      borderWidth: 1,
      borderColor: tokens.colors.primary,
    },
    voiceSendSecondaryButton: {
      minHeight: 44,
      borderRadius: tokens.radius.md,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: tokens.spacing.xs,
      backgroundColor: tokens.colors.surface,
      borderWidth: 1,
      borderColor: tokens.colors.border,
    },
    voiceSendPrimaryButtonText: {
      color: tokens.colors.primaryTextOn,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    voiceSendSecondaryButtonText: {
      color: tokens.colors.primary,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    voiceSendButtonDisabled: {
      opacity: 0.55,
    },
    voiceSendButtonPressed: {
      opacity: 0.88,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: tokens.spacing.sm,
    },
    input: {
      flex: 1,
      minHeight: 56,
      maxHeight: 140,
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
    sendButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    sendButtonReady: {
      backgroundColor: tokens.colors.primary,
      borderColor: tokens.colors.primary,
    },
    sendButtonIdle: {
      backgroundColor: tokens.colors.surface,
      borderColor: tokens.colors.border,
    },
    sendButtonDisabled: {
      opacity: 0.6,
    },
    sendButtonPressed: {
      opacity: 0.88,
    },
  });
}
