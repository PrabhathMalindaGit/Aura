import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Slot, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import "@/src/services/notificationsInit";
import { AuthProvider, useAuth } from '@/src/state/auth';
import { CaregiverSessionProvider } from '@/src/state/caregiverSession';
import { useTokens } from '@/src/theme/tokens';

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

  return (
    <AuthProvider>
      <CaregiverSessionProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <RootRouteGuard />
          {isWeb ? (
            <View style={[styles.webBackdrop, webViewportStyle]}>
              <View style={[styles.webFrameOuter, webShadowStyle]}>
                <View style={styles.webFrameInner}>
                  <Slot />
                  {!fontsLoaded ? (
                    <View pointerEvents="none" style={styles.loadingOverlay}>
                      <ActivityIndicator size="small" />
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.root}>
              <Slot />
              {!fontsLoaded ? (
                <View pointerEvents="none" style={styles.loadingOverlay}>
                  <ActivityIndicator size="small" />
                </View>
              ) : null}
            </View>
          )}
        </ThemeProvider>
      </CaregiverSessionProvider>
    </AuthProvider>
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
  });
}
