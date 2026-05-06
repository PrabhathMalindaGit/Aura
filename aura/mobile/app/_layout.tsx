import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import "@/src/services/notificationsInit";
import { useDevRenderAudit } from '@/src/dev/renderAudit';
import { AuthProvider, useAuth } from '@/src/state/auth';
import { CaregiverSessionProvider } from '@/src/state/caregiverSession';
import { SyncCoordinator } from '@/src/sync/SyncCoordinator';
import { useTokens } from '@/src/theme/tokens';
import { SecondaryButton } from '@/src/components/SecondaryButton';
import { VoiceCommandButton } from '@/src/components/VoiceCommandButton';
import { shouldShowVoiceCommandForSegments } from '@/src/utils/voiceCommandVisibility';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  return <RootLayoutNav fontsLoaded={loaded} />;
}

function RootLayoutNav({ fontsLoaded }: { fontsLoaded: boolean }) {
  const colorScheme = useColorScheme();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  useDevRenderAudit("RootLayoutNav");
  const [showBootFallback, setShowBootFallback] = useState(false);
  const isWeb = Platform.OS === "web";
  const webViewportStyle = useMemo(
    () => (isWeb ? ({ minHeight: "100vh" } as any) : null),
    [isWeb]
  );
  const webShadowStyle = useMemo(
    () =>
      isWeb
        ? ({
            boxShadow:
              tokens.scheme === "dark"
                ? "0 24px 56px rgba(2, 6, 23, 0.58)"
                : "0 22px 52px rgba(15, 23, 42, 0.18)",
          } as any)
        : null,
    [isWeb, tokens.scheme]
  );

  useEffect(() => {
    if (fontsLoaded) {
      setShowBootFallback(false);
      return;
    }

    const timer = setTimeout(() => {
      setShowBootFallback(true);
    }, 3500);

    return () => clearTimeout(timer);
  }, [fontsLoaded]);

  const handleRetryBoot = () => {
    if (typeof window !== "undefined" && typeof window.location?.reload === "function") {
      window.location.reload();
    }
  };

  const bootOverlay = !fontsLoaded ? (
    <View pointerEvents="auto" style={styles.loadingOverlay}>
      <View style={styles.bootCard}>
        <ActivityIndicator size="small" color={tokens.colors.primary} />
        <Text style={styles.bootTitle}>Loading Aura</Text>
        <Text style={styles.bootText}>
          Preparing your secure patient workspace. This usually takes a moment.
        </Text>
        {showBootFallback && isWeb ? (
          <SecondaryButton label="Try again" onPress={handleRetryBoot} />
        ) : null}
      </View>
    </View>
  ) : null;

  return (
    <AuthProvider>
      <CaregiverSessionProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <RootRouteGuard />
          <SyncCoordinator />
          {isWeb ? (
            <View style={[styles.webBackdrop, webViewportStyle]}>
              <View style={[styles.webFrameOuter, webShadowStyle]}>
                <View style={styles.webFrameInner}>
                  <Slot />
                  <VoiceCommandMount />
                  {bootOverlay}
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.root}>
              <Slot />
              <VoiceCommandMount />
              {bootOverlay}
            </View>
          )}
        </ThemeProvider>
      </CaregiverSessionProvider>
    </AuthProvider>
  );
}

function VoiceCommandMount() {
  const { status } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const shouldShow = shouldShowVoiceCommandForSegments(status, segments);

  if (!shouldShow) {
    return null;
  }

  return (
    <View pointerEvents="box-none" style={styles.voiceCommandDock}>
      <VoiceCommandButton
        onNavigate={(route) => {
          router.push(route as never);
        }}
        onGoBack={() => {
          router.back();
        }}
      />
    </View>
  );
}

function RootRouteGuard() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const rootSegment = segments[0];
  const inTabs = rootSegment === "(tabs)";
  const inAuth = rootSegment === "(auth)";

  useEffect(() => {
    if (status === "signedOut" && inTabs) {
      router.replace("/(auth)/login");
      return;
    }

    if (status === "signedIn" && inAuth) {
      router.replace("/(tabs)");
    }
  }, [inAuth, inTabs, router, status]);

  return null;
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    root: {
      flex: 1,
    },
    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.colors.background,
      paddingHorizontal: tokens.spacing.lg,
    },
    bootCard: {
      width: "100%",
      maxWidth: 360,
      borderRadius: tokens.radius.xl,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.surface,
      paddingHorizontal: tokens.spacing.xl,
      paddingVertical: tokens.spacing.xl,
      gap: tokens.spacing.sm,
      alignItems: "center",
    },
    bootTitle: {
      color: tokens.colors.text,
      fontSize: tokens.typography.section.fontSize,
      lineHeight: tokens.typography.section.lineHeight,
      fontWeight: tokens.typography.weights.semibold,
      textAlign: "center",
    },
    bootText: {
      color: tokens.colors.textMuted,
      fontSize: tokens.typography.body.fontSize,
      lineHeight: tokens.typography.body.lineHeight,
      textAlign: "center",
    },
    webBackdrop: {
      flex: 1,
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.colors.background,
      paddingVertical: tokens.spacing.md,
    },
    webFrameOuter: {
      flex: 1,
      width: "100%",
      maxWidth: tokens.layout.contentMaxWidth,
      borderRadius: tokens.layout.frameRadius,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      backgroundColor: tokens.colors.background,
    },
    webFrameInner: {
      flex: 1,
      borderRadius: tokens.layout.frameRadius,
      overflow: "hidden",
      backgroundColor: tokens.colors.background,
    },
    voiceCommandDock: {
      position: "absolute",
      right: tokens.spacing.md,
      bottom: 104,
      alignItems: "flex-end",
      zIndex: 20,
    },
  });
}
