import { Redirect } from "expo-router";
import React, { useMemo } from "react";
import { StyleSheet, Text } from "react-native";

import { HeroHeader } from "@/src/components/HeroHeader";
import { Screen } from "@/src/components/Screen";
import { VoiceAgentSessionPanel } from "@/src/components/VoiceAgentSessionPanel";
import { useAuth } from "@/src/state/auth";
import { useTokens } from "@/src/theme/tokens";

export default function VoiceAgentScreen() {
  const auth = useAuth();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  if (auth.status === "signedOut") {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Screen
      scroll
      auditLabel="VoiceAgentScreen"
      contentContainerStyle={styles.container}
      header={
        <HeroHeader
          title="Aura Voice Agent"
          subtitle="Safe action proposals"
          variant="compact"
        >
          <Text style={styles.headerText}>
            Start a web-only Realtime audio demo and review deterministic,
            local action proposals. Aura will not send, submit, book, log, or
            create alerts by voice in this version.
          </Text>
        </HeroHeader>
      }
    >
      <VoiceAgentSessionPanel token={auth.token} />
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      gap: tokens.spacing.md,
      paddingBottom: tokens.spacing.xl,
    },
    headerText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
  });
}
