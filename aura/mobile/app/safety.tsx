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
import { Card } from "@/src/components/Card";
import { DomainIcon } from "@/src/components/IconSet";
import { GlassPanel } from "@/src/components/GlassPanel";
import { HeroHeader } from "@/src/components/HeroHeader";
import { MediaCard } from "@/src/components/MediaCard";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Row } from "@/src/components/Row";
import { Screen } from "@/src/components/Screen";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { Section } from "@/src/components/Section";
import { StatusPill } from "@/src/components/StatusPill";
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
  const supportStory =
    alertId && clinicNumberConfigured
      ? "Your care team has already been notified. Start by messaging them or calling your clinic support line."
      : alertId
        ? "Your care team has already been notified. Start by messaging them so they can guide the next safe step."
        : clinicNumberConfigured
          ? "We noticed signals that may mean you need extra support. Start by messaging your care team or calling your clinic support line."
          : "We noticed signals that may mean you need extra support. Start by messaging your care team first, then use a calming tool if you need a moment.";

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
          subtitle="Support active · Take one safe step at a time"
          left={<Avatar size={40} name="Aura" fallback="icon" iconKey="safety" ring="safety" />}
          rightActions={[
            {
              icon: "home",
              tone: "muted",
              accessibilityLabel: "Back to Home",
              onPress: goHome,
            },
          ]}
        >
          <View style={styles.headerPills}>
            <StatusPill label="Support active" variant="warning" />
            {alertId ? <StatusPill label="Care team notified" variant="info" /> : null}
            {isOffline ? <StatusPill label="Offline" variant="neutral" /> : null}
          </View>

          <Card
            variant="outlined"
            style={styles.storyCard}
            accessibilityLabel="Immediate safety support guidance"
          >
            <View style={styles.storyHeader}>
              <Text style={styles.storyEyebrow}>Immediate support</Text>
              <Text style={styles.storyTitle}>Start with the safest next step</Text>
            </View>
            <Text style={styles.storyText}>{supportStory}</Text>
          </Card>
        </HeroHeader>
      }
    >
      <TipCard
        tone="safety"
        leading={{ type: "icon", icon: "info", tone: "muted" }}
        title="Why you’re seeing this"
        text="Aura noticed signals that may mean you need extra support right now. This screen keeps the next steps simple, clear, and close at hand."
        chips={[
          ...visibleReasons,
          ...(remainingReasonCount > 0 ? [`+${remainingReasonCount} more`] : []),
        ].slice(0, 3)}
      />

      <Section
        title="Start here"
        subtitle="Choose the safest next step right now. If you need a moment first, use a calming tool below."
        card
        cardVariant="elevated"
      >
        <View style={styles.primaryActionStack}>
          <PrimaryButton
            label="Message care team"
            onPress={() => {
              router.push("/(tabs)/chat");
            }}
          />

          {clinicNumberConfigured ? (
            <SecondaryButton
              label="Call clinic"
              onPress={() => {
                void openPhoneDialer(SUPPORT_PHONE_PLACEHOLDER);
              }}
            />
          ) : (
            <Card variant="outlined" style={styles.supportFallbackCard}>
              <Text style={styles.supportFallbackTitle}>Clinic phone not configured</Text>
              <Text style={styles.supportFallbackText}>
                Use chat or your care plan for the correct support number in this demo environment.
              </Text>
            </Card>
          )}

          <Text style={styles.primaryActionNote}>
            If you&apos;re in immediate danger, call your local emergency services
            {emergencyNumberConfigured ? ` (${EMERGENCY_NUMBER_PLACEHOLDER})` : ""}.
          </Text>
        </View>
      </Section>

      <Section
        title="Calming tools"
        subtitle="Use one if you need a moment before reaching out or while you wait for support."
        card
      >
        <View style={styles.actionGrid}>
          <View style={styles.actionTileWrap}>
            <MediaCard
              variant="compact"
              leading={{ type: "icon", icon: "coping", tone: "accent" }}
              title="Breathing"
              subtitle="Two-minute reset"
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
              subtitle="5–4–3–2–1 reset"
              chips={[{ text: "Focus", tone: "muted" }]}
              showChevron={false}
              onPress={() => {
                router.push("/grounding");
              }}
            />
          </View>
        </View>
      </Section>

      <Section
        title="Support options"
        subtitle="Use these when you want another person with you or more direct guidance."
        card
      >
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
          Keep this screen open if it helps. You can use chat now, return home when ready, or follow the steps below one at a time.
        </Text>
      </Section>

      <Section
        title="Your safety plan"
        subtitle="Follow these steps in order if you feel overwhelmed or unsure what to do next."
        card
      >
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
        <View style={styles.footerCopy}>
          <Text style={styles.footerTitle}>When you&apos;re ready</Text>
          <Text style={styles.footerText}>
            Return home or continue in chat. Your support options will still be available there.
          </Text>
        </View>
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
    headerPills: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: tokens.spacing.xs,
    },
    storyCard: {
      gap: tokens.spacing.sm,
      backgroundColor: tokens.colors.surface,
    },
    storyHeader: {
      gap: 2,
    },
    storyEyebrow: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    storyTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    storyText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
    },
    primaryActionStack: {
      gap: tokens.spacing.sm,
    },
    supportFallbackCard: {
      gap: tokens.spacing.xs,
    },
    supportFallbackTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
    },
    supportFallbackText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
    },
    primaryActionNote: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
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
    footerActions: {
      gap: tokens.spacing.sm,
      marginTop: tokens.spacing.xs,
    },
  });
}
