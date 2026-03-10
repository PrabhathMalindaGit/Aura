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
import { Avatar } from "@/src/components/Avatar";
import { DomainIcon } from "@/src/components/IconSet";
import { GlassPanel } from "@/src/components/GlassPanel";
import { HeroHeader } from "@/src/components/HeroHeader";
import { MediaCard } from "@/src/components/MediaCard";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Row } from "@/src/components/Row";
import { Screen } from "@/src/components/Screen";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { Section } from "@/src/components/Section";
import { TipCard } from "@/src/components/TipCard";
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
  return Boolean(value.trim());
}

function isConfiguredEmergencyNumber(value: string): boolean {
  return Boolean(value.trim());
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
    <Screen
      scroll
      contentContainerStyle={styles.container}
      header={
        <HeroHeader
          variant="compact"
          title="Safety support"
          subtitle="Support active · Let’s take the next step together"
          left={<Avatar size={40} name="Aura" fallback="icon" iconKey="safety" ring="safety" />}
          rightActions={[
            {
              icon: "home",
              tone: "muted",
              accessibilityLabel: "Back to Home",
              onPress: goHome,
            },
          ]}
        />
      }
    >
      <MediaCard
        leading={{
          type: "thumbnail",
          source: require("../src/assets/illustrations/ill_safety.png"),
          fit: "contain",
          bg: "muted",
        }}
        title="Support is active"
        subtitle="You’re not alone. Choose one option below and go at your own pace."
        chips={[
          { text: "Support active", tone: "warning" as const },
          ...(alertId ? [{ text: "Care team notified", tone: "info" as const }] : []),
          ...(isOffline ? [{ text: "Offline", tone: "muted" as const }] : []),
        ].slice(0, 3)}
      />

      <TipCard
        tone="neutral"
        leading={{ type: "icon", icon: "info", tone: "muted" }}
        title="What’s happening"
        text="We noticed signals that you may need extra support right now. This screen offers quick tools and clear next steps."
        chips={[
          ...visibleReasons,
          ...(remainingReasonCount > 0 ? [`+${remainingReasonCount} more`] : []),
        ].slice(0, 3)}
      />

      <Section
        title="Quick actions"
        subtitle="Use one now, then reassess how you feel."
        card
      >
        <View style={styles.actionGrid}>
          <View style={styles.actionTileWrap}>
            <MediaCard
              variant="compact"
              leading={{ type: "icon", icon: "coping", tone: "accent" }}
              title="Breathing"
              subtitle="2 minutes"
              chips={[{ text: "Calm", tone: "muted" }]}
              showChevron={false}
              onPress={() => {
                router.push("/breathing");
              }}
            />
          </View>
          <View style={styles.actionTileWrap}>
            <MediaCard
              variant="compact"
              leading={{ type: "icon", icon: "coping", tone: "accent" }}
              title="Grounding"
              subtitle="5–4–3–2–1"
              chips={[{ text: "Focus", tone: "muted" }]}
              showChevron={false}
              onPress={() => {
                router.push("/grounding");
              }}
            />
          </View>
          <View style={styles.actionTileWrap}>
            <MediaCard
              variant="compact"
              leading={{ type: "icon", icon: "chat", tone: "primary" }}
              title="Message care team"
              subtitle="Open chat"
              showChevron={false}
              onPress={() => {
                router.push("/(tabs)/chat");
              }}
            />
          </View>
          <View style={styles.actionTileWrap}>
            <MediaCard
              variant="compact"
              leading={{ type: "icon", icon: "appointments", tone: "muted" }}
              title="Call clinic"
              subtitle={
                clinicNumberConfigured ? "Use your support line" : "Use chat for support contact details"
              }
              chips={
                clinicNumberConfigured
                  ? [{ text: "Available", tone: "info" }]
                  : [{ text: "Use chat", tone: "muted" }]
              }
              showChevron={clinicNumberConfigured}
              onPress={
                clinicNumberConfigured
                  ? () => {
                      void openPhoneDialer(SUPPORT_PHONE_PLACEHOLDER);
                    }
                  : undefined
              }
            />
          </View>
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
            leftIcon={<DomainIcon icon="chat" tone="accent" accessibilityLabel="Message care team icon" />}
            onPress={() => {
              router.push("/(tabs)/chat");
            }}
          />

          <Row
            title="Contact caregiver"
            subtitle="Reach out to someone you trust"
            leftIcon={<DomainIcon icon="caregiver" tone="muted" accessibilityLabel="Contact caregiver icon" />}
            accessory="none"
          />

          <Row
            title="Call clinic"
            subtitle={
              clinicNumberConfigured
                ? "Use your clinic support line"
                : "Use chat or your care plan for the correct support number"
            }
            leftIcon={<DomainIcon icon="appointments" tone="muted" accessibilityLabel="Call clinic icon" />}
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
          If you&apos;re in immediate danger, call your local emergency services
          {emergencyNumberConfigured ? ` (${EMERGENCY_NUMBER_PLACEHOLDER})` : ""}.
        </Text>
      </Section>

      <Section title="Your safety plan" card>
        <View style={styles.planCard}>
          {SAFETY_PLAN_STEPS.map((step) => (
            <View key={step} style={styles.planRow}>
              <DomainIcon icon="success" tone="success" size={16} accessibilityLabel="Safety step icon" />
              <Text style={styles.planItem}>{step}</Text>
            </View>
          ))}
        </View>
      </Section>

      <GlassPanel
        style={styles.footerPanel}
        fallbackVariant="elevated"
        fallbackOpacity={0.78}
        accessibilityLabel="Safety footer actions"
      >
        <View style={styles.footerActions}>
          <PrimaryButton label="Back to Home" onPress={goHome} />
          <SecondaryButton
            label="Go to chat"
            onPress={() => {
              router.push("/(tabs)/chat");
            }}
          />
        </View>
      </GlassPanel>
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
    actionGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.sm,
    },
    actionTileWrap: {
      width: "48%",
      minWidth: 0,
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
    planCard: {
      borderRadius: tokens.radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surfaceElevated,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm,
      gap: tokens.spacing.xs,
    },
    planRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: tokens.spacing.sm,
    },
    planItem: {
      flex: 1,
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    footerPanel: {
      marginTop: tokens.spacing.sm,
      borderRadius: tokens.radius.lg,
    },
    footerActions: {
      gap: tokens.spacing.sm,
      marginTop: tokens.spacing.xs,
    },
  });
}
