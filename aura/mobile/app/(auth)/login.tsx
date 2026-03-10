import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";

import { isApiError } from "@/src/api/client";
import { Card } from "@/src/components/Card";
import { HeroHeader } from "@/src/components/HeroHeader";
import { InlineNotice } from "@/src/components/InlineNotice";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { StatusPill } from "@/src/components/StatusPill";
import { TextField } from "@/src/components/TextField";
import { API_BASE } from "@/src/config/env";
import { useAuth } from "@/src/state/auth";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { useTokens } from "@/src/theme/tokens";

function toFriendlySignInMessage(error: unknown): string {
  if (!isApiError(error)) {
    return "Something went wrong. Please try again.";
  }

  if (error.kind === "offline") {
    return "You’re offline. Nothing was sent.";
  }

  if (error.status === 401 || error.status === 404) {
    return "That code didn’t work. Try again.";
  }

  if (error.kind === "network") {
    return "Couldn’t reach the server. Try again.";
  }

  if (error.kind === "server") {
    return "Server error. Please try again shortly.";
  }

  return error.message || "Something went wrong. Please try again.";
}

export default function LoginScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const isOffline = useIsOffline();
  const authError = useLastError("auth");
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const [accessCode, setAccessCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const helperText = useMemo(
    () => (__DEV__ ? "Demo: P1-DEMO, P2-DEMO, P3-DEMO" : null),
    []
  );

  const handleSubmit = async () => {
    if (!accessCode.trim()) {
      setInlineError("Please enter your access code.");
      return;
    }

    if (isOffline) {
      setInlineError("You’re offline. Nothing was sent.");
      await authError.setLocalError({
        title: "Couldn’t sign in",
        message: "You’re offline. Nothing was sent.",
        kind: "offline",
        retryable: true,
      });
      return;
    }

    setInlineError(null);
    setIsSubmitting(true);
    try {
      await signIn(accessCode.trim());
      setAccessCode("");
      await authError.reload();
    } catch (error) {
      setInlineError(toFriendlySignInMessage(error));
      await authError.reload();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Screen
      header={
        <HeroHeader
          variant="compact"
          title="Sign in"
          subtitle="Use your access code to continue your rehab plan."
        />
      }
      maxWidth={420}
    >
      <View style={styles.container}>
        <Card variant="elevated" style={styles.card}>
          <View style={styles.cardHeader}>
            <StatusPill
              label={isOffline ? "Offline" : "Secure sign-in"}
              variant={isOffline ? "warning" : "info"}
            />
            {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
          </View>

          <View style={styles.formStack}>
            <TextField
              label="Access code"
              value={accessCode}
              onChangeText={setAccessCode}
              placeholder="e.g., P1-DEMO"
              helperText="Use the code your care team gave you."
              autoCapitalize="characters"
            />

            <View style={styles.actions}>
              <PrimaryButton
                label="Continue"
                loading={isSubmitting}
                disabled={isSubmitting}
                onPress={handleSubmit}
              />
              <SecondaryButton
                label="I’m a caregiver"
                onPress={() => {
                  router.push("/caregiver-login" as Href);
                }}
              />
            </View>

            {inlineError ? (
              <InlineNotice
                variant="error"
                title="Sign-in failed"
                message={inlineError}
              />
            ) : null}

            <LastFailedAttempt
              value={authError.label}
              title={authError.lastError?.title}
              message={authError.lastError?.message}
              onClear={authError.lastError ? authError.clear : undefined}
            />
          </View>

          <Text style={styles.apiText}>API: {API_BASE}</Text>
        </Card>
      </View>
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      gap: tokens.spacing.lg,
    },
    card: {
      gap: tokens.spacing.lg,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
    },
    cardHeader: {
      gap: tokens.spacing.sm,
    },
    helper: {
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      color: tokens.colors.textMuted,
    },
    formStack: {
      gap: tokens.spacing.md,
    },
    actions: {
      gap: tokens.spacing.sm,
    },
    apiText: {
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      color: tokens.colors.textMuted,
    },
  });
}
