import React, { useMemo, useState } from "react";
import { Image } from "expo-image";
import { useRouter, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { isApiError } from "@/src/api/client";
import { auraBrandMark } from "@/src/assets/brand";
import { Card } from "@/src/components/Card";
import { InlineNotice } from "@/src/components/InlineNotice";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { StatusPill } from "@/src/components/StatusPill";
import { TextField } from "@/src/components/TextField";
import { isProbablyLocalhost } from "@/src/config/env";
import { useAuth } from "@/src/state/auth";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";
import { useTokens } from "@/src/theme/tokens";

const demoAccessCodes = ["P1-DEMO", "P2-DEMO", "P3-DEMO"] as const;

export function shouldShowDemoAccessChips(isDev: boolean, isLocalhost: boolean) {
  return isDev && isLocalhost;
}

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

  if (error.status === 429) {
    return error.message || "Too many sign-in attempts. Please wait a moment and try again.";
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
  const showDemoAccessChips = shouldShowDemoAccessChips(__DEV__, isProbablyLocalhost);

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
    <Screen maxWidth={420} contentContainerStyle={styles.screenContent}>
      <View style={styles.container}>
        <View
          accessible
          accessibilityLabel="Aura. Rehabilitation support that keeps your recovery plan connected."
          style={styles.brandHeader}
          testID="login-brand-header"
        >
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={styles.logoShell}
          >
            <Image
              source={auraBrandMark}
              contentFit="contain"
              accessibilityIgnoresInvertColors
              style={styles.logo}
              testID="login-aura-logo"
            />
          </View>
          <View style={styles.brandCopy}>
            <Text allowFontScaling accessibilityRole="header" style={styles.brandTitle}>
              Aura
            </Text>
            <Text allowFontScaling style={styles.brandSubtitle}>
              Rehabilitation support that keeps your recovery plan connected.
            </Text>
          </View>
        </View>

        <View style={styles.titleBlock}>
          <Text allowFontScaling accessibilityRole="header" style={styles.screenTitle}>
            Sign in
          </Text>
          <Text allowFontScaling style={styles.screenSubtitle}>
            Use your access code to continue your rehab plan.
          </Text>
        </View>

        <Card variant="elevated" style={styles.card}>
          <View style={styles.cardHeader}>
            <StatusPill
              label={isOffline ? "Offline" : "Secure patient access"}
              variant={isOffline ? "warning" : "info"}
              style={styles.trustBadge}
              accessible
            />
          </View>

          <View style={styles.formStack}>
            <TextField
              label="Access code"
              value={accessCode}
              onChangeText={setAccessCode}
              placeholder="Enter your access code"
              helperText="Use the code your care team gave you."
              autoCapitalize="characters"
            />

            {showDemoAccessChips ? (
              <View style={styles.demoPanel} testID="login-demo-access-chips">
                <Text style={styles.demoLabel}>Local demo access</Text>
                <View style={styles.demoChipRow}>
                  {demoAccessCodes.map((code) => (
                    <Pressable
                      key={code}
                      accessibilityRole="button"
                      accessibilityLabel={`Use demo access code ${code}`}
                      onPress={() => {
                        setAccessCode(code);
                        setInlineError(null);
                      }}
                      style={({ pressed }) => [
                        styles.demoChip,
                        pressed ? styles.demoChipPressed : null,
                      ]}
                      testID={`login-demo-chip-${code}`}
                    >
                      <Text style={styles.demoChipText}>{code}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

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

            <Text style={styles.trustNote}>
              Your check-ins and messages stay protected behind Aura access.
            </Text>

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
        </Card>
      </View>
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    screenContent: {
      paddingTop: tokens.spacing.xl,
    },
    container: {
      gap: tokens.spacing.md,
    },
    brandHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: tokens.spacing.md,
      paddingVertical: tokens.spacing.lg,
      paddingHorizontal: tokens.spacing.lg,
      borderRadius: tokens.radius.xl,
      borderWidth: 1,
      borderColor: "rgba(215, 224, 231, 0.9)",
      backgroundColor: "rgba(255, 255, 255, 0.88)",
      ...tokens.elevation.card,
    },
    logoShell: {
      width: 68,
      height: 68,
      borderRadius: tokens.radius.lg,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    logo: {
      width: 58,
      height: 58,
    },
    brandCopy: {
      flex: 1,
      minWidth: 0,
      gap: tokens.spacing.xs,
    },
    brandTitle: {
      color: tokens.colors.text,
      fontSize: 30,
      lineHeight: 34,
      fontWeight: tokens.typography.weights.semibold,
    },
    brandSubtitle: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    titleBlock: {
      gap: tokens.spacing.xs,
      paddingHorizontal: tokens.spacing.sm,
    },
    screenTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.title.fontSize,
      lineHeight: tokens.typography.title.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    screenSubtitle: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    card: {
      gap: tokens.spacing.lg,
      borderColor: tokens.colors.border,
      backgroundColor: "rgba(255, 255, 255, 0.94)",
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: tokens.spacing.sm,
    },
    trustBadge: {
      alignSelf: "flex-start",
    },
    helper: {
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      color: tokens.colors.textMuted,
    },
    formStack: {
      gap: tokens.spacing.md,
    },
    demoPanel: {
      gap: tokens.spacing.sm,
      padding: tokens.spacing.md,
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surfaceElevated,
    },
    demoLabel: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.medium,
    },
    demoChipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    demoChip: {
      minHeight: 44,
      justifyContent: "center",
      borderRadius: tokens.radius.md,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
      paddingHorizontal: tokens.spacing.md,
    },
    demoChipPressed: {
      opacity: 0.72,
    },
    demoChipText: {
      color: tokens.colors.primary,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    actions: {
      gap: tokens.spacing.sm,
    },
    trustNote: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      textAlign: "center",
    },
  });
}
