import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { InlineNotice } from "@/src/components/InlineNotice";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { Section } from "@/src/components/Section";
import { API_BASE } from "@/src/config/env";
import { useAuth } from "@/src/state/auth";
import { clearAllLastErrors } from "@/src/state/lastError";
import { useNetwork } from "@/src/state/network";
import { clearAllLastRefreshed } from "@/src/state/refresh";

export default function SettingsScreen() {
  const auth = useAuth();
  const network = useNetwork();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [devNotice, setDevNotice] = useState<string | null>(null);

  const patientName = auth.patient?.displayName ?? auth.patient?.id ?? "Unknown";

  const confirmSignOut = () => {
    Alert.alert(
      "Log out?",
      "You’ll need your access code to sign in again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log out",
          style: "destructive",
          onPress: () => {
            void handleSignOut();
          },
        },
      ]
    );
  };

  const handleSignOut = async () => {
    setLogoutError(null);
    setIsSigningOut(true);
    try {
      await auth.signOut();
    } catch {
      setLogoutError("Couldn’t log out. Please try again.");
      setIsSigningOut(false);
    }
  };

  const handleClearRefreshStamps = async () => {
    await clearAllLastRefreshed();
    setDevNotice("Cleared last refreshed stamps.");
  };

  const handleClearLastErrors = async () => {
    await clearAllLastErrors();
    setDevNotice("Cleared last errors.");
  };

  return (
    <Screen title="Settings">
      <View style={styles.container}>
        <Section title="Session">
          <Text style={styles.line}>Status: {auth.status}</Text>
          <Text style={styles.line}>Patient: {patientName}</Text>
          <Text style={styles.line}>API: {API_BASE}</Text>
          <Text style={styles.line}>
            Offline: {network.isOffline ? "Yes" : "No"}
          </Text>
        </Section>

        <Section title="Logout">
          <PrimaryButton
            label={isSigningOut ? "Signing out…" : "Log out"}
            loading={isSigningOut}
            disabled={isSigningOut}
            onPress={confirmSignOut}
          />
          {logoutError ? (
            <InlineNotice
              variant="error"
              title="Logout failed"
              message={logoutError}
            />
          ) : null}
        </Section>

        {__DEV__ ? (
          <Section title="Developer tools">
            <PrimaryButton
              label="Clear last refreshed stamps"
              onPress={() => {
                void handleClearRefreshStamps();
              }}
            />
            <PrimaryButton
              label="Clear last errors"
              onPress={() => {
                void handleClearLastErrors();
              }}
            />
            {devNotice ? (
              <InlineNotice
                variant="info"
                title="Developer"
                message={devNotice}
                actionLabel="Dismiss"
                onAction={() => setDevNotice(null)}
              />
            ) : null}
          </Section>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  line: {
    fontSize: 14,
    color: "#374151",
    marginBottom: 4,
  },
});
