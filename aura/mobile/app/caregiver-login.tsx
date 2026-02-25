import { Redirect, useRouter, type Href } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { isApiError } from "@/src/api/client";
import { InlineNotice } from "@/src/components/InlineNotice";
import { LastFailedAttempt } from "@/src/components/LastFailedAttempt";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { TextField } from "@/src/components/TextField";
import { useCaregiverSession } from "@/src/state/caregiverSession";
import { useLastError } from "@/src/state/lastError";
import { useIsOffline } from "@/src/state/network";

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
  const caregiverSession = useCaregiverSession();
  const isOffline = useIsOffline();
  const caregiverLoginError = useLastError("caregiverLogin");

  const [inviteCode, setInviteCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

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

  if (caregiverSession.status === "loading") {
    return (
      <Screen title="Caregiver sign in">
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
    <Screen title="Caregiver sign in">
      <View style={styles.container}>
        <Text style={styles.subtitle}>Enter the invite code from the patient app.</Text>
        <TextField
          label="Invite code"
          value={inviteCode}
          onChangeText={setInviteCode}
          placeholder="CG-XXXX-XXXX"
          autoCapitalize="characters"
        />
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
          value={caregiverLoginError.label}
          title={caregiverLoginError.lastError?.title}
          message={caregiverLoginError.lastError?.message}
          onClear={caregiverLoginError.lastError ? caregiverLoginError.clear : undefined}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  subtitle: {
    fontSize: 13,
    color: "#4b5563",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
