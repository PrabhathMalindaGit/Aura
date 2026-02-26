import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Banner } from "@/src/components/Banner";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Row } from "@/src/components/Row";
import { Screen } from "@/src/components/Screen";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { Section } from "@/src/components/Section";
import { StatusPill } from "@/src/components/StatusPill";
import {
  EMERGENCY_NUMBER_PLACEHOLDER,
  SUPPORT_PHONE_PLACEHOLDER,
} from "@/src/config/constants";
import { useAuth } from "@/src/state/auth";
import { useIsOffline } from "@/src/state/network";
import { useTokens } from "@/src/theme/tokens";
import { reasonLabel } from "@/src/utils/reasonLabels";

type SafetyParams = {
  alertId?: string | string[];
  reasonCodes?: string | string[];
};

const MAX_REASON_PILLS = 2;

const SAFETY_PLAN_STEPS = [
  "Pause and take a slow breath.",
  "Move to a safe, comfortable place.",
  "Use a coping tool from this screen.",
  "Reach out to someone you trust.",
  "If you feel unsafe or symptoms worsen, seek urgent help.",
] as const;

function parseReasonCodes(input: string | string[] | undefined): string[] {
  const normalize = (value: string): string => {
    try {
      return decodeURIComponent(value).trim();
    } catch {
      return value.trim();
    }
  };

  if (!input) {
    return [];
  }

  if (Array.isArray(input)) {
    return input
      .flatMap((value) => value.split(","))
      .map((value) => normalize(value))
      .filter(Boolean);
  }

  return input
    .split(",")
    .map((value) => normalize(value))
    .filter(Boolean);
}

function toFriendlyReasonList(codes: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const code of codes) {
    const raw = code.trim();
    if (!raw) {
      continue;
    }

    const mapped = reasonLabel(raw);
    const fallback = mapped === raw ? "Safety signal detected" : mapped;
    const label = fallback.trim();

    if (!label) {
      continue;
    }

    const key = label.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(label);
  }

  return result;
}

async function openPhoneDialer(number: string): Promise<void> {
  const telUrl = `tel:${number}`;
  const supported = await Linking.canOpenURL(telUrl);
  if (!supported) {
    Alert.alert("Unable to call", "Your device cannot open the phone dialer.");
    return;
  }

  await Linking.openURL(telUrl);
}

function isConfiguredSupportNumber(value: string): boolean {
  const trimmed = value.trim();
  return Boolean(trimmed) && trimmed !== "+0000000000";
}

function isConfiguredEmergencyNumber(value: string): boolean {
  const trimmed = value.trim();
  return Boolean(trimmed) && trimmed !== "000";
}

