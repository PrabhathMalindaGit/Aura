import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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
  type ChatSendResponse,
} from "@/src/api/patient";
import { listPatientTasks } from "@/src/api/tasks";
import { Avatar } from "@/src/components/Avatar";
import { Banner, type BannerVariant } from "@/src/components/Banner";
import { WorkflowMessageCard } from "@/src/components/communication/WorkflowMessageCard";
import { EmptyState } from "@/src/components/EmptyState";
import { GlassPanel } from "@/src/components/GlassPanel";
import { HeroHeader } from "@/src/components/HeroHeader";
import { DomainIcon, type DomainIconKey } from "@/src/components/IconSet";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { Screen } from "@/src/components/Screen";
import { SkeletonBlock } from "@/src/components/Skeleton";
import { TipCard } from "@/src/components/TipCard";
import { TrustBanner } from "@/src/components/TrustBanner";
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
import { useLastRefreshed } from "@/src/state/refresh";
import { useTrustStatus } from "@/src/state/trustStatus";
import { useTokens } from "@/src/theme/tokens";
import type { PatientTaskItem } from "@/src/types/task";
import { useDevRenderAudit } from "@/src/dev/renderAudit";
import { formatPatientChatTimestamp } from "@/src/utils/date";
import { normalizeUnknownError } from "@/src/utils/errors";
import {
  derivePatientTaskAction,
  formatPatientTaskSourceLabel,
  formatTaskDueLabel,
  formatTaskSupportText,
  formatTaskTitle,
  groupTasksByPatientIntent,
  isCommunicationTask,
} from "@/src/utils/tasks";

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

type ChatDevParams = {
  devPreset?: string | string[];
  devToken?: string | string[];
  focusComposer?: string | string[];
};

const CHAT_LIMIT = 50;
const TIMESTAMP_GAP_MS = 30 * 60 * 1000;
const TIMESTAMP_SENDER_CHANGE_GAP_MS = 10 * 60 * 1000;
const COMPACT_GROUP_GAP_MS = 5 * 60 * 1000;

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

function toMessageTime(iso?: string): number | null {
  if (!iso) {
    return null;
  }
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
}

function shouldShowTimestamp(items: MessageItem[], index: number): boolean {
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
    return current.role !== previous.role;
  }

  const gap = Math.abs(currentTs - previousTs);
  if (gap >= TIMESTAMP_GAP_MS) {
    return true;
  }

  if (current.role !== previous.role && gap >= TIMESTAMP_SENDER_CHANGE_GAP_MS) {
    return true;
  }

  return false;
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

