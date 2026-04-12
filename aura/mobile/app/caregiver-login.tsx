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
  const [caregiverName, setCaregiverName] = useState("");
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
      await caregiverSession.signIn(trimmed, caregiverName.trim() || undefined);
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
      subtitle="Read-only support companion"
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
    >
      <View style={styles.headerMetaRow}>
        <StatusPill label="Invite code" variant="info" />
        <StatusPill label="Read-only" variant="neutral" />
        <StatusPill label={isOffline ? "Offline" : "Weekly summary"} variant={isOffline ? "warning" : "success"} />
      </View>

      <View style={styles.headerStoryCard}>
        <Text style={styles.headerStoryTitle}>Support companion</Text>
        <Text style={styles.headerStoryText}>
          Use a caregiver invite code to view weekly updates, recent check-ins, and safety
          context without changing the patient&apos;s plan.
        </Text>
      </View>
    </HeroHeader>
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
            title="Caregiver sign-in"
            subtitle="Enter the code shared from the patient app to open a calm, read-only support view."
            chips={[
              { text: "Read-only", tone: "muted" },
              { text: "Support updates", tone: "muted" },
            ]}
          />

          <View style={styles.sectionIntro}>
            <Text style={styles.sectionTitle}>What you’ll see</Text>
            <Text style={styles.sectionHelper}>
              Caregiver access focuses on the patient&apos;s weekly summary, recent check-ins, and
              safety signals so you can stay informed without editing care details.
            </Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Enter invite code</Text>
            <Text style={styles.subtitle}>
              Use the code exactly as it appears in the patient app. It opens the caregiver view
              for this patient only.
            </Text>
            <TextField
              label="Invite code"
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder="CG-XXXX-XXXX"
              autoCapitalize="characters"
            />
            <TextField
              label="Your name"
              value={caregiverName}
              onChangeText={setCaregiverName}
              placeholder="How should this appear to the patient?"
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
                <StatusPill
                  label={showDevDiagnostics ? "Open" : "Closed"}
                  variant="neutral"
                  accessible={false}
                />
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
        <View style={styles.footerCopy}>
          <Text style={styles.footerTitle}>Continue when you&apos;re ready</Text>
          <Text style={styles.footerText}>
            You&apos;ll move into a read-only caregiver view focused on weekly recovery and safety
            context.
          </Text>
        </View>
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
    formTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    centered: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    footerPanel: {
      marginTop: tokens.spacing.sm,
      gap: tokens.spacing.sm,
    },
    footerCopy: {
      gap: tokens.spacing.xs,
    },
    footerTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    footerText: {
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
