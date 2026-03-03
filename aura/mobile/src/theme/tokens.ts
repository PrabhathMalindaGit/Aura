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
  surface: string;
  surfaceElevated: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  primaryTextOn: string;
  accent: string;
  accentTextOn: string;
  success: string;
  successTextOn: string;
  warning: string;
  warningTextOn: string;
  danger: string;
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
  xl: 20,
  xxl: 24,
  xxxl: 32,
  xxxxl: 40,
};

const radius: RadiusTokens = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
};

const typography: TypographyTokens = {
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "600",
  },
  section: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "600",
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "400",
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },
  weights: {
    regular: "400",
    medium: "500",
    semibold: "600",
  },
};

const layout: LayoutTokens = {
  screenPaddingHorizontal: 16,
  screenPaddingVertical: 16,
  contentMaxWidth: 420,
  frameRadius: 28,
};

const lightColors: ColorTokens = {
  background: "#f3f7fb",
  surface: "#ffffff",
  surfaceElevated: "#f8fbff",
  text: "#0f1e2e",
  textMuted: "#4b6175",
  border: "#d7e1ea",
  primary: "#0f766e",
  primaryTextOn: "#f8fffe",
  accent: "#0e7490",
  accentTextOn: "#f3fcff",
  success: "#16a34a",
  successTextOn: "#f0fdf4",
  warning: "#d97706",
  warningTextOn: "#fff7ed",
  danger: "#b91c1c",
  dangerTextOn: "#fef2f2",
  focusRing: "#0ea5e9",
  overlay: "rgba(15, 23, 42, 0.45)",
};

const darkColors: ColorTokens = {
  background: "#0c1422",
  surface: "#132033",
  surfaceElevated: "#1a2a3f",
  text: "#edf4ff",
  textMuted: "#b8c8dc",
  border: "#36506d",
  primary: "#14b8a6",
  primaryTextOn: "#032624",
  accent: "#38bdf8",
  accentTextOn: "#072c42",
  success: "#22c55e",
  successTextOn: "#0a341d",
  warning: "#f59e0b",
  warningTextOn: "#402609",
  danger: "#ef4444",
  dangerTextOn: "#481112",
  focusRing: "#38bdf8",
  overlay: "rgba(2, 6, 23, 0.62)",
};

function createElevationTokens(scheme: "light" | "dark", isWeb: boolean): ElevationTokens {
  const shadowColor =
    scheme === "dark" ? "rgba(2, 6, 23, 0.58)" : "rgba(15, 23, 42, 0.18)";

  const smShadow = `0px 1px 3px ${shadowColor}`;
  const mdShadow = `0px 3px 8px ${shadowColor}`;
  const cardShadow = `0px 2px 6px ${shadowColor}`;

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
  return buildTokens(colorScheme === "dark" ? "dark" : "light");
}

export function useTokens(): ThemeTokens {
  const colorScheme = useColorScheme();
  return useMemo(() => getTokens(colorScheme), [colorScheme]);
}
