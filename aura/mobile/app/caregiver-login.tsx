import { Redirect, useRouter, type Href } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { isApiError } from "@/src/api/client";
import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
import { GlassPanel } from "@/src/components/GlassPanel";
import { HeroHeader } from "@/src/components/HeroHeader";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { MediaCard } from "@/src/components/MediaCard";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { StatusPill } from "@/src/components/StatusPill";
import { TextField } from "@/src/components/TextField";
import { useCaregiverSession } from "@/src/state/caregiverSession";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { useTokens } from "@/src/theme/tokens";

function toFriendlyMessage(error: unknown): string {
  if (!isApiError(error)) {
    return "Something went wrong. Please try again.";
  }

  if (error.kind === "offline") {
    return "You’re offline. Nothing was sent.";
  }

  if (error.status === 401 || error.status === 404) {
    return "That invite code didn’t work. Check and try again.";
  }

  if (error.kind === "network") {
    return "Couldn’t reach the server. Try again.";
  }

  if (error.kind === "server") {
    return "Server error. Please try again shortly.";
  }

  return error.message || "Something went wrong. Please try again.";
}

export default function CaregiverLoginScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const caregiverSession = useCaregiverSession();
  const isOffline = useIsOffline();
  const caregiverLoginError = useLastError("caregiverLogin");

  const [inviteCode, setInviteCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [showDevDiagnostics, setShowDevDiagnostics] = useState(false);

  const handleSubmit = async () => {
    const trimmed = inviteCode.trim();
    if (!trimmed) {
      setInlineError("Please enter an invite code.");
      return;
    }

    if (isOffline) {
      const message = "You’re offline. Nothing was sent.";
      setInlineError(message);
      await caregiverLoginError.setLocalError({
        title: "Couldn’t sign in",
        message,
        kind: "offline",
        retryable: true,
      });
      return;
    }

    setInlineError(null);
    setIsSubmitting(true);
    try {
      await caregiverSession.signIn(trimmed);
      await caregiverLoginError.clear();
      router.replace("/caregiver-home" as Href);
    } catch (error) {
      const message = toFriendlyMessage(error);
      setInlineError(message);
      await caregiverLoginError.setLocalError({
        title: "Couldn’t sign in",
        message,
        kind: isApiError(error) ? error.kind : "unknown",
        retryable: isApiError(error) ? error.retryable : true,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const header = (
    <HeroHeader
      variant="compact"
      title="Caregiver access"
      subtitle="Read-only · Weekly summary"
      left={<Avatar size={40} name="Caregiver" fallback="icon" iconKey="caregiver" />}
      rightActions={[
        {
          icon: "home",
          tone: "muted",
          accessibilityLabel: "Back to Home",
          onPress: () => router.push("/(tabs)" as Href),
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

  if (caregiverSession.status === "loading") {
    return (
      <Screen scroll={false} header={header}>
        <View style={styles.centered}>
          <ActivityIndicator size="small" />
        </View>
      </Screen>
    );
  }

  if (caregiverSession.status === "signedIn") {
    return <Redirect href={"/caregiver-home" as Href} />;
  }

  return (
    <Screen scroll={false} header={header}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.content}>
          <MediaCard
            variant="emphasis"
            leading={{ type: "icon", icon: "caregiver", tone: "accent" }}
            title="Enter invite code"
            subtitle="Use the code shared from the patient app."
            chips={[
              { text: "Read-only", tone: "muted" },
              { text: "No edits", tone: "muted" },
            ]}
          />

          <View style={styles.formCard}>
            <Text style={styles.subtitle}>Enter the invite code from the patient app.</Text>
            <TextField
              label="Invite code"
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder="CG-XXXX-XXXX"
              autoCapitalize="characters"
            />
          </View>

          {inlineError ? (
            <Banner variant="danger" title="Sign-in failed" message={inlineError} />
          ) : null}

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
                <StatusPill label={showDevDiagnostics ? "Open" : "Closed"} variant="neutral" />
              </Pressable>
              {showDevDiagnostics ? (
                <LastFailedAttempt
                  value={caregiverLoginError.label}
                  title={caregiverLoginError.lastError?.title}
                  message={caregiverLoginError.lastError?.message}
                  onClear={caregiverLoginError.lastError ? caregiverLoginError.clear : undefined}
                />
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <GlassPanel style={styles.footerPanel}>
        <PrimaryButton
          label="Continue"
          loading={isSubmitting}
          disabled={isSubmitting}
          onPress={() => {
            void handleSubmit();
          }}
        />
      </GlassPanel>
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    scrollContent: {
      paddingBottom: tokens.spacing.xxxl,
    },
    content: {
      gap: tokens.spacing.md,
      paddingBottom: tokens.spacing.xl,
    },
    subtitle: {
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      color: tokens.colors.textMuted,
    },
    formCard: {
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.lg,
      backgroundColor: tokens.colors.surface,
      padding: tokens.spacing.md,
      gap: tokens.spacing.sm,
    },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    footerPanel: {
      marginTop: tokens.spacing.sm,
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
