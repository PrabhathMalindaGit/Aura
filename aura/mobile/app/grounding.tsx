import { Redirect, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { Section } from "@/src/components/Section";
import { useAuth } from "@/src/state/auth";
import {
  formatLastUsed,
  getUsage,
  incrementUsage,
  type CopingUsage,
} from "@/src/state/copingUsage";

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

export default function GroundingScreen() {
  const auth = useAuth();
  const router = useRouter();
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
      <Screen title="Grounding">
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
      <Screen title="Grounding">
        <View style={styles.doneContainer}>
          <Text style={styles.doneTitle}>Done</Text>
          <Text style={styles.doneText}>
            Nice work. You can return to tools whenever you&apos;re ready.
          </Text>
          <PrimaryButton
            label="Back to tools"
            onPress={() => router.push("/coping-tools" as never)}
            accessibilityLabel="Back to coping tools"
          />
          <PrimaryButton
            label="Start again"
            onPress={restart}
            accessibilityLabel="Start grounding again"
          />
          <Text style={styles.muted}>
            Used {usage.count} time{usage.count === 1 ? "" : "s"} • Last used{" "}
            {formatLastUsed(usage.lastUsedAt)}
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen title="Grounding">
      <ScrollView contentContainerStyle={styles.container}>
        <Section title="5-4-3-2-1 senses">
          <Text style={styles.description}>
            Name things you notice right now. Take your time.
          </Text>
          <Text style={styles.progress}>{progressLabel}</Text>
        </Section>

        <Section title={currentStep.title}>
          <Text style={styles.muted}>{currentStep.prompt}</Text>
          {currentInputs.map((value, index) => (
            <TextInput
              key={`${stepIndex}-${index}`}
              value={value}
              onChangeText={(text) => setItemValue(index, text)}
              placeholder={`Item ${index + 1} (optional)`}
              style={styles.input}
              accessibilityLabel={`${currentStep.title} item ${index + 1}`}
              multiline
              maxLength={120}
            />
          ))}
        </Section>

        <Section title="Actions">
          <PrimaryButton
            label={stepIndex === STEPS.length - 1 ? "Finish" : "Next"}
            onPress={goNext}
            accessibilityLabel={
              stepIndex === STEPS.length - 1 ? "Finish grounding" : "Next grounding step"
            }
          />
          <PrimaryButton
            label="Skip"
            onPress={goNext}
            accessibilityLabel="Skip this grounding step"
          />
          <PrimaryButton
            label="Back"
            onPress={goBack}
            disabled={stepIndex === 0}
            accessibilityLabel="Previous grounding step"
          />
        </Section>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    paddingBottom: 24,
  },
  centered: {
    minHeight: 140,
    alignItems: "center",
    justifyContent: "center",
  },
  doneContainer: {
    flex: 1,
    gap: 12,
    justifyContent: "center",
  },
  doneTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
  },
  doneText: {
    fontSize: 15,
    color: "#374151",
    lineHeight: 22,
  },
  description: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  progress: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },
  muted: {
    fontSize: 13,
    color: "#6b7280",
  },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: "#fff",
    textAlignVertical: "top",
  },
});
