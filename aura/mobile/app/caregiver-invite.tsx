import { Redirect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { isApiError, type ApiError } from "@/src/api/client";
import {
  createCaregiverInvite,
  listCaregiverInvites,
  revokeCaregiverInvite,
  type CaregiverInviteItem,
} from "@/src/api/caregiver";
import { InlineNotice } from "@/src/components/InlineNotice";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { Section } from "@/src/components/Section";
import { useAuth } from "@/src/state/auth";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { formatISOToHuman } from "@/src/utils/date";
import { normalizeUnknownError } from "@/src/utils/errors";

type NoticeState = {
  variant: "info" | "warning" | "error";
  title: string;
  message: string;
};

function toFriendlyError(error: unknown, title: string): {
  title: string;
  message: string;
  kind: "offline" | "network" | "server" | "validation" | "unknown";
  retryable: boolean;
} {
  let appError: ApiError;
  if (isApiError(error)) {
    appError = error;
  } else {
    const fallback = normalizeUnknownError(error);
    appError = {
      title: fallback.title,
      message: fallback.message,
      kind: fallback.kind,
      retryable: fallback.retryable,
      detail: fallback.detail,
    };
  }

  if (appError.kind === "offline") {
    return {
      title,
      message: "You’re offline. Nothing was sent.",
      kind: "offline",
      retryable: true,
    };
  }
  if (appError.kind === "network") {
    return {
      title,
      message: "Couldn’t reach the service. Please try again.",
      kind: "network",
      retryable: true,
    };
  }
  if (appError.kind === "server") {
    return {
      title,
      message: "Service unavailable. Please try again shortly.",
      kind: "server",
      retryable: true,
    };
  }
  if (appError.kind === "validation") {
    return {
      title,
      message: appError.message || "Please review and try again.",
      kind: "validation",
      retryable: false,
    };
  }
  return {
    title,
    message: appError.message || "Something went wrong. Please try again.",
    kind: "unknown",
    retryable: true,
  };
}

export default function CaregiverInviteScreen() {
  const auth = useAuth();
  const isOffline = useIsOffline();
  const caregiverLoadError = useLastError("caregiverLoad");

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [invites, setInvites] = useState<CaregiverInviteItem[]>([]);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [generatedExpiresAt, setGeneratedExpiresAt] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const loadInvites = useCallback(async () => {
    if (!auth.token || auth.status !== "signedIn") {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const rows = await listCaregiverInvites(auth.token);
      setInvites(rows);
      await caregiverLoadError.clear();
    } catch (error) {
      const friendly = toFriendlyError(error, "Couldn’t load caregiver invites");
      await caregiverLoadError.setLocalError({
        title: friendly.title,
        message: friendly.message,
        kind: friendly.kind,
        retryable: friendly.retryable,
      });
      setNotice({
        variant: "error",
        title: friendly.title,
        message: friendly.message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [auth.status, auth.token, caregiverLoadError]);

  useFocusEffect(
    useCallback(() => {
      if (auth.status !== "signedIn") {
        return;
      }
      void loadInvites();
      return undefined;
    }, [auth.status, loadInvites])
  );

  useEffect(() => {
    if (auth.status !== "signedIn") {
      return;
    }
    void loadInvites();
  }, [auth.status, loadInvites]);

  const handleGenerate = async () => {
    if (!auth.token) {
      return;
    }
    if (isOffline) {
      const message = "You’re offline. Nothing was sent.";
      setNotice({
        variant: "warning",
        title: "Offline",
        message,
      });
      await caregiverLoadError.setLocalError({
        title: "Couldn’t create invite",
        message,
        kind: "offline",
        retryable: true,
      });
      return;
    }

    setIsSubmitting(true);
    setNotice(null);
    try {
      const created = await createCaregiverInvite(auth.token, 24);
      setGeneratedCode(created.code);
      setGeneratedExpiresAt(created.expiresAt);
      setNotice({
        variant: "info",
        title: "Invite created",
        message: "Share this code securely. It is shown only once.",
      });
      await loadInvites();
    } catch (error) {
      const friendly = toFriendlyError(error, "Couldn’t create invite");
      await caregiverLoadError.setLocalError({
        title: friendly.title,
        message: friendly.message,
        kind: friendly.kind,
        retryable: friendly.retryable,
      });
      setNotice({
        variant: "error",
        title: friendly.title,
        message: friendly.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = async (inviteId: string) => {
    if (!auth.token) {
      return;
    }
    if (isOffline) {
      setNotice({
        variant: "warning",
        title: "Offline",
        message: "Reconnect to revoke invites.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await revokeCaregiverInvite(auth.token, inviteId);
      await loadInvites();
      setNotice({
        variant: "info",
        title: "Invite revoked",
        message: "The revoked code can no longer be used.",
      });
    } catch (error) {
      const friendly = toFriendlyError(error, "Couldn’t revoke invite");
      setNotice({
        variant: "error",
        title: friendly.title,
        message: friendly.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (auth.status === "loading") {
    return (
      <Screen title="Caregiver access">
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
    <Screen title="Caregiver access">
      <ScrollView contentContainerStyle={styles.container}>
        <Section title="Create invite code">
          <Text style={styles.helper}>
            Invite codes are temporary and tied to your account only.
          </Text>
          <PrimaryButton
            label={isSubmitting ? "Creating…" : "Generate caregiver invite"}
            disabled={isSubmitting}
            onPress={() => {
              void handleGenerate();
            }}
          />

          {generatedCode ? (
            <View style={styles.codeCard}>
              <Text style={styles.codeLabel}>Code (shown once)</Text>
              <Text style={styles.codeValue}>{generatedCode}</Text>
              <Text style={styles.codeMeta}>
                Expires: {generatedExpiresAt ? formatISOToHuman(generatedExpiresAt) : "—"}
              </Text>
            </View>
          ) : null}
        </Section>

        <Section title="Active invites">
          {isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="small" />
            </View>
          ) : invites.length === 0 ? (
            <Text style={styles.helper}>No active invites.</Text>
          ) : (
            invites.map((invite) => (
              <View key={invite.inviteId} style={styles.inviteRow}>
                <View style={styles.inviteMeta}>
                  <Text style={styles.inviteCodeHint}>•••• {invite.codeHint}</Text>
                  <Text style={styles.helper}>
                    Expires: {formatISOToHuman(invite.expiresAt)}
                  </Text>
                  {invite.usedAt ? (
                    <Text style={styles.helper}>Used: {formatISOToHuman(invite.usedAt)}</Text>
                  ) : null}
                </View>
                <PrimaryButton
                  label="Revoke"
                  disabled={isSubmitting}
                  onPress={() => {
                    void handleRevoke(invite.inviteId);
                  }}
                />
              </View>
            ))
          )}
        </Section>

        <LastFailedAttempt
          value={caregiverLoadError.label}
          title={caregiverLoadError.lastError?.title}
          message={caregiverLoadError.lastError?.message}
          onClear={caregiverLoadError.lastError ? caregiverLoadError.clear : undefined}
        />

        {notice ? (
          <InlineNotice
            variant={notice.variant}
            title={notice.title}
            message={notice.message}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingBottom: 24,
  },
  centered: {
    minHeight: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  helper: {
    fontSize: 13,
    color: "#4b5563",
  },
  codeCard: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  codeLabel: {
    fontSize: 12,
    color: "#6b7280",
  },
  codeValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: 1.2,
  },
  codeMeta: {
    fontSize: 12,
    color: "#4b5563",
  },
  inviteRow: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 10,
    gap: 10,
  },
  inviteMeta: {
    gap: 2,
  },
  inviteCodeHint: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
});
