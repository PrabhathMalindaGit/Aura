import { Redirect, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
import { Card } from "@/src/components/Card";
import { GlassPanel } from "@/src/components/GlassPanel";
import { HeroHeader } from "@/src/components/HeroHeader";
import { MediaCard } from "@/src/components/MediaCard";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { StatusPill } from "@/src/components/StatusPill";
import { TrackerTile } from "@/src/components/TrackerTile";
import { useAuth } from "@/src/state/auth";
import {
  formatLastUsed,
  getUsage,
  incrementUsage,
  type CopingUsage,
} from "@/src/state/copingUsage";
import { useTokens } from "@/src/theme/tokens";

type GroundingStep = {
  title: string;
  count: number;
  prompt: string;
};

const STEPS: GroundingStep[] = [
  {
    title: "5 things you can SEE",
    count: 5,
    prompt: "Notice things in front of you.",
  },
  {
    title: "4 things you can FEEL",
    count: 4,
    prompt: "Notice contact, textures, or temperature.",
  },
  {
    title: "3 things you can HEAR",
    count: 3,
    prompt: "Listen for nearby or distant sounds.",
  },
  {
    title: "2 things you can SMELL",
    count: 2,
    prompt: "Notice any scent around you.",
  },
  {
    title: "1 thing you can TASTE",
    count: 1,
    prompt: "Notice your mouth or aftertaste.",
  },
];

function buildBlankAnswers(): string[][] {
  return STEPS.map((step) => Array.from({ length: step.count }, () => ""));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

export default function GroundingScreen() {
  const auth = useAuth();
  const router = useRouter();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<string[][]>(buildBlankAnswers);
  const [isComplete, setIsComplete] = useState(false);
  const [completionRecorded, setCompletionRecorded] = useState(false);
  const [usage, setUsage] = useState<CopingUsage>({ count: 0, lastUsedAt: null });

  const currentStep = STEPS[stepIndex];
  const progressLabel = `Step ${stepIndex + 1} of ${STEPS.length}`;

  useEffect(() => {
    let mounted = true;
    void getUsage("grounding").then((value) => {
      if (mounted) {
        setUsage(value);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isComplete || completionRecorded) {
      return;
    }
    setCompletionRecorded(true);
    void incrementUsage("grounding").then((nextUsage) => {
      setUsage(nextUsage);
    });
  }, [completionRecorded, isComplete]);

  const setItemValue = (index: number, value: string) => {
    setAnswers((previous) => {
      const next = previous.map((row) => [...row]);
      next[stepIndex][index] = value.slice(0, 120);
      return next;
    });
  };

  const goNext = () => {
    if (stepIndex >= STEPS.length - 1) {
      setIsComplete(true);
      return;
    }
    setStepIndex((current) => Math.min(current + 1, STEPS.length - 1));
  };

  const goBack = () => {
    if (stepIndex <= 0) {
      return;
    }
    setStepIndex((current) => Math.max(current - 1, 0));
  };

  const restart = () => {
    setStepIndex(0);
    setAnswers(buildBlankAnswers());
    setIsComplete(false);
    setCompletionRecorded(false);
  };

  const currentInputs = useMemo(() => answers[stepIndex] ?? [], [answers, stepIndex]);

  if (auth.status === "loading") {
    return (
      <Screen
        scroll={false}
        header={<HeroHeader variant="compact" title="Grounding" subtitle="Loading" />}
      >
        <View style={styles.centered}>
          <Text style={styles.muted}>Loading…</Text>
        </View>
      </Screen>
    );
  }

  if (auth.status === "signedOut") {
    return <Redirect href="/(auth)/login" />;
  }

  if (isComplete) {
    return (
      <Screen
        scroll={false}
        header={
          <HeroHeader
            variant="compact"
            title="Grounding"
            subtitle="Done"
            left={<Avatar size={40} name={auth.patient?.displayName ?? auth.patient?.id ?? "Aura"} fallback="icon" iconKey="coping" />}
            rightActions={[
              {
                icon: "coping",
                tone: "muted",
                accessibilityLabel: "Back to coping tools",
                onPress: () => {
                  router.push("/coping-tools");
                },
              },
              {
                icon: "safety",
                tone: "warning",
                accessibilityLabel: "Open Safety support",
                onPress: () => {
                  router.push("/safety");
                },
              },
            ]}
          />
        }
      >
        <ScrollView contentContainerStyle={styles.container}>
          <MediaCard
            leading={{ type: "icon", icon: "coping", tone: "success" }}
            title="Done"
            subtitle="Nice work. Return to tools whenever you're ready."
            chips={[
              { text: `Used ${usage.count}`, tone: "muted" },
              { text: `Last used ${formatLastUsed(usage.lastUsedAt)}`, tone: "muted" },
            ]}
          />

          <View style={styles.doneTrackerRow}>
            <View style={styles.doneTrackerWrap}>
              <TrackerTile
                icon="coping"
                label="Grounding"
                value={`${usage.count}`}
                delta="Total sessions"
                tone="success"
                micro={{ type: "ring", progress: clamp01(usage.count / 7) }}
                variant="compact"
              />
            </View>
            <View style={styles.doneTrackerWrap}>
              <TrackerTile
                icon="weekly"
                label="Last used"
                value={formatLastUsed(usage.lastUsedAt)}
                delta="Recent"
                tone="muted"
                micro={{ type: "dots", values: [usage.lastUsedAt ? 1 : 0, 0, 0, 0, 0, 0, 0] }}
                variant="compact"
              />
            </View>
          </View>

          <View style={styles.doneButtons}>
            <PrimaryButton
              label="Back to tools"
              onPress={() => router.push("/coping-tools" as never)}
              accessibilityLabel="Back to coping tools"
            />
            <SecondaryButton
              label="Start again"
              onPress={restart}
              accessibilityLabel="Start grounding again"
            />
          </View>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen
      scroll={false}
      header={
        <HeroHeader
          variant="compact"
          title="Grounding"
          subtitle={`Step ${stepIndex + 1} of ${STEPS.length}`}
          left={<Avatar size={40} name={auth.patient?.displayName ?? auth.patient?.id ?? "Aura"} fallback="icon" iconKey="coping" />}
          rightActions={[
            {
              icon: "coping",
              tone: "muted",
              accessibilityLabel: "Back to coping tools",
              onPress: () => {
                router.push("/coping-tools");
              },
            },
            {
              icon: "safety",
              tone: "warning",
              accessibilityLabel: "Open Safety support",
              onPress: () => {
                router.push("/safety");
              },
            },
          ]}
        />
      }
    >
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.progressRow}>
          <View style={styles.progressTileWrap}>
            <TrackerTile
              icon="progress"
              label="Progress"
              value={`${stepIndex + 1}/${STEPS.length}`}
              delta={progressLabel}
              tone="accent"
              micro={{ type: "ring", progress: clamp01((stepIndex + 1) / STEPS.length) }}
              variant="compact"
            />
          </View>
          <View style={styles.progressPillWrap}>
            <StatusPill label="Offline ready" variant="neutral" />
          </View>
        </View>

        <MediaCard
          leading={{ type: "icon", icon: "coping", tone: "accent" }}
          title={currentStep.title}
          subtitle={currentStep.prompt}
          chips={[{ text: `${currentStep.count} items`, tone: "muted" }]}
        />

        <Card variant="outlined" padding={tokens.spacing.md}>
          <View style={styles.inputCard}>
            {currentInputs.map((value, index) => (
              <TextInput
                key={`${stepIndex}-${index}`}
                value={value}
                onChangeText={(text) => setItemValue(index, text)}
                placeholder={`Item ${index + 1} (optional)`}
                placeholderTextColor={tokens.colors.textMuted}
                style={styles.input}
                accessibilityLabel={`${currentStep.title} item ${index + 1}`}
                multiline
                maxLength={120}
              />
            ))}
          </View>
        </Card>
      </ScrollView>

      <GlassPanel style={styles.footerPanel}>
        <View style={styles.footerButtons}>
          <View style={styles.footerButtonWrap}>
            <SecondaryButton
              label="Back"
              onPress={goBack}
              disabled={stepIndex === 0}
              accessibilityLabel="Previous grounding step"
            />
          </View>
          <View style={styles.footerButtonWrap}>
            <SecondaryButton
              label="Skip"
              onPress={goNext}
              accessibilityLabel="Skip this grounding step"
            />
          </View>
          <View style={styles.footerButtonWrap}>
            <PrimaryButton
              label={stepIndex === STEPS.length - 1 ? "Finish" : "Next"}
              onPress={goNext}
              accessibilityLabel={
                stepIndex === STEPS.length - 1 ? "Finish grounding" : "Next grounding step"
              }
            />
          </View>
        </View>
      </GlassPanel>
    </Screen>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    container: {
      gap: tokens.spacing.md,
      paddingBottom: tokens.spacing.xxxxl,
    },
    centered: {
      minHeight: 140,
      alignItems: "center",
      justifyContent: "center",
    },
    muted: {
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      color: tokens.colors.textMuted,
    },
    progressRow: {
      flexDirection: "row",
      gap: tokens.spacing.md,
      alignItems: "center",
    },
    progressTileWrap: {
      flex: 1,
      minWidth: 0,
    },
    progressPillWrap: {
      alignSelf: "flex-start",
    },
    inputCard: {
      gap: tokens.spacing.sm,
    },
    input: {
      minHeight: 52,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      borderRadius: tokens.radius.md,
      paddingHorizontal: tokens.spacing.md,
      paddingVertical: tokens.spacing.sm + 2,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      backgroundColor: tokens.colors.surface,
      color: tokens.colors.text,
      textAlignVertical: "top",
    },
    footerPanel: {
      marginTop: tokens.spacing.sm,
    },
    footerButtons: {
      flexDirection: "row",
      gap: tokens.spacing.sm,
      marginTop: tokens.spacing.sm,
    },
    footerButtonWrap: {
      flex: 1,
      minWidth: 0,
    },
    doneTrackerRow: {
      flexDirection: "row",
      gap: tokens.spacing.md,
    },
    doneTrackerWrap: {
      flex: 1,
      minWidth: 0,
    },
    doneButtons: {
      gap: tokens.spacing.sm,
    },
  });
}
