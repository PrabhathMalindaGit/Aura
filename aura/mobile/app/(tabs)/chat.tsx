import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
  extractAssistantText,
  sendChat,
  type ChatItem,
  type ChatSendResponse,
} from "@/src/api/patient";
import { Banner, type BannerVariant } from "@/src/components/Banner";
import { EmptyState } from "@/src/components/EmptyState";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { SkeletonBlock } from "@/src/components/Skeleton";
import { TrustBanner } from "@/src/components/TrustBanner";
import { useAuth } from "@/src/state/auth";
import { getCachedChat, setCachedChat } from "@/src/state/chatCache";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { useLastRefreshed } from "@/src/state/refresh";
import { useTrustStatus } from "@/src/state/trustStatus";
import { useTokens } from "@/src/theme/tokens";
import { normalizeUnknownError } from "@/src/utils/errors";

// Layout: Single Screen wrapper; avoid nested ScrollView.
type MessageDelivery = "sending" | "sent" | "failed";

type MessageItem = ChatItem & {
  localId: string;
  delivery: MessageDelivery;
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
};

const CHAT_LIMIT = 50;
const ASSISTANT_FALLBACK =
  "Thanks for checking in. Please continue your plan and let us know if anything changes.";
const TIMESTAMP_GAP_MS = 30 * 60 * 1000;
const TIMESTAMP_SENDER_CHANGE_GAP_MS = 10 * 60 * 1000;
const COMPACT_GROUP_GAP_MS = 5 * 60 * 1000;

const QUICK_PROMPTS = [
  "Pain is worse today",
  "Can I do my exercises?",
  "I feel anxious",
  "My sleep was bad",
  "What should I do now?",
] as const;

function toLocalId(item: ChatItem, index: number): string {
  if (item.id) {
    return `server-${item.id}`;
  }
  if (item.createdAt) {
    return `${item.role}-${item.createdAt}-${index}`;
  }
  return `${item.role}-${index}-${item.text.slice(0, 12)}`;
}

