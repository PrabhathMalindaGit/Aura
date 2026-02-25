import { useMemo, useState } from "react";
import { StyleSheet, Text, View, Pressable } from "react-native";
import { useRouter, type Href } from "expo-router";

import { isApiError } from "@/src/api/client";
import { InlineNotice } from "@/src/components/InlineNotice";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { TextField } from "@/src/components/TextField";
import { API_BASE } from "@/src/config/env";
import { useAuth } from "@/src/state/auth";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";

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
    <Screen title="Sign in">
      <View style={styles.container}>
        <TextField
          label="Access code"
          value={accessCode}
          onChangeText={setAccessCode}
          placeholder="e.g., P1-DEMO"
          autoCapitalize="characters"
        />
        {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            router.push("/caregiver-login" as Href);
          }}
          style={({ pressed }) => [
            styles.caregiverLink,
            pressed ? styles.caregiverLinkPressed : null,
          ]}
        >
          <Text style={styles.caregiverLinkText}>I’m a caregiver</Text>
        </Pressable>
        <PrimaryButton
          label="Continue"
          loading={isSubmitting}
          disabled={isSubmitting}
          onPress={handleSubmit}
        />
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
        <Text style={styles.apiText}>API: {API_BASE}</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  helper: {
    fontSize: 12,
    color: "#4b5563",
  },
  caregiverLink: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  caregiverLinkPressed: {
    opacity: 0.7,
  },
  caregiverLinkText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1f2937",
  },
  apiText: {
    fontSize: 12,
    color: "#6b7280",
  },
});