function formatTimestampLabel(iso?: string): string | null {
  return formatPatientChatTimestamp(iso);
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
    label: chatSendErrorLabel,
    lastError: chatSendLastError,
    setLocalError: setChatSendError,
    clear: clearChatSendError,
  } = useLastError("chatSend");

  const listRef = useRef<FlatList<MessageItem>>(null);
  const inputRef = useRef<TextInput>(null);
  const isLoadingHistoryRef = useRef(false);
  const messagesRef = useRef<MessageItem[]>([]);
  const localAttemptRef = useRef<ChatLocalAttempt | null>(null);

  const patientId = auth.patient?.id ?? "";
  const patientLabel = auth.patient?.displayName ?? auth.patient?.id ?? "Patient";
  const patientPhotoUri = useMemo(() => extractPatientPhotoUri(auth.patient), [auth.patient]);
  const trustStatus = useTrustStatus({
    patientId,
    errorRecords: [chatLoadLastError, chatSendLastError],
    includePendingSync: false,
  });

  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [localAttempt, setLocalAttempt] = useState<ChatLocalAttempt | null>(null);
  const [workflowTasks, setWorkflowTasks] = useState<PatientTaskItem[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isSafetyChecking, setIsSafetyChecking] = useState(false);
  const [showingOfflineCache, setShowingOfflineCache] = useState(false);
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
    () => isSending || isOffline || !draft.trim(),
    [draft, isOffline, isSending]
  );

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
        setShowingOfflineCache(Boolean(cached && cached.confirmedMessages.length > 0));
        return;
      }

      const history = await chatHistory(auth.token, CHAT_LIMIT);
      replaceConfirmedHistory(history, false);
      setShowingOfflineCache(false);
      await refreshChatStamp();
      await clearChatLoadError();
      persistChatSnapshot(
        dedupeMessagesByIdentity(toRenderable(history)),
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

  const handleSend = useCallback(
    async (overrideMessage?: string) => {
      if (!auth.token || !patientId) {
        router.replace("/(auth)/login");
        return;
      }

      const messageToSend = (overrideMessage ?? draft).trim();
      if (!messageToSend) {
        return;
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
        return;
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
          return;
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
      } finally {
        setIsSafetyChecking(false);
        setIsSending(false);
      }
    },
    [
      auth.token,
      clearChatSendError,
      draft,
      isOffline,
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
      const showTimestamp = shouldShowTimestamp(messages, index);
      const compact = !showTimestamp && isCompactGroup(messages, index);
      const timestampLabel = showTimestamp ? formatTimestampLabel(item.createdAt) : null;

      if (item.role === "system") {
        const isSafetySystem = item.text.toLowerCase().includes("safety");
        return (
          <View style={[styles.messageGroup, compact ? styles.messageGroupCompact : null]}>
            {timestampLabel ? (
              <Text style={styles.timestampLabel}>{timestampLabel}</Text>
            ) : null}
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

      return (
        <View style={[styles.messageGroup, compact ? styles.messageGroupCompact : null]}>
          {timestampLabel ? <Text style={styles.timestampLabel}>{timestampLabel}</Text> : null}

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
        message: "Inserted low-risk demo message.",
      });
      router.setParams({ devPreset: "", devToken: "" });
      return;
    }

    if (devPreset === "high") {
      setDraft("I have chest pain right now.");
      setNotice({
        variant: "warning",
        title: "Preset loaded",
        message: "Inserted high-risk demo message.",
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
      <Screen title="Chat" scroll={false}>
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

  return (
    <Screen
      scroll={false}
      auditLabel="ChatScreen"
      header={
        <HeroHeader
          variant="compact"
          title="Chat"
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
              tone: "warning",
            },
            {
              icon: "coping",
              onPress: () => {
                router.push("/coping-tools" as never);
              },
              accessibilityLabel: "Open coping tools",
              tone: "accent",
            },
          ]}
        />
      }
      // Banner belongs in Screen.banner; do not duplicate inside list header/items.
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
        <View style={styles.flex}>
          <View style={styles.metaArea}>
            <Text style={styles.metaText}>Last updated: {chatRefreshLabel}</Text>

            {communicationPrompts.length > 0 ? (
              <View style={styles.promptStack}>
                {communicationPrompts.map((task) => {
                  const action = derivePatientTaskAction(task);
                  return (
                    <WorkflowMessageCard
                      key={task.id}
                      compact
                      title={formatTaskTitle(task)}
                      text={formatTaskSupportText(task)}
                      chips={[formatTaskDueLabel(task), formatPatientTaskSourceLabel(task)].filter(
                        (value): value is string => Boolean(value),
                      )}
                      tone={task.priority === "urgent" || task.priority === "high" ? "warning" : "info"}
                      actionLabel={action.label}
                      onAction={() => {
                        router.push(action.href as never);
                      }}
                    />
                  );
                })}
              </View>
            ) : null}

            {showingOfflineCache && !isOffline ? (
              <Banner
                variant="info"
                title="Showing saved messages"
                message="Live chat is temporarily unavailable."
              />
            ) : null}

            {notice ? (
              <Banner
                variant={notice.variant}
                title={notice.title}
                message={notice.message}
                actionLabel={notice.actionLabel}
                onAction={notice.action}
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

            {chatSendLastError ? (
              <LastFailedAttempt
                label="Last send failure"
                value={chatSendErrorLabel}
                title={chatSendLastError.title}
                message={chatSendLastError.message}
                onClear={clearChatSendError}
                compact
              />
            ) : null}
          </View>

          <View style={styles.listWrapper}>
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
                      title={isOffline ? "Offline — chat history unavailable" : "No messages yet"}
                      description={
                        isOffline
                          ? "Connect to load conversation history."
                          : "Start with a message below."
                      }
                      ctaLabel={isOffline ? undefined : "Send a message"}
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

          <View style={styles.composerWrap}>
            <GlassPanel
              fallbackVariant="elevated"
              fallbackOpacity={0.78}
              style={styles.composerPanel}
              accessibilityLabel="Chat composer panel"
            >
              {isSafetyChecking ? (
                <Banner
                  variant="info"
                  title="Safety check in progress…"
                  message="Please wait a moment."
                />
              ) : null}

              {isOffline ? (
                <Banner
                  variant="warning"
                  title="Offline — chat send is disabled"
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

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.quickActionsRow}
              >
                {quickActions.map((action) => (
                  <Pressable
                    key={action.key}
                    accessibilityRole="button"
                    accessibilityLabel={action.accessibilityLabel}
                    accessibilityState={{ disabled: false }}
                    onPress={() => {
                      router.push(action.route as never);
                    }}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    style={({ pressed }) => [
                      styles.quickActionChip,
                      pressed ? styles.quickActionChipPressed : null,
                    ]}
                  >
                    <View
                      accessible={false}
                      importantForAccessibility="no-hide-descendants"
                      style={styles.quickActionIconWrap}
                    >
                      <DomainIcon
                        icon={action.icon}
                        tone="accent"
                        size={16}
                        accessibilityLabel={`${action.label} icon`}
                      />
                    </View>
                    <Text style={styles.quickActionChipText}>{action.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <View style={styles.inputRow}>
                <TextInput
                  ref={inputRef}
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Type your message..."
                  accessibilityLabel="Message input"
                  multiline
                  maxLength={1000}
                  style={styles.input}
                  editable={!isSending}
                  textAlignVertical="top"
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
                    isSendDisabled ? styles.sendButtonDisabled : null,
                    pressed && !isSendDisabled ? styles.sendButtonPressed : null,
                  ]}
                >
                  {isSending ? (
                    <ActivityIndicator size="small" color={tokens.colors.primaryTextOn} />
                  ) : (
                    <View
                      accessible={false}
                      importantForAccessibility="no-hide-descendants"
                    >
                      <MaterialCommunityIcons
                        name="send"
                        size={18}
                        color={tokens.colors.primaryTextOn}
                      />
                    </View>
                  )}
                </Pressable>
              </View>
            </GlassPanel>
          </View>
        </View>
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
    metaArea: {
      gap: tokens.spacing.xs,
      marginBottom: tokens.spacing.sm,
    },
    promptStack: {
      gap: tokens.spacing.sm,
      marginBottom: tokens.spacing.xs,
    },
    metaText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    listWrapper: {
      flex: 1,
    },
    loadingList: {
      flex: 1,
      justifyContent: "center",
      gap: tokens.spacing.md,
    },
    loadingBubble: {
      borderRadius: tokens.radius.lg,
    },
    messageList: {
      paddingVertical: tokens.spacing.sm,
      paddingBottom: tokens.spacing.lg,
      gap: tokens.spacing.xs,
    },
    emptyStateContent: {
      gap: tokens.spacing.md,
    },
    emptyTips: {
      gap: tokens.spacing.sm,
    },
    messageGroup: {
      gap: tokens.spacing.xs,
      marginBottom: tokens.spacing.xs,
    },
    messageGroupCompact: {
      marginBottom: 2,
    },
    timestampLabel: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      textAlign: "center",
      marginVertical: tokens.spacing.xs,
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
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm + 2,
      borderWidth: 1,
    },
    bubblePatient: {
      backgroundColor: tokens.colors.primary,
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
      color: tokens.colors.primaryTextOn,
    },
    messageTextAssistant: {
      color: tokens.colors.text,
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
    composerWrap: {
      borderTopWidth: 1,
      borderTopColor: tokens.colors.border,
      paddingTop: tokens.spacing.sm,
      paddingBottom: tokens.spacing.xs,
      backgroundColor: tokens.colors.background,
    },
    composerPanel: {
      gap: tokens.spacing.sm,
    },
    quickActionsRow: {
      gap: tokens.spacing.sm,
      paddingRight: tokens.spacing.sm,
    },
    quickActionChip: {
      minHeight: 44,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.xl,
      backgroundColor: tokens.colors.surface,
      paddingHorizontal: tokens.spacing.md,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: tokens.spacing.xs,
    },
    quickActionChipPressed: {
      opacity: 0.82,
    },
    quickActionChipText: {
      color: tokens.colors.text,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    quickActionIconWrap: {
      justifyContent: "center",
      alignItems: "center",
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: tokens.spacing.sm,
    },
    input: {
      flex: 1,
      minHeight: 64,
      maxHeight: 140,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.md,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      color: tokens.colors.text,
      backgroundColor: tokens.colors.surface,
    },
    sendButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.colors.primary,
    },
    sendButtonDisabled: {
      opacity: 0.5,
    },
    sendButtonPressed: {
      opacity: 0.88,
    },
  });
}
