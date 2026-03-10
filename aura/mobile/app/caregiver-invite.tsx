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
      subtitle="Share read-only support access"
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
    >
      <View style={styles.headerMetaRow}>
        <StatusPill label="Read-only" variant="neutral" />
        <StatusPill label="24h code" variant="info" />
        <StatusPill
          label={invites.length > 0 ? `${invites.length} active` : "No active codes"}
          variant={invites.length > 0 ? "success" : "neutral"}
        />
      </View>

      <View style={styles.headerStoryCard}>
        <Text style={styles.headerStoryTitle}>Invite trusted support</Text>
        <Text style={styles.headerStoryText}>
          Share a temporary code when someone needs read-only access to weekly updates, recent
          check-ins, and safety context.
        </Text>
      </View>
    </HeroHeader>
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
            subtitle={
              item.usedAt
                ? `Used ${formatISOToHuman(item.usedAt)}`
                : `Expires ${formatISOToHuman(item.expiresAt)}`
            }
            statusPill={{
              text: item.usedAt ? "Used" : "Active",
              tone: item.usedAt ? "neutral" : "success",
            }}
            chips={
              item.usedAt
                ? [{ text: "Read-only access ended", tone: "muted" }]
                : [{ text: "Read-only caregiver view", tone: "muted" }]
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
                    accessible={false}
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

            <View style={styles.sectionIntro}>
              <Text style={styles.sectionTitle}>Share access carefully</Text>
              <Text style={styles.sectionHelper}>
                Caregiver access is read-only. Each code expires after a day and should be shared
                only with someone you trust.
              </Text>
            </View>

            <MediaCard
              variant="emphasis"
              leading={{ type: "icon", icon: "caregiver", tone: "accent" }}
              title="Create caregiver invite"
              subtitle="Generate a temporary code to share weekly updates and safety context."
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
                <View style={styles.generatedHeader}>
                  <View style={styles.generatedHeaderText}>
                    <Text style={styles.generatedTitle}>Invite code ready</Text>
                    <Text style={styles.generatedLabel}>Shown once. Share it securely.</Text>
                  </View>
                  <StatusPill label="Shown once" variant="warning" />
                </View>
                <Text selectable style={styles.generatedValue}>
                  {generatedCode}
                </Text>
                <Text style={styles.generatedMeta}>
                  Expires: {generatedExpiresAt ? formatISOToHuman(generatedExpiresAt) : "—"}
                </Text>
              </View>
            ) : null}

            <View style={styles.sectionIntro}>
              <Text style={styles.sectionTitle}>Shared access</Text>
              <Text style={styles.sectionHelper}>
                Review active codes here and revoke any that should no longer open caregiver access.
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            {isLoading ? (
              <ActivityIndicator size="small" />
            ) : (
              <Banner
                variant="info"
                title="No active invites"
                message="Create an invite when someone needs a read-only caregiver summary."
              />
            )}
          </View>
        }
        ListFooterComponent={isLoading ? null : <View style={styles.listFooter} />}
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
    headerMetaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    headerStoryCard: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surface,
      padding: tokens.spacing.md,
      gap: tokens.spacing.xs,
    },
    headerStoryTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    headerStoryText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    emptyWrap: {
      minHeight: 120,
      alignItems: "center",
      justifyContent: "center",
    },
    sectionIntro: {
      gap: tokens.spacing.xs,
      paddingHorizontal: tokens.spacing.xs,
    },
    sectionTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    sectionHelper: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    generatedCard: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surface,
      padding: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    generatedHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: tokens.spacing.sm,
    },
    generatedHeaderText: {
      flex: 1,
      gap: tokens.spacing.xs,
    },
    generatedLabel: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    generatedTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
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
    listFooter: {
      height: tokens.spacing.md,
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
