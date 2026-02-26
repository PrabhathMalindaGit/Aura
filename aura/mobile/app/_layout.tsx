import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import "@/src/services/notificationsInit";
import { AuthProvider } from '@/src/state/auth';
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

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const tokens = useTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const isWeb = Platform.OS === "web";

  return (
    <AuthProvider>
      <CaregiverSessionProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          {isWeb ? (
            <View style={styles.webBackdrop}>
              <View style={styles.webFrame}>
                <Slot />
              </View>
            </View>
          ) : (
            <View style={styles.root}>
              <Slot />
            </View>
          )}
        </ThemeProvider>
      </CaregiverSessionProvider>
    </AuthProvider>
  );
}

function createStyles(tokens: ReturnType<typeof useTokens>) {
  return StyleSheet.create({
    root: {
      flex: 1,
    },
    webBackdrop: {
      flex: 1,
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: tokens.colors.background,
      paddingVertical: tokens.spacing.md,
    },
    webFrame: {
      flex: 1,
      width: "100%",
      maxWidth: tokens.layout.contentMaxWidth,
      borderRadius: tokens.layout.frameRadius,
      borderWidth: 1,
      borderColor: tokens.colors.border,
      overflow: "hidden",
      backgroundColor: tokens.colors.background,
      ...tokens.elevation.card,
    },
  });
}
