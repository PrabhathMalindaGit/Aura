import { Redirect, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
import { useReducedMotion } from "@/src/hooks/useReducedMotion";

type BreathingPhase = "inhale" | "hold" | "exhale";
type RunState = "idle" | "running" | "paused" | "done";
type DurationMinutes = 1 | 3 | 5;

const INHALE_SECONDS = 4;
const HOLD_SECONDS = 2;
const EXHALE_SECONDS = 6;

const PHASES: Array<{ phase: BreathingPhase; seconds: number; label: string }> = [
  { phase: "inhale", seconds: INHALE_SECONDS, label: "Inhale" },
  { phase: "hold", seconds: HOLD_SECONDS, label: "Hold" },
  { phase: "exhale", seconds: EXHALE_SECONDS, label: "Exhale" },
];

type TimerState = {
  runState: RunState;
  totalRemaining: number;
  phaseIndex: number;
  phaseRemaining: number;
};

function buildIdleState(minutes: DurationMinutes): TimerState {
  return {
    runState: "idle",
    totalRemaining: minutes * 60,
    phaseIndex: 0,
    phaseRemaining: PHASES[0].seconds,
  };
}

function formatSeconds(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function BreathingScreen() {
  const auth = useAuth();
  const router = useRouter();
  const reduceMotionEnabled = useReducedMotion();
  const pulseScale = useRef(new Animated.Value(1)).current;

  const [durationMinutes, setDurationMinutes] = useState<DurationMinutes>(3);
  const [timer, setTimer] = useState<TimerState>(() => buildIdleState(3));
  const [usage, setUsage] = useState<CopingUsage>({ count: 0, lastUsedAt: null });
  const [countedCompletion, setCountedCompletion] = useState(false);

  const activePhase = PHASES[timer.phaseIndex];
  const currentInstruction = timer.runState === "done" ? "Done" : activePhase.label;
  const totalDurationSeconds = durationMinutes * 60;
  const completionPct =
    totalDurationSeconds > 0
      ? Math.round(((totalDurationSeconds - timer.totalRemaining) / totalDurationSeconds) * 100)
      : 0;

  useEffect(() => {
    let mounted = true;
    void getUsage("breathing").then((value) => {
      if (mounted) {
        setUsage(value);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (timer.runState !== "running") {
      return;
    }
    const tick = setInterval(() => {
      setTimer((previous) => {
        if (previous.runState !== "running") {
          return previous;
        }
        if (previous.totalRemaining <= 1) {
          return {
            ...previous,
            runState: "done",
            totalRemaining: 0,
            phaseRemaining: 0,
          };
        }

        const nextTotalRemaining = previous.totalRemaining - 1;
        let nextPhaseIndex = previous.phaseIndex;
        let nextPhaseRemaining = previous.phaseRemaining - 1;

        if (nextPhaseRemaining <= 0) {
          nextPhaseIndex = (previous.phaseIndex + 1) % PHASES.length;
          nextPhaseRemaining = PHASES[nextPhaseIndex].seconds;
        }

        return {
          ...previous,
          totalRemaining: nextTotalRemaining,
          phaseIndex: nextPhaseIndex,
          phaseRemaining: nextPhaseRemaining,
        };
      });
    }, 1000);

    return () => clearInterval(tick);
  }, [timer.runState]);

  useEffect(() => {
    if (timer.runState !== "done" || countedCompletion) {
      return;
    }
    setCountedCompletion(true);
    void incrementUsage("breathing").then((nextUsage) => {
      setUsage(nextUsage);
    });
  }, [countedCompletion, timer.runState]);

  useEffect(() => {
    if (reduceMotionEnabled || timer.runState !== "running") {
      pulseScale.stopAnimation();
      pulseScale.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, {
          toValue: 1.04,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseScale, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseScale, reduceMotionEnabled, timer.runState]);

  const canChangeDuration = timer.runState === "idle" || timer.runState === "done";

  const start = () => {
    if (timer.runState === "paused") {
      setTimer((previous) => ({ ...previous, runState: "running" }));
      return;
    }
    setCountedCompletion(false);
    setTimer({
      runState: "running",
      totalRemaining: durationMinutes * 60,
      phaseIndex: 0,
      phaseRemaining: PHASES[0].seconds,
    });
  };

  const pause = () => {
    setTimer((previous) =>
      previous.runState === "running"
        ? { ...previous, runState: "paused" }
        : previous
    );
  };

  const stop = () => {
    setCountedCompletion(false);
    setTimer(buildIdleState(durationMinutes));
  };

  const animatedCardStyle = useMemo(
    () => [
      styles.instructionCard,
      !reduceMotionEnabled && timer.runState === "running"
        ? {
            transform: [{ scale: pulseScale }],
          }
        : null,
    ],
    [pulseScale, reduceMotionEnabled, timer.runState]
  );

  if (auth.status === "loading") {
    return (
      <Screen title="Breathing">
        <View style={styles.centered}>
          <Text style={styles.muted}>Loading…</Text>
        </View>
      </Screen>
    );
  }

  if (auth.status === "signedOut") {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Screen title="Breathing">
      <ScrollView contentContainerStyle={styles.container}>
        <Section title="Session setup">
          <Text style={styles.muted}>Choose a duration and follow the prompts.</Text>
          <View style={styles.durationRow}>
            {[1, 3, 5].map((minutes) => {
              const selected = durationMinutes === minutes;
              return (
                <Pressable
                  key={minutes}
                  accessibilityRole="button"
                  accessibilityLabel={`${minutes} minute breathing session`}
                  disabled={!canChangeDuration}
                  onPress={() => {
                    if (!canChangeDuration) {
                      return;
                    }
                    const nextDuration = minutes as DurationMinutes;
                    setDurationMinutes(nextDuration);
                    setCountedCompletion(false);
                    setTimer(buildIdleState(nextDuration));
                  }}
                  style={({ pressed }) => [
                    styles.durationChip,
                    selected ? styles.durationChipSelected : null,
                    !canChangeDuration ? styles.durationChipDisabled : null,
                    pressed && canChangeDuration ? styles.durationChipPressed : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.durationChipLabel,
                      selected ? styles.durationChipLabelSelected : null,
                    ]}
                  >
                    {minutes} min
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section title="Guided breathing">
          <Animated.View style={animatedCardStyle}>
            <Text style={styles.instruction}>{currentInstruction}</Text>
            <Text style={styles.countdown}>
              {timer.runState === "done" ? "Complete" : `${timer.phaseRemaining}s`}
            </Text>
            <Text style={styles.remainingLabel}>
              Total remaining: {formatSeconds(timer.totalRemaining)}
            </Text>
            <Text style={styles.remainingLabel}>Progress: {completionPct}%</Text>
          </Animated.View>
          {reduceMotionEnabled ? (
            <Text style={styles.muted}>Reduced motion is enabled.</Text>
          ) : null}
        </Section>

        <Section title="Controls">
          {timer.runState === "running" ? (
            <>
              <PrimaryButton
                label="Pause"
                onPress={pause}
                accessibilityLabel="Pause breathing session"
              />
              <PrimaryButton
                label="Stop"
                onPress={stop}
                accessibilityLabel="Stop breathing session"
              />
            </>
          ) : timer.runState === "paused" ? (
            <>
              <PrimaryButton
                label="Resume"
                onPress={start}
                accessibilityLabel="Resume breathing session"
              />
              <PrimaryButton
                label="Stop"
                onPress={stop}
                accessibilityLabel="Stop breathing session"
              />
            </>
          ) : timer.runState === "done" ? (
            <>
              <Text style={styles.doneText}>Done — nice work.</Text>
              <PrimaryButton
                label="Start again"
                onPress={start}
                accessibilityLabel="Start another breathing session"
              />
              <PrimaryButton
                label="Back to tools"
                onPress={() => router.push("/coping-tools" as never)}
                accessibilityLabel="Back to coping tools"
              />
            </>
          ) : (
            <PrimaryButton
              label="Start"
              onPress={start}
              accessibilityLabel="Start breathing session"
            />
          )}
        </Section>

        <Section title="Usage">
          <Text style={styles.muted}>
            Used {usage.count} time{usage.count === 1 ? "" : "s"}
          </Text>
          <Text style={styles.muted}>Last used: {formatLastUsed(usage.lastUsedAt)}</Text>
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
  muted: {
    fontSize: 13,
    color: "#6b7280",
  },
  durationRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  durationChip: {
    minWidth: 88,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  durationChipSelected: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  durationChipDisabled: {
    opacity: 0.55,
  },
  durationChipPressed: {
    opacity: 0.8,
  },
  durationChipLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  durationChipLabelSelected: {
    color: "#ffffff",
  },
  instructionCard: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 14,
    backgroundColor: "#f9fafb",
    paddingVertical: 22,
    paddingHorizontal: 16,
    alignItems: "center",
    gap: 8,
  },
  instruction: {
    fontSize: 36,
    fontWeight: "700",
    color: "#111827",
  },
  countdown: {
    fontSize: 28,
    fontWeight: "700",
    color: "#1f2937",
  },
  remainingLabel: {
    fontSize: 14,
    color: "#4b5563",
  },
  doneText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
});
