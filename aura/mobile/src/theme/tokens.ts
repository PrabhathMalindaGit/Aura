import { useMemo } from "react";
import {
  Platform,
  useColorScheme,
  type ColorSchemeName,
  type TextStyle,
  type ViewStyle,
} from "react-native";

export type ColorTokens = {
  background: string;
  canvas: string;
  surface: string;
  surfaceElevated: string;
  surfaceSubtle: string;
  text: string;
  textPrimary: string;
  textMuted: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  primary: string;
  primaryAction: string;
  primarySoft: string;
  primaryTextOn: string;
  accent: string;
  accentTextOn: string;
  success: string;
  safe: string;
  successSoft: string;
  successTextOn: string;
  warning: string;
  warningSoft: string;
  warningTextOn: string;
  danger: string;
  dangerSoft: string;
  dangerTextOn: string;
  focusRing: string;
  overlay: string;
};

export type TypographyTokens = {
  title: TextStyle;
  section: TextStyle;
  body: TextStyle;
  caption: TextStyle;
  weights: {
    regular: TextStyle["fontWeight"];
    medium: TextStyle["fontWeight"];
    semibold: TextStyle["fontWeight"];
  };
};

export type SpacingTokens = {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
  xxxl: number;
  xxxxl: number;
};

export type RadiusTokens = {
  sm: number;
  md: number;
  lg: number;
  xl: number;
};

export type ElevationTokens = {
  none: ViewStyle;
  sm: ViewStyle;
  md: ViewStyle;
  card: ViewStyle;
};

export type LayoutTokens = {
  screenPaddingHorizontal: number;
  screenPaddingVertical: number;
  contentMaxWidth: number;
  frameRadius: number;
};

export type ThemeTokens = {
  scheme: "light" | "dark";
  colors: ColorTokens;
  typography: TypographyTokens;
  spacing: SpacingTokens;
  radius: RadiusTokens;
  elevation: ElevationTokens;
  layout: LayoutTokens;
};

const spacing: SpacingTokens = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  xxxxl: 48,
};

const radius: RadiusTokens = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
};

const typography: TypographyTokens = {
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "600",
  },
  section: {
    fontSize: 21,
    lineHeight: 28,
    fontWeight: "600",
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "400",
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
  },
  weights: {
    regular: "400",
    medium: "500",
    semibold: "600",
  },
};

const layout: LayoutTokens = {
  screenPaddingHorizontal: 18,
  screenPaddingVertical: 16,
  contentMaxWidth: 428,
  frameRadius: 30,
};

const lightColors: ColorTokens = {
  background: "#F6F3EE",
  canvas: "#F6F3EE",
  surface: "#ffffff",
  surfaceElevated: "#FBF9F5",
  surfaceSubtle: "#FBF9F5",
  text: "#183042",
  textPrimary: "#183042",
  textMuted: "#5E7182",
  textSecondary: "#5E7182",
  textTertiary: "#8393A0",
  border: "#D7E0E7",
  primary: "#2F6FED",
  primaryAction: "#2F6FED",
  primarySoft: "#EEF4FF",
  primaryTextOn: "#FFFFFF",
  accent: "#2F6FED",
  accentTextOn: "#EEF4FF",
  success: "#2F8F83",
  safe: "#2F8F83",
  successSoft: "#EAF7F4",
  successTextOn: "#EAF7F4",
  warning: "#C9892B",
  warningSoft: "#FBF3E4",
  warningTextOn: "#FBF3E4",
  danger: "#C94A3B",
  dangerSoft: "#FCECE9",
  dangerTextOn: "#FCECE9",
  focusRing: "#7AA7FF",
  overlay: "rgba(24, 48, 66, 0.18)",
};

const darkColors: ColorTokens = {
  background: "#F6F3EE",
  canvas: "#F6F3EE",
  surface: "#FFFFFF",
  surfaceElevated: "#FBF9F5",
  surfaceSubtle: "#FBF9F5",
  text: "#183042",
  textPrimary: "#183042",
  textMuted: "#5E7182",
  textSecondary: "#5E7182",
  textTertiary: "#8393A0",
  border: "#D7E0E7",
  primary: "#2F6FED",
  primaryAction: "#2F6FED",
  primarySoft: "#EEF4FF",
  primaryTextOn: "#FFFFFF",
  accent: "#2F6FED",
  accentTextOn: "#EEF4FF",
  success: "#2F8F83",
  safe: "#2F8F83",
  successSoft: "#EAF7F4",
  successTextOn: "#EAF7F4",
  warning: "#C9892B",
  warningSoft: "#FBF3E4",
  warningTextOn: "#FBF3E4",
  danger: "#C94A3B",
  dangerSoft: "#FCECE9",
  dangerTextOn: "#FCECE9",
  focusRing: "#7AA7FF",
  overlay: "rgba(24, 48, 66, 0.18)",
};

function createElevationTokens(scheme: "light" | "dark", isWeb: boolean): ElevationTokens {
  const shadowColor =
    scheme === "dark" ? "rgba(24, 48, 66, 0.16)" : "rgba(24, 48, 66, 0.08)";

  const smShadow = `0px 1px 2px ${shadowColor}`;
  const mdShadow = `0px 10px 24px ${shadowColor}`;
  const cardShadow = `0px 4px 14px ${shadowColor}`;

  if (isWeb) {
    return {
      none: {},
      sm: { boxShadow: smShadow } as ViewStyle,
      md: { boxShadow: mdShadow } as ViewStyle,
      card: { boxShadow: cardShadow } as ViewStyle,
    };
  }

  return {
    none: {},
    sm: { elevation: 1, boxShadow: smShadow } as ViewStyle,
    md: { elevation: 3, boxShadow: mdShadow } as ViewStyle,
    card: { elevation: 2, boxShadow: cardShadow } as ViewStyle,
  };
}

function buildTokens(scheme: "light" | "dark"): ThemeTokens {
  const isWeb = Platform.OS === "web";

  return {
    scheme,
    colors: scheme === "dark" ? darkColors : lightColors,
    typography,
    spacing,
    radius,
    elevation: createElevationTokens(scheme, isWeb),
    layout,
  };
}

export function getTokens(colorScheme: ColorSchemeName): ThemeTokens {
  void colorScheme;
  return buildTokens("light");
}

export function useTokens(): ThemeTokens {
  const colorScheme = useColorScheme();
  return useMemo(() => getTokens(colorScheme), [colorScheme]);
}
