import { Redirect, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";

import { Avatar } from "@/src/components/Avatar";
import { Banner } from "@/src/components/Banner";
import { Card } from "@/src/components/Card";
import { GlassPanel } from "@/src/components/GlassPanel";
import { HeroHeader } from "@/src/components/HeroHeader";
import { MediaCard } from "@/src/components/MediaCard";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { SecondaryButton } from "@/src/components/SecondaryButton";
import { SegmentedControl } from "@/src/components/SegmentedControl";
import { TrackerTile } from "@/src/components/TrackerTile";
import { useAuth } from "@/src/state/auth";
import {
  formatLastUsed,
  getUsage,
  incrementUsage,
  type CopingUsage,
} from "@/src/state/copingUsage";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { useTokens } from "@/src/theme/tokens";

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
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
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

  const animatedDialStyle = useMemo(
    () => [
      styles.dialCard,
      !reduceMotionEnabled && timer.runState === "running"
        ? {
            transform: [{ scale: pulseScale }],
          }
        : null,
    ],
    [pulseScale, reduceMotionEnabled, timer.runState, styles.dialCard]
  );

  if (auth.status === "loading") {
    return (
      <Screen
        scroll={false}
        header={<HeroHeader variant="compact" title="Breathing" subtitle="Loading" />}
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

  const ringSize = 196;
  const ringStroke = 10;
  const radius = (ringSize - ringStroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, completionPct / 100));
  const dashOffset = circumference * (1 - progress);

  return (
    <Screen
      scroll={false}
      header={
        <HeroHeader
          variant="compact"
          title="Breathing"
          subtitle={
            timer.runState === "running"
              ? `${currentInstruction} · ${formatSeconds(timer.totalRemaining)}`
              : timer.runState === "paused"
                ? `Paused · ${formatSeconds(timer.totalRemaining)}`
                : timer.runState === "done"
                  ? "Done · Nice work"
                  : "Choose a duration"
          }
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
        {reduceMotionEnabled ? (
          <Banner
            variant="info"
            title="Reduced motion"
            message="Reduced motion is enabled. Pulse animation is disabled."
          />
        ) : null}

        <Card variant="outlined" padding={tokens.spacing.md}>
          <View style={styles.setupCard}>
            <Text style={styles.setupTitle}>Session setup</Text>
            <Text style={styles.muted}>Choose a duration and follow the prompts.</Text>
            <SegmentedControl
              value={String(durationMinutes) as "1" | "3" | "5"}
              options={[
                { value: "1", label: "1 min", disabled: !canChangeDuration },
                { value: "3", label: "3 min", disabled: !canChangeDuration },
                { value: "5", label: "5 min", disabled: !canChangeDuration },
              ]}
              onChange={(value) => {
                if (!canChangeDuration) {
                  return;
                }
                const nextDuration = Number(value) as DurationMinutes;
                setDurationMinutes(nextDuration);
                setCountedCompletion(false);
                setTimer(buildIdleState(nextDuration));
              }}
              accessibilityLabel="Breathing duration"
            />
          </View>
        </Card>

        <Card variant="outlined" padding={tokens.spacing.md}>
          <Animated.View style={animatedDialStyle}>
            <Svg width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`}>
              <Circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                stroke={tokens.colors.border}
                strokeWidth={ringStroke}
                fill="none"
              />
              <Circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                stroke={tokens.colors.accent}
                strokeWidth={ringStroke}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${circumference} ${circumference}`}
                strokeDashoffset={dashOffset}
                transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
              />
            </Svg>
            <View style={styles.dialCenter}>
              <Text style={styles.instruction}>{currentInstruction}</Text>
              <Text style={styles.countdown}>
                {timer.runState === "done" ? "Complete" : `${timer.phaseRemaining}s`}
              </Text>
              <Text style={styles.remainingLabel}>{formatSeconds(timer.totalRemaining)}</Text>
            </View>
          </Animated.View>
          <Text style={styles.progressLabel}>Progress: {completionPct}%</Text>
        </Card>

        <MediaCard
          leading={{ type: "icon", icon: "coping", tone: "accent" }}
          title="Usage"
          subtitle={`Used ${usage.count} time${usage.count === 1 ? "" : "s"} · Last used ${formatLastUsed(usage.lastUsedAt)}`}
        />

        <View style={styles.trackerWrap}>
          <TrackerTile
            icon="weekly"
            label="Remaining"
            value={formatSeconds(timer.totalRemaining)}
            delta="Session"
            tone="muted"
            micro={{ type: "dots", values: [timer.totalRemaining, 0, 0, 0, 0, 0, 0] }}
          />
        </View>
      </ScrollView>

      <GlassPanel style={styles.footerPanel}>
        {timer.runState === "done" ? (
          <Banner variant="info" title="Done" message="Nice work." />
        ) : null}

        {timer.runState === "running" ? (
          <View style={styles.footerButtons}>
            <View style={styles.footerButtonWrap}>
              <PrimaryButton
                label="Pause"
                onPress={pause}
                accessibilityLabel="Pause breathing session"
              />
            </View>
            <View style={styles.footerButtonWrap}>
              <SecondaryButton
                label="Stop"
                onPress={stop}
                accessibilityLabel="Stop breathing session"
              />
            </View>
          </View>
        ) : timer.runState === "paused" ? (
          <View style={styles.footerButtons}>
            <View style={styles.footerButtonWrap}>
              <PrimaryButton
                label="Resume"
                onPress={start}
                accessibilityLabel="Resume breathing session"
              />
            </View>
            <View style={styles.footerButtonWrap}>
              <SecondaryButton
                label="Stop"
                onPress={stop}
                accessibilityLabel="Stop breathing session"
              />
            </View>
          </View>
        ) : timer.runState === "done" ? (
          <View style={styles.footerButtons}>
            <View style={styles.footerButtonWrap}>
              <PrimaryButton
                label="Start again"
                onPress={start}
                accessibilityLabel="Start another breathing session"
              />
            </View>
            <View style={styles.footerButtonWrap}>
              <SecondaryButton
                label="Back to tools"
                onPress={() => router.push("/coping-tools" as never)}
                accessibilityLabel="Back to coping tools"
              />
            </View>
          </View>
        ) : (
          <PrimaryButton
            label="Start"
            onPress={start}
            accessibilityLabel="Start breathing session"
          />
        )}
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
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      color: tokens.colors.textMuted,
    },
    setupCard: {
      gap: tokens.spacing.sm,
    },
    setupTitle: {
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      color: tokens.colors.text,
    },
    dialCard: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: tokens.spacing.md,
    },
    dialCenter: {
      position: "absolute",
      alignItems: "center",
      justifyContent: "center",
      gap: tokens.spacing.xs,
    },
    instruction: {
      fontSize: 30,
      lineHeight: 36,
      fontWeight: tokens.typography.weights.semibold,
      color: tokens.colors.text,
    },
    countdown: {
      fontSize: 26,
      lineHeight: 32,
      fontWeight: tokens.typography.weights.semibold,
      color: tokens.colors.text,
    },
    remainingLabel: {
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      color: tokens.colors.textMuted,
    },
    progressLabel: {
      marginTop: tokens.spacing.sm,
      textAlign: "center",
      fontSize: tokens.typography.caption.fontSize,
      lineHeight: tokens.typography.caption.lineHeight,
      color: tokens.colors.textMuted,
    },
    trackerWrap: {
      marginBottom: tokens.spacing.sm,
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
  });
}
