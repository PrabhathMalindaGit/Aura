import { Alert, StyleSheet, Text, View } from "react-native";

import { InlineNotice } from "@/src/components/InlineNotice";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { LastRefreshed } from "@/src/components/LastRefreshed";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { API_BASE } from "@/src/config/env";
import { useGuardedAction } from "@/src/hooks/useGuardedAction";
import { useAuth } from "@/src/state/auth";
import {
  clearAllLastErrors,
  useLastError,
} from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import {
  clearAllLastRefreshed,
  useLastRefreshed,
} from "@/src/state/refresh";

export default function TabOneScreen() {
  const auth = useAuth();
  const isOffline = useIsOffline();
  const homeRefresh = useLastRefreshed("home");
  const chatRefresh = useLastRefreshed("chat");
  const progressRefresh = useLastRefreshed("progress");
  const chatSendError = useLastError("chatSend");
  const progressLoadError = useLastError("progressLoad");
  const { run, inlineMessage, clearInlineMessage } = useGuardedAction({
    isBlocked: isOffline,
    blockedMessage: "You’re offline. Try again when connected.",
  });

  const handleGuardedAction = () => {
    void run(async () => {
      Alert.alert("OK");
    });
  };

  const handleMarkChatRefreshed = () => {
    void chatRefresh.refreshLocal();
  };

  const handleMarkProgressRefreshed = () => {
    void progressRefresh.refreshLocal();
  };

  const handleClearStamps = () => {
    void (async () => {
      await clearAllLastRefreshed();
      await homeRefresh.reload();
      await chatRefresh.reload();
      await progressRefresh.reload();
    })();
  };

  const handleSimulateChatSendError = () => {
    void chatSendError.setLocalError({
      title: "Couldn’t send",
      message: "Offline — nothing was sent.",
      kind: "offline",
      retryable: true,
    });
  };

  const handleSimulateProgressLoadError = () => {
    void progressLoadError.setLocalError({
      title: "Couldn’t refresh",
      message: "Server not reachable.",
      kind: "server",
      retryable: true,
    });
  };

  const handleClearAllErrors = () => {
    void (async () => {
      await clearAllLastErrors();
      await chatSendError.reload();
      await progressLoadError.reload();
    })();
  };

  const handleSignOut = () => {
    void auth.signOut();
  };

  return (
    <Screen title="Aura">
      <View style={styles.container}>
        <Text style={styles.body}>Mobile foundation ready (Step 1.5).</Text>
        <Text style={styles.sessionText}>Session: {auth.status}</Text>
        <Text style={styles.sessionText}>
          Signed in as: {auth.patient?.displayName ?? auth.patient?.id ?? "Unknown"}
        </Text>
        <Text style={styles.apiText}>API: {API_BASE}</Text>
        <LastRefreshed label="Last refreshed (home)" value={homeRefresh.label} />
        <LastRefreshed label="Last refreshed (chat)" value={chatRefresh.label} />
        <LastRefreshed
          label="Last refreshed (progress)"
          value={progressRefresh.label}
        />
        <PrimaryButton
          label="Mark chat refreshed"
          onPress={handleMarkChatRefreshed}
        />
        <PrimaryButton
          label="Mark progress refreshed"
          onPress={handleMarkProgressRefreshed}
        />
        {__DEV__ ? (
          <PrimaryButton label="Clear refresh stamps" onPress={handleClearStamps} />
        ) : null}
        <LastFailedAttempt
          label="Last failed attempt (chat send)"
          value={chatSendError.label}
          title={chatSendError.lastError?.title}
          message={chatSendError.lastError?.message}
          onClear={chatSendError.lastError ? chatSendError.clear : undefined}
        />
        <LastFailedAttempt
          label="Last failed attempt (progress load)"
          value={progressLoadError.label}
          title={progressLoadError.lastError?.title}
          message={progressLoadError.lastError?.message}
          onClear={progressLoadError.lastError ? progressLoadError.clear : undefined}
        />
        {__DEV__ ? (
          <>
            <PrimaryButton
              label="Simulate chat send error"
              onPress={handleSimulateChatSendError}
            />
            <PrimaryButton
              label="Simulate progress load error"
              onPress={handleSimulateProgressLoadError}
            />
            <PrimaryButton
              label="Clear all last errors"
              onPress={handleClearAllErrors}
            />
            <PrimaryButton label="Sign out (dev)" onPress={handleSignOut} />
          </>
        ) : null}
        <PrimaryButton label="Try guarded action" onPress={handleGuardedAction} />
        {inlineMessage ? (
          <InlineNotice
            variant="warning"
            title="Action blocked"
            message={inlineMessage}
            actionLabel="Dismiss"
            onAction={clearInlineMessage}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  body: {
    fontSize: 16,
  },
  sessionText: {
    fontSize: 14,
    color: "#374151",
  },
  apiText: {
    fontSize: 14,
    color: "#4b5563",
  },
});
