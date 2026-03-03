import { Redirect, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { isApiError, type ApiError } from "@/src/api/client";
import {
  createCaregiverInvite,
  listCaregiverInvites,
  revokeCaregiverInvite,
  type CaregiverInviteItem,
} from "@/src/api/caregiver";
import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
import { HeroHeader } from "@/src/components/HeroHeader";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { MediaCard } from "@/src/components/MediaCard";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { StatusPill } from "@/src/components/StatusPill";
import { useAuth } from "@/src/state/auth";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { useTokens } from "@/src/theme/tokens";
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

function mapNoticeVariant(
  variant: NoticeState["variant"],
): "info" | "warning" | "danger" {
  if (variant === "error") {
    return "danger";
  }
  return variant;
}

export default function CaregiverInviteScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const auth = useAuth();
  const isOffline = useIsOffline();
  const caregiverLoadError = useLastError("caregiverLoad");

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [invites, setInvites] = useState<CaregiverInviteItem[]>([]);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [generatedExpiresAt, setGeneratedExpiresAt] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [showDevDiagnostics, setShowDevDiagnostics] = useState(false);

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

  const header = (
    <HeroHeader
      variant="compact"
      title="Caregiver access"
      subtitle="Share read-only access"
      left={<Avatar size={40} name="Caregiver" fallback="icon" iconKey="caregiver" />}
      rightActions={[
        {
          icon: "settings",
          tone: "muted",
          accessibilityLabel: "Back to settings",
          onPress: () => router.push("/(tabs)/settings" as Href),
        },
        {
          icon: "safety",
          tone: "warning",
          accessibilityLabel: "Open Safety support",
          onPress: () => router.push("/safety" as Href),
        },
      ]}
    />
  );

  if (auth.status === "loading") {
    return (
      <Screen scroll={false} header={header}>
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
    <Screen scroll={false} header={header}>
      <FlatList
        data={isLoading ? [] : invites}
        keyExtractor={(item) => item.inviteId}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <MediaCard
            leading={{ type: "icon", icon: "caregiver", tone: "accent" }}
            title={`•••• ${item.codeHint}`}
            subtitle={`Expires: ${formatISOToHuman(item.expiresAt)}`}
            chips={
              item.usedAt
                ? [{ text: `Used: ${formatISOToHuman(item.usedAt)}`, tone: "muted" }]
                : [{ text: "Active", tone: "muted" }]
            }
            actions={[
              {
                label: "Revoke",
                kind: "secondary",
                disabled: isSubmitting,
                onPress: () => {
                  void handleRevoke(item.inviteId);
                },
              },
            ]}
          />
        )}
        ListHeaderComponent={
          <View style={styles.content}>
            {__DEV__ ? (
              <View style={styles.devCard}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Toggle diagnostics"
                  onPress={() => setShowDevDiagnostics((value) => !value)}
                  style={({ pressed }) => [
                    styles.devRow,
                    pressed ? styles.devRowPressed : null,
                  ]}
                >
                  <Text style={styles.devTitle}>Diagnostics (dev)</Text>
                  <StatusPill
                    label={showDevDiagnostics ? "Open" : "Closed"}
                    variant="neutral"
                  />
                </Pressable>
                {showDevDiagnostics ? (
                  <LastFailedAttempt
                    value={caregiverLoadError.label}
                    title={caregiverLoadError.lastError?.title}
                    message={caregiverLoadError.lastError?.message}
                    onClear={caregiverLoadError.lastError ? caregiverLoadError.clear : undefined}
                  />
                ) : null}
              </View>
            ) : null}

            {notice ? (
              <Banner
                variant={mapNoticeVariant(notice.variant)}
                title={notice.title}
                message={notice.message}
              />
            ) : null}

            <MediaCard
              variant="emphasis"
              leading={{ type: "icon", icon: "caregiver", tone: "accent" }}
              title="Create invite code"
              subtitle="Invite codes are temporary and tied to your account."
              chips={[
                { text: "Read-only", tone: "muted" },
                { text: "Temporary", tone: "muted" },
              ]}
              actions={[
                {
                  label: isSubmitting ? "Creating…" : "Generate caregiver invite",
                  onPress: () => {
                    void handleGenerate();
                  },
                  disabled: isSubmitting,
                  kind: "primary",
                },
              ]}
            />

            {generatedCode ? (
              <View style={styles.generatedCard}>
                <Text style={styles.generatedLabel}>Code (shown once)</Text>
                <Text selectable style={styles.generatedValue}>
                  {generatedCode}
                </Text>
                <Text style={styles.generatedMeta}>
                  Expires: {generatedExpiresAt ? formatISOToHuman(generatedExpiresAt) : "—"}
                </Text>
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>Active invites</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            {isLoading ? (
              <ActivityIndicator size="small" />
            ) : (
              <Banner variant="info" title="No active invites" message="Create an invite to grant caregiver access." />
            )}
          </View>
        }
      />
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    listContent: {
      gap: tokens.spacing.md,
      paddingBottom: tokens.spacing.xxxl,
    },
    content: {
      gap: tokens.spacing.md,
    },
    emptyWrap: {
      minHeight: 120,
      alignItems: "center",
      justifyContent: "center",
    },
    sectionTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      marginTop: tokens.spacing.xs,
    },
    generatedCard: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surface,
      padding: tokens.spacing.md,
      gap: tokens.spacing.xs,
    },
    generatedLabel: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    generatedValue: {
      color: tokens.colors.text,
      fontSize: 24,
      lineHeight: 30,
      fontWeight: tokens.typography.weights.semibold,
      letterSpacing: 1,
    },
    generatedMeta: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    devCard: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surface,
      padding: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    devRow: {
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
      borderRadius: tokens.radius.md,
    },
    devRowPressed: {
      opacity: 0.86,
    },
    devTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
  });
}
