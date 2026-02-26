import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  extractAssistantText,
  sendChat,
  type ChatItem,
  type ChatSendResponse,
} from "@/src/api/patient";
import { InlineNotice } from "@/src/components/InlineNotice";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { useAuth } from "@/src/state/auth";
import { getCachedChat, setCachedChat } from "@/src/state/chatCache";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { useLastRefreshed } from "@/src/state/refresh";
import { normalizeUnknownError } from "@/src/utils/errors";

// Layout: Single Screen wrapper; avoid nested ScrollView.
type MessageItem = ChatItem & {
  localId: string;
  delivery: "sent" | "failed";
};

type NoticeState = {
  variant: "info" | "warning" | "error";
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

function toPersisted(items: MessageItem[]): ChatItem[] {
  return items.map((item) => ({
    id: item.id,
    role: item.role,
    text: item.text,
    createdAt: item.createdAt,
  }));
}

function formatTime(iso?: string): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(undefined, {
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
  const chatRefresh = useLastRefreshed("chat");
  const chatLoadError = useLastError("chatLoad");
  const chatSendError = useLastError("chatSend");
  const listRef = useRef<FlatList<MessageItem>>(null);
  const lastUnsentMessageRef = useRef<string | null>(null);

  const patientId = auth.patient?.id ?? "";
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
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
        const next = updater(previous);
        persistRenderable(next);
        return next;
      });
    },
    [persistRenderable]
  );

  const loadHistory = useCallback(async () => {
    if (!auth.token || !patientId) {
      return;
    }

    setIsLoading(true);
    setNotice(null);

    if (isOffline) {
      const cached = await getCachedChat(patientId);
      if (cached && cached.length > 0) {
        setMessages(toRenderable(cached));
        setShowingOfflineCache(true);
      } else {
        setMessages([]);
        setShowingOfflineCache(false);
        setNotice({
          variant: "info",
          title: "Offline",
          message: "Connect to load chat history.",
        });
      }
      setIsLoading(false);
      return;
    }

    try {
      const history = await chatHistory(auth.token, CHAT_LIMIT);
      const renderable = toRenderable(history);
      setMessages(renderable);
      setShowingOfflineCache(false);
      await chatRefresh.refreshLocal();
      await chatLoadError.clear();
      if (patientId) {
        await setCachedChat(patientId, history);
      }
    } catch (error) {
      const normalized = normalizeChatError(error);
      const friendly = toFriendlyMessage(normalized, "Couldn’t load history");
      await chatLoadError.setLocalError({
        title: friendly.title,
        message: friendly.message,
        kind: friendly.kind,
        retryable: friendly.retryable,
      });

      const cached = await getCachedChat(patientId);
      if (cached && cached.length > 0) {
        setMessages(toRenderable(cached));
        setShowingOfflineCache(true);
      }

      setNotice({
        variant: "error",
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
      setIsLoading(false);
    }
  }, [
    auth.token,
    chatLoadError,
    chatRefresh,
    isOffline,
    patientId,
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

      if (isOffline) {
        const offlineMessage = "You’re offline. Nothing was sent.";
        await chatSendError.setLocalError({
          title: "Couldn’t send",
          message: offlineMessage,
          kind: "offline",
          retryable: true,
        });
        setNotice({
          variant: "warning",
          title: "Offline",
          message: offlineMessage,
        });
        return;
      }

      const createdAt = new Date().toISOString();
      const optimisticId = `local-patient-${Date.now()}`;
      updateMessages((previous) => [
        ...previous,
        {
          localId: optimisticId,
          role: "patient",
          text: messageToSend,
          createdAt,
          delivery: "sent",
        },
      ]);

      if (!overrideMessage) {
        setDraft("");
      }
      setNotice(null);
      setIsSending(true);

      try {
        const response: ChatSendResponse = await sendChat(auth.token, messageToSend);

        if (response.risk?.level === "high") {
          const reasonCodes = response.risk.reasonCodes ?? [];
          const params: Record<string, string> = {};
          if (response.alertId) {
            params.alertId = response.alertId;
          }
          if (reasonCodes.length > 0) {
            params.reasonCodes = reasonCodes.join(",");
          }

          await chatSendError.clear();
          updateMessages((previous) => [
            ...previous,
            {
              localId: `system-safety-${Date.now()}`,
              role: "system",
              text: "We’re concerned about your safety. Follow the steps on the next screen.",
              createdAt: new Date().toISOString(),
              delivery: "sent",
            },
          ]);

          router.push({
            pathname: "/safety",
            params,
          });
          return;
        }

        const assistantText = extractAssistantText(response) ?? ASSISTANT_FALLBACK;
        updateMessages((previous) => [
          ...previous,
          {
            localId: `assistant-${Date.now()}`,
            role: "assistant",
            text: assistantText,
            createdAt: new Date().toISOString(),
            delivery: "sent",
          },
        ]);
        await chatRefresh.refreshLocal();
        await chatSendError.clear();
        lastUnsentMessageRef.current = null;
      } catch (error) {
        const normalized = normalizeChatError(error);
        const friendly = toFriendlyMessage(normalized, "Couldn’t send");

        await chatSendError.setLocalError({
          title: friendly.title,
          message: friendly.message,
          kind: friendly.kind,
          retryable: friendly.retryable,
        });
        lastUnsentMessageRef.current = messageToSend;

        updateMessages((previous) => {
          const marked = previous.map((item) =>
            item.localId === optimisticId ? { ...item, delivery: "failed" as const } : item
          );
          return [
            ...marked,
            {
              localId: `system-failed-${Date.now()}`,
              role: "system",
              text: "Message not sent. Please try again.",
              createdAt: new Date().toISOString(),
              delivery: "failed",
            },
          ];
        });

        setNotice({
          variant: "error",
          title: friendly.title,
          message: friendly.message,
          actionLabel: friendly.retryable ? "Retry" : undefined,
          action:
            friendly.retryable && lastUnsentMessageRef.current
              ? () => {
                  const pending = lastUnsentMessageRef.current;
                  if (pending) {
                    void handleSend(pending);
                  }
                }
              : undefined,
        });
      } finally {
        setIsSending(false);
      }
    },
    [
      auth.token,
      chatRefresh,
      chatSendError,
      draft,
      isOffline,
      patientId,
      router,
      updateMessages,
    ]
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
      listRef.current?.scrollToEnd({ animated: true });
    }, 40);
    return () => clearTimeout(timer);
  }, [messages.length]);

  if (auth.status === "loading") {
    return (
      <Screen title="Chat" scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="small" />
        </View>
      </Screen>
    );
  }

  if (auth.status === "signedOut") {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Screen title="Chat" scroll={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <View style={styles.flex}>
          <View style={styles.metaSection}>
            <LastRefreshed value={chatRefresh.label} />
            <LastFailedAttempt
              label="Last history load failure"
              value={chatLoadError.label}
              title={chatLoadError.lastError?.title}
              message={chatLoadError.lastError?.message}
              onClear={chatLoadError.lastError ? chatLoadError.clear : undefined}
              compact
            />
            <LastFailedAttempt
              label="Last send failure"
              value={chatSendError.label}
              title={chatSendError.lastError?.title}
              message={chatSendError.lastError?.message}
              onClear={chatSendError.lastError ? chatSendError.clear : undefined}
              compact
            />
            {isOffline ? (
              <InlineNotice
                variant="warning"
                title="Offline"
                message="Offline — messages can’t be sent."
              />
            ) : null}
            {showingOfflineCache ? (
              <InlineNotice
                variant="info"
                title="Offline"
                message="Showing saved messages (offline)."
              />
            ) : null}
            {notice ? (
              <InlineNotice
                variant={notice.variant}
                title={notice.title}
                message={notice.message}
                actionLabel={notice.actionLabel}
                onAction={notice.action}
              />
            ) : null}
            <PrimaryButton
              label={isLoading ? "Loading…" : "Reload history"}
              loading={isLoading}
              disabled={isLoading || isSending}
              onPress={() => {
                void loadHistory();
              }}
            />
          </View>

          <View style={styles.listWrapper}>
            {isLoading && messages.length === 0 ? (
              <View style={styles.centered}>
                <ActivityIndicator size="small" />
              </View>
            ) : (
              <FlatList
                ref={listRef}
                data={messages}
                keyExtractor={(item) => item.localId}
                contentContainerStyle={styles.messageList}
                renderItem={({ item }) => {
                  const isPatient = item.role === "patient";
                  const isSystem = item.role === "system";
                  const timeLabel = formatTime(item.createdAt);
                  return (
                    <View
                      style={[
                        styles.messageRow,
                        isPatient ? styles.rowPatient : styles.rowOther,
                      ]}
                    >
                      <View
                        style={[
                          styles.bubble,
                          isPatient
                            ? styles.bubblePatient
                            : isSystem
                              ? styles.bubbleSystem
                              : styles.bubbleAssistant,
                        ]}
                      >
                        <Text
                          style={[
                            styles.messageText,
                            isPatient ? styles.messageTextPatient : styles.messageTextOther,
                          ]}
                        >
                          {item.text}
                        </Text>
                        <View style={styles.metaRow}>
                          {timeLabel ? (
                            <Text
                              style={[
                                styles.timeText,
                                isPatient ? styles.timeTextPatient : styles.timeTextOther,
                              ]}
                            >
                              {timeLabel}
                            </Text>
                          ) : null}
                          {item.delivery === "failed" ? (
                            <Text style={styles.failedLabel}>Not sent</Text>
                          ) : null}
                        </View>
                      </View>
                    </View>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>
                      {isOffline
                        ? "Connect to load chat history."
                        : "No messages yet. Start the conversation below."}
                    </Text>
                  </View>
                }
              />
            )}
          </View>

          <View style={styles.composer}>
            <TextInput
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

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  metaSection: {
    gap: 8,
    marginBottom: 8,
  },
  listWrapper: {
    flex: 1,
  },
  messageList: {
    paddingVertical: 10,
    gap: 8,
  },
  messageRow: {
    width: "100%",
    flexDirection: "row",
  },
  rowPatient: {
    justifyContent: "flex-end",
  },
  rowOther: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "82%",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  bubblePatient: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  bubbleAssistant: {
    backgroundColor: "#ffffff",
    borderColor: "#d1d5db",
  },
  bubbleSystem: {
    backgroundColor: "#f3f4f6",
    borderColor: "#d1d5db",
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  messageTextPatient: {
    color: "#ffffff",
  },
  messageTextOther: {
    color: "#111827",
  },
  metaRow: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  timeText: {
    fontSize: 11,
  },
  timeTextPatient: {
    color: "#d1d5db",
  },
  timeTextOther: {
    color: "#6b7280",
  },
  failedLabel: {
    fontSize: 11,
    color: "#b91c1c",
    fontWeight: "600",
  },
  emptyContainer: {
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    color: "#6b7280",
  },
  composer: {
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 10,
    gap: 8,
    paddingBottom: 4,
  },
  input: {
    minHeight: 64,
    maxHeight: 140,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: "#ffffff",
  },
});
