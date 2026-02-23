import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { PrimaryButton } from "@/src/components/PrimaryButton";
import { Screen } from "@/src/components/Screen";
import {
  EMERGENCY_NUMBER_PLACEHOLDER,
  SUPPORT_PHONE_PLACEHOLDER,
} from "@/src/config/constants";
import { useAuth } from "@/src/state/auth";
import { formatReasons } from "@/src/utils/reasonLabels";

type SafetyParams = {
  alertId?: string | string[];
  reasonCodes?: string | string[];
};

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

async function openPhoneDialer(number: string): Promise<void> {
  const telUrl = `tel:${number}`;
  const supported = await Linking.canOpenURL(telUrl);
  if (!supported) {
    Alert.alert("Unable to call", "Your device cannot open the phone dialer.");
    return;
  }

  await Linking.openURL(telUrl);
}

export default function SafetyScreen() {
  const router = useRouter();
  const { status } = useAuth();
  const params = useLocalSearchParams<SafetyParams>();

  const reasonCodes = useMemo(
    () => parseReasonCodes(params.reasonCodes),
    [params.reasonCodes]
  );
  const reasonMessages = useMemo(() => formatReasons(reasonCodes), [reasonCodes]);
  const alertId = Array.isArray(params.alertId) ? params.alertId[0] : params.alertId;

  const goHome = () => {
    try {
      router.replace("/(tabs)");
    } catch {
      router.push("/(tabs)");
    }
  };

  if (status === "loading") {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" />
      </View>
    );
  }

  if (status === "signedOut") {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Screen title="Safety">
      <View style={styles.container}>
        <Text style={styles.title}>We&apos;re concerned about your safety</Text>
        <Text style={styles.body}>
          We can&apos;t continue normally right now. If you are in immediate
          danger, call emergency services.
        </Text>

        {reasonMessages.length > 0 ? (
          <View style={styles.reasonList}>
            <Text style={styles.reasonHeading}>Why this happened:</Text>
            {reasonMessages.map((reason) => (
              <Text key={reason} style={styles.reasonItem}>
                • {reason}
              </Text>
            ))}
          </View>
        ) : null}

        {alertId ? (
          <Text style={styles.notice}>Clinician notified.</Text>
        ) : (
          <Text style={styles.notice}>
            We&apos;ll guide you back once you&apos;re ready.
          </Text>
        )}

        <View style={styles.actions}>
          <PrimaryButton
            label="Call emergency"
            onPress={() => {
              void openPhoneDialer(EMERGENCY_NUMBER_PLACEHOLDER);
            }}
            accessibilityLabel="Call emergency services"
          />
          <PrimaryButton
            label="Call clinic"
            onPress={() => {
              void openPhoneDialer(SUPPORT_PHONE_PLACEHOLDER);
            }}
            accessibilityLabel="Call clinic support"
          />
          <PrimaryButton
            label="I’m safe right now"
            onPress={goHome}
            accessibilityLabel="I am safe and return to home"
          />
          <Pressable
            accessibilityRole="button"
            onPress={goHome}
            style={({ pressed }) => [
              styles.backHomeButton,
              pressed ? styles.backHomeButtonPressed : null,
            ]}
          >
            <Text style={styles.backHomeText}>Back to Home</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    flex: 1,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 30,
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
  },
  reasonList: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  reasonHeading: {
    fontSize: 14,
    fontWeight: "600",
  },
  reasonItem: {
    fontSize: 14,
    lineHeight: 20,
  },
  notice: {
    fontSize: 14,
    fontWeight: "500",
  },
  actions: {
    marginTop: 4,
    gap: 12,
  },
  backHomeButton: {
    alignSelf: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  backHomeButtonPressed: {
    opacity: 0.75,
  },
  backHomeText: {
    fontSize: 14,
    color: "#1f2937",
    fontWeight: "600",
  },
});
