import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import { isApiError, type ApiError } from "@/src/api/client";
import {
  getExerciseSession,
  type ExerciseSessionDetail,
} from "@/src/api/patient";
import { InlineNotice } from "@/src/components/InlineNotice";
import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import { Section } from "@/src/components/Section";
import { useAuth } from "@/src/state/auth";
import { useIsOffline } from "@/src/state/network";
import { formatISOToHuman } from "@/src/utils/date";
import { normalizeUnknownError } from "@/src/utils/errors";

type DetailParams = {
  id?: string | string[];
};

function toFriendlyError(error: unknown): string {
  let apiError: ApiError;
  if (isApiError(error)) {
    apiError = error;
  } else {
    const normalized = normalizeUnknownError(error);
    apiError = {
      title: normalized.title,
      message: normalized.message,
      kind: normalized.kind,
      retryable: normalized.retryable,
      detail: normalized.detail,
    };
  }

  if (apiError.kind === "offline") {
    return "You’re offline. Connect to load session details.";
  }
  if (apiError.kind === "network") {
    return "Couldn’t reach the service. Please try again.";
  }
  if (apiError.kind === "server") {
    return "Service unavailable. Please try again shortly.";
  }
  return apiError.message || "Unable to load session details.";
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}

export default function ExerciseSessionDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<DetailParams>();
  const auth = useAuth();
  const isOffline = useIsOffline();
  const sessionId = Array.isArray(params.id) ? params.id[0] : params.id;
  const [session, setSession] = useState<ExerciseSessionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    if (!auth.token || !sessionId) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const detail = await getExerciseSession(auth.token, sessionId);
      setSession(detail);
    } catch (error) {
      setErrorMessage(toFriendlyError(error));
    } finally {
      setIsLoading(false);
    }
  }, [auth.token, sessionId]);

  useEffect(() => {
    if (auth.status !== "signedIn") {
      return;
    }
    void loadDetail();
  }, [auth.status, loadDetail]);

  if (auth.status === "loading") {
    return (
      <Screen title="Session detail">
        <View style={styles.centered}>
          <ActivityIndicator size="small" />
        </View>
      </Screen>
    );
  }

  if (auth.status === "signedOut") {
    return <Redirect href="/(auth)/login" />;
  }

  if (!sessionId) {
    return (
      <Screen title="Session detail">
        <InlineNotice
          variant="error"
          title="Missing session ID"
          message="Open a session from the Sessions list."
        />
      </Screen>
    );
  }

  return (
    <Screen title="Session detail">
      <ScrollView contentContainerStyle={styles.container}>
        <PrimaryButton
          label="Back to sessions"
          onPress={() => {
            router.replace("/exercise-sessions");
          }}
        />

        {isOffline ? (
          <InlineNotice
            variant="warning"
            title="Offline"
            message="Offline — detail refresh may fail."
          />
        ) : null}

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="small" />
          </View>
        ) : errorMessage ? (
          <InlineNotice variant="error" title="Couldn’t load session" message={errorMessage} />
        ) : !session ? (
          <InlineNotice
            variant="info"
            title="Session not found"
            message="The session may have been removed."
          />
        ) : (
          <>
            <Section title={session.planTitle ?? "Exercise session"}>
              <Text style={styles.line}>Started: {formatISOToHuman(session.startedAt)}</Text>
              <Text style={styles.line}>Ended: {formatISOToHuman(session.endedAt)}</Text>
              <Text style={styles.line}>Duration: {formatDuration(session.durationSeconds)}</Text>
              <Text style={styles.line}>Status: {session.status}</Text>
              <Text style={styles.line}>
                Completed: {session.completedCount}/{session.exerciseCount}
              </Text>
              {typeof session.avgPainDuring === "number" ? (
                <Text style={styles.line}>Avg pain during: {session.avgPainDuring}/5</Text>
              ) : null}
            </Section>

            <Section title="Exercise feedback">
              <View style={styles.exerciseList}>
                {session.exercises.map((exercise) => (
                  <View key={`${exercise.itemKey}-${exercise.order}`} style={styles.exerciseCard}>
                    <Text style={styles.exerciseName}>{exercise.nameSnapshot}</Text>
                    <Text style={styles.exerciseMeta}>
                      {exercise.completed ? "Completed" : "Not completed"}
                      {exercise.difficulty ? ` · Difficulty: ${exercise.difficulty}` : ""}
                      {typeof exercise.painDuring === "number"
                        ? ` · Pain: ${exercise.painDuring}/5`
                        : ""}
                    </Text>
                    {exercise.note ? (
                      <Text style={styles.exerciseNote}>{exercise.note}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            </Section>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
    paddingBottom: 16,
  },
  centered: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  line: {
    fontSize: 14,
    color: "#374151",
    marginBottom: 4,
  },
  exerciseList: {
    gap: 8,
  },
  exerciseCard: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#ffffff",
    gap: 4,
  },
  exerciseName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  exerciseMeta: {
    fontSize: 13,
    color: "#374151",
  },
  exerciseNote: {
    fontSize: 13,
    color: "#4b5563",
  },
});