export default function SafetyScreen() {
  const router = useRouter();
  const { status } = useAuth();
  const params = useLocalSearchParams<SafetyParams>();
  const isOffline = useIsOffline();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const reasonCodes = useMemo(
    () => parseReasonCodes(params.reasonCodes),
    [params.reasonCodes]
  );
  const reasonMessages = useMemo(
    () => toFriendlyReasonList(reasonCodes),
    [reasonCodes]
  );
  const visibleReasons = useMemo(
    () => reasonMessages.slice(0, MAX_REASON_PILLS),
    [reasonMessages]
  );
  const remainingReasonCount = Math.max(0, reasonMessages.length - visibleReasons.length);

  const alertId = Array.isArray(params.alertId) ? params.alertId[0] : params.alertId;
  const clinicNumberConfigured = isConfiguredSupportNumber(SUPPORT_PHONE_PLACEHOLDER);
  const emergencyNumberConfigured = isConfiguredEmergencyNumber(EMERGENCY_NUMBER_PLACEHOLDER);

  const goHome = () => {
    try {
      router.replace("/(tabs)");
    } catch {
      router.push("/(tabs)");
    }
  };

  if (status === "loading") {
    return (
      <Screen scroll={false}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" />
        </View>
      </Screen>
    );
  }

  if (status === "signedOut") {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Screen scroll contentContainerStyle={styles.container}>
      <View style={styles.headerBlock}>
        <Text style={styles.title}>Safety support</Text>
        <Text style={styles.subtitle}>You&apos;re not alone. Let&apos;s take the next step together.</Text>
        <View style={styles.pillRow}>
          <StatusPill label="Support active" variant="warning" />
          {alertId ? <StatusPill label="Care team notified" variant="info" /> : null}
        </View>
      </View>

      <Section title="What’s happening" card>
        <View style={styles.bulletList}>
          <Text style={styles.bulletItem}>• We noticed signals that you may need extra support right now.</Text>
          <Text style={styles.bulletItem}>• This screen gives you quick tools and clear next steps.</Text>
          <Text style={styles.bulletItem}>• Use any option below and move at your own pace.</Text>
        </View>

        {visibleReasons.length > 0 ? (
          <View style={styles.reasonBlock}>
            <Text style={styles.reasonHeading}>What we noticed</Text>
            <View style={styles.pillRow}>
              {visibleReasons.map((reason) => (
                <StatusPill key={reason} label={reason} variant="info" />
              ))}
            </View>
            {remainingReasonCount > 0 ? (
              <Text style={styles.reasonMeta}>+{remainingReasonCount} more signal(s)</Text>
            ) : null}
          </View>
        ) : null}
      </Section>

      <Section
        title="Try a quick tool now"
        subtitle="Use one now, then reassess how you feel."
        card
      >
        <View style={styles.actionStack}>
          <PrimaryButton
            label="Breathing (2 min)"
            onPress={() => {
              router.push("/breathing");
            }}
          />
          <SecondaryButton
            label="Grounding (5–4–3–2–1)"
            onPress={() => {
              router.push("/grounding");
            }}
          />
        </View>
      </Section>

      <Section title="Reach support" card>
        {isOffline ? (
          <Banner
            variant="warning"
            title="Offline"
            message="Some support actions may be limited until you reconnect."
          />
        ) : null}

        <View style={styles.stack}>
          <Row
            title="Message your care team"
            subtitle="Open chat with your clinic"
            onPress={() => {
              router.push("/(tabs)/chat");
            }}
          />

          <Row
            title="Contact caregiver"
            subtitle="Reach out to someone you trust"
            accessory="none"
          />

          <Row
            title="Call clinic"
            subtitle={
              clinicNumberConfigured
                ? "Use your clinic support line"
                : "Clinic phone is not configured in this demo"
            }
            onPress={
              clinicNumberConfigured
                ? () => {
                    void openPhoneDialer(SUPPORT_PHONE_PLACEHOLDER);
                  }
                : undefined
            }
            accessory={clinicNumberConfigured ? "chevron" : "none"}
          />
        </View>

        <Text style={styles.supportNote}>
          If you&apos;re in immediate danger, contact local emergency services.
          {emergencyNumberConfigured ? ` (${EMERGENCY_NUMBER_PLACEHOLDER})` : ""}
        </Text>
      </Section>

      <Section title="Your safety plan" card>
        <View style={styles.planList}>
          {SAFETY_PLAN_STEPS.map((step) => (
            <Text key={step} style={styles.planItem}>
              • {step}
            </Text>
          ))}
        </View>
      </Section>

      <View style={styles.footerActions}>
        <PrimaryButton label="Back to Home" onPress={goHome} />
        <SecondaryButton
          label="Go to chat"
          onPress={() => {
            router.push("/(tabs)/chat");
          }}
        />
      </View>
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    loadingContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    container: {
      gap: tokens.spacing.md,
      paddingBottom: tokens.spacing.xl,
    },
    headerBlock: {
      gap: tokens.spacing.xs,
    },
    title: {
      color: tokens.colors.text,
      fontSize: tokens.typography.title.fontSize,
      lineHeight: tokens.typography.title.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    subtitle: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    pillRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
      marginTop: tokens.spacing.xs,
    },
    bulletList: {
      gap: tokens.spacing.xs,
    },
    bulletItem: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    reasonBlock: {
      gap: tokens.spacing.xs,
      marginTop: tokens.spacing.xs,
    },
    reasonHeading: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    reasonMeta: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    actionStack: {
      gap: tokens.spacing.sm,
    },
    stack: {
      gap: tokens.spacing.sm,
    },
    supportNote: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      marginTop: tokens.spacing.xs,
    },
    planList: {
      gap: tokens.spacing.xs,
    },
    planItem: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    footerActions: {
      gap: tokens.spacing.sm,
      marginTop: tokens.spacing.xs,
    },
  });
}
