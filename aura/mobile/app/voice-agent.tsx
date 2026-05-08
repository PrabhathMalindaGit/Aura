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
          subtitle="Prototype session setup"
          variant="compact"
        >
          <Text style={styles.headerText}>
            Prepare a temporary backend-created Realtime session. Live audio conversation
            is planned later and is not enabled in V5-B1.
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