function toRenderable(items: ChatItem[]): MessageItem[] {
  return items.map((item, index) => ({
    ...item,
    localId: toLocalId(item, index),
    delivery: "sent",
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

function formatTimestampLabel(iso?: string): string | null {
  if (!iso) {
    return null;
  }

  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
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

  const {
    label: chatRefreshLabel,
    refreshLocal: refreshChatStamp,
  } = useLastRefreshed("chat");
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
  const lastUnsentMessageRef = useRef<string | null>(null);

  const patientId = auth.patient?.id ?? "";
  const trustStatus = useTrustStatus({
    patientId,
    errorRecords: [chatLoadLastError, chatSendLastError],
  });

  const [messages, setMessages] = useState<MessageItem[]>([]);
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

  const persistRenderable = useCallback(
    (nextMessages: MessageItem[]) => {
      if (!patientId) {
        return;
      }
      void setCachedChat(patientId, toPersisted(nextMessages));
    },
    [patientId]
  );

  const updateMessages = useCallback(
    (updater: (previous: MessageItem[]) => MessageItem[]) => {
      setMessages((previous) => {
        const next = dedupeMessagesByIdentity(updater(previous));
        persistRenderable(next);
        return next;
      });
    },
    [persistRenderable]
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
        if (cached && cached.length > 0) {
          setMessages(dedupeMessagesByIdentity(toRenderable(cached)));
          setShowingOfflineCache(true);
        } else {
          setMessages([]);
          setShowingOfflineCache(false);
          setNotice(null);
        }
        return;
      }

      const history = await chatHistory(auth.token, CHAT_LIMIT);
      const renderable = dedupeMessagesByIdentity(toRenderable(history));
      setMessages(renderable);
      setShowingOfflineCache(false);
      await refreshChatStamp();
      await clearChatLoadError();
      if (patientId) {
        await setCachedChat(patientId, history);
      }
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
      if (cached && cached.length > 0) {
        setMessages(dedupeMessagesByIdentity(toRenderable(cached)));
        setShowingOfflineCache(true);
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
    refreshChatStamp,
    isOffline,
    patientId,
    setChatLoadError,
  ]);

  const handleSend = useCallback(
    async (overrideMessage?: string, retryLocalId?: string) => {
      if (!auth.token || !patientId) {
        router.replace("/(auth)/login");
        return;
      }

      const messageToSend = (overrideMessage ?? draft).trim();
      if (!messageToSend) {
        return;
      }

      if (isOffline) {
        const offlineMessage = "You’re offline. Nothing was sent.";
        await setChatSendError({
          title: "Couldn’t send",
          message: offlineMessage,
          kind: "offline",
          retryable: true,
        });
        setNotice({
          variant: "warning",
          title: "Couldn’t send",
          message: offlineMessage,
        });
        return;
      }

      let targetLocalId = retryLocalId;
      if (retryLocalId) {
        updateMessages((previous) =>
          previous.map((item) =>
            item.localId === retryLocalId ? { ...item, delivery: "sending" } : item
          )
        );
      } else {
        targetLocalId = `local-patient-${Date.now()}`;
        const optimisticMessage: MessageItem = {
          localId: targetLocalId,
          role: "patient",
          text: messageToSend,
          createdAt: new Date().toISOString(),
          delivery: "sending",
        };
        updateMessages((previous) => [...previous, optimisticMessage]);
      }

      if (!retryLocalId) {
        setDraft("");
      }

      setNotice(null);
      setIsSending(true);
      setIsSafetyChecking(true);

      try {
        const response: ChatSendResponse = await sendChat(auth.token, messageToSend);
        await clearChatSendError();

        if (response.risk?.level === "high") {
          const reasonCodes = response.risk.reasonCodes ?? [];
          const routeParams: Record<string, string> = {};
          if (response.alertId) {
            routeParams.alertId = response.alertId;
          }
          if (reasonCodes.length > 0) {
            routeParams.reasonCodes = reasonCodes.join(",");
          }

          updateMessages((previous) => {
            const marked: MessageItem[] = previous.map((item) =>
              item.localId === targetLocalId
                ? { ...item, delivery: "sent" as const }
                : item
            );
            return [
              ...marked,
              {
                localId: `system-safety-${Date.now()}`,
                role: "system",
                text: "Safety support is active. See the Safety screen.",
                createdAt: new Date().toISOString(),
                delivery: "sent" as const,
              },
            ];
          });

          router.push({
            pathname: "/safety",
            params: routeParams,
          });
          return;
        }

        const assistantText = extractAssistantText(response) ?? ASSISTANT_FALLBACK;

        updateMessages((previous) => {
          const marked: MessageItem[] = previous.map((item) =>
            item.localId === targetLocalId
              ? { ...item, delivery: "sent" as const }
              : item
          );
          return [
            ...marked,
            {
              localId: `assistant-${Date.now()}`,
              role: "assistant",
              text: assistantText,
              createdAt: new Date().toISOString(),
              delivery: "sent" as const,
            },
          ];
        });

        await refreshChatStamp();
        lastUnsentMessageRef.current = null;
      } catch (error) {
        const normalized = normalizeChatError(error);
        const friendly = toFriendlyMessage(normalized, "Couldn’t send");

        await setChatSendError({
          title: friendly.title,
          message: friendly.message,
          kind: friendly.kind,
          retryable: friendly.retryable,
        });
        lastUnsentMessageRef.current = messageToSend;

        updateMessages((previous) =>
          previous.map((item) =>
            item.localId === targetLocalId ? { ...item, delivery: "failed" } : item
          )
        );

        setNotice({
          variant: "warning",
          title: friendly.title,
          message: friendly.message,
          actionLabel: friendly.retryable && Boolean(targetLocalId) ? "Retry" : undefined,
          action:
            friendly.retryable && targetLocalId
              ? () => {
                  void handleSend(messageToSend, targetLocalId);
                }
              : undefined,
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
      refreshChatStamp,
      router,
      setChatSendError,
      updateMessages,
    ]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: MessageItem; index: number }) => {
      const showTimestamp = shouldShowTimestamp(messages, index);
      const compact = !showTimestamp && isCompactGroup(messages, index);
      const timestampLabel = showTimestamp ? formatTimestampLabel(item.createdAt) : null;

      if (item.role === "system") {
        return (
          <View style={[styles.messageGroup, compact ? styles.messageGroupCompact : null]}>
            {timestampLabel ? (
              <Text style={styles.timestampLabel}>{timestampLabel}</Text>
            ) : null}
            <View style={styles.systemWrap}>
              <Text style={styles.systemText}>{item.text}</Text>
            </View>
          </View>
        );
      }

      const isPatient = item.role === "patient";
      const showSentLabel =
        isPatient && item.delivery === "sent" && item.localId === latestPatientLocalId;

      return (
        <View style={[styles.messageGroup, compact ? styles.messageGroupCompact : null]}>
          {timestampLabel ? <Text style={styles.timestampLabel}>{timestampLabel}</Text> : null}

          <View style={[styles.messageRow, isPatient ? styles.rowPatient : styles.rowAssistant]}>
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
          </View>

          {isPatient ? (
            <View style={[styles.deliveryMetaRow, isPatient ? styles.deliveryMetaRight : null]}>
              {item.delivery === "sending" ? (
                <Text style={styles.deliveryText}>Sending…</Text>
              ) : null}

              {showSentLabel ? <Text style={styles.deliveryText}>Sent</Text> : null}

              {item.delivery === "failed" ? (
                <>
                  <Text style={styles.deliveryFailedText}>Failed to send</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Retry message"
                    onPress={() => {
                      void handleSend(item.text, item.localId);
                    }}
                    style={({ pressed }) => [
                      styles.retryInlineButton,
                      pressed ? styles.retryInlineButtonPressed : null,
                    ]}
                  >
                    <Text style={styles.retryInlineText}>Retry</Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          ) : null}
        </View>
      );
    },
    [handleSend, latestPatientLocalId, messages, styles]
  );

  useEffect(() => {
    if (auth.status !== "signedIn") {
      return;
    }
    void loadHistory();
  }, [auth.status, loadHistory]);

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
      title="Chat"
      scroll={false}
      // Banner belongs in Screen.banner; do not duplicate inside list header/items.
      banner={
        <TrustBanner
          status={trustStatus}
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

            {isSafetyChecking ? (
              <Banner
                variant="info"
                title="Safety check in progress…"
                message="Please wait a moment."
              />
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
                }
              />
            )}
          </View>

          <View style={styles.composerWrap}>
            {!isSafetyChecking ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.promptRow}
              >
                {QUICK_PROMPTS.map((prompt) => (
                  <Pressable
                    key={prompt}
                    accessibilityRole="button"
                    accessibilityLabel={`Use quick prompt: ${prompt}`}
                    onPress={() => {
                      setDraft(prompt);
                      inputRef.current?.focus();
                    }}
                    style={({ pressed }) => [
                      styles.promptChip,
                      pressed ? styles.promptChipPressed : null,
                    ]}
                  >
                    <Text style={styles.promptChipText}>{prompt}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            <TextInput
              ref={inputRef}
              value={draft}
              onChangeText={setDraft}
              placeholder="Type your message..."
              multiline
              maxLength={1000}
              style={styles.input}
              editable={!isSending}
              textAlignVertical="top"
            />

            <PrimaryButton
              label={isSending ? "Sending…" : "Send"}
              loading={isSending}
              disabled={isSendDisabled}
              onPress={() => {
                void handleSend();
              }}
            />
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
    },
    bubble: {
      maxWidth: "84%",
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
    systemWrap: {
      alignSelf: "center",
      maxWidth: "90%",
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surfaceElevated,
      borderRadius: tokens.radius.md,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
    },
    systemText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      textAlign: "center",
      fontWeight: tokens.typography.weights.medium,
    },
    deliveryMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.sm,
      marginTop: 2,
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
    deliveryFailedText: {
      color: tokens.colors.warning,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    retryInlineButton: {
      paddingVertical: 2,
    },
    retryInlineButtonPressed: {
      opacity: 0.8,
    },
    retryInlineText: {
      color: tokens.colors.accent,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    composerWrap: {
      borderTopWidth: 1,
      borderTopColor: tokens.colors.border,
      paddingTop: tokens.spacing.sm,
      paddingBottom: tokens.spacing.xs,
      gap: tokens.spacing.sm,
      backgroundColor: tokens.colors.background,
    },
    promptRow: {
      gap: tokens.spacing.sm,
      paddingRight: tokens.spacing.sm,
    },
    promptChip: {
      minHeight: 40,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.xl,
      backgroundColor: tokens.colors.surface,
      paddingHorizontal: tokens.spacing.md,
      alignItems: "center",
      justifyContent: "center",
    },
    promptChipPressed: {
      opacity: 0.82,
    },
    promptChipText: {
      color: tokens.colors.text,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    input: {
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
  });
}
