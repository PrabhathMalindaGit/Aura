import { useMemo } from "react";
import { useColorScheme, type ColorSchemeName, type TextStyle, type ViewStyle } from "react-native";

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
};

export type LayoutTokens = {
  screenPaddingHorizontal: number;
  screenPaddingVertical: number;
  contentMaxWidth: number;
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
  contentMaxWidth: 460,
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
  background: "#0b1220",
  surface: "#111a2a",
  surfaceElevated: "#172134",
  text: "#e7eef8",
  textMuted: "#a9bacf",
  border: "#2b3b53",
  primary: "#14b8a6",
  primaryTextOn: "#04211f",
  accent: "#38bdf8",
  accentTextOn: "#042436",
  success: "#22c55e",
  successTextOn: "#052e16",
  warning: "#f59e0b",
  warningTextOn: "#351a02",
  danger: "#ef4444",
  dangerTextOn: "#3b0a0a",
  focusRing: "#38bdf8",
  overlay: "rgba(2, 6, 23, 0.62)",
};

const lightElevation: ElevationTokens = {
  none: {},
  sm: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
};

const darkElevation: ElevationTokens = {
  none: {},
  sm: {
    shadowColor: "#020617",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.45,
    shadowRadius: 3,
    elevation: 1,
  },
  md: {
    shadowColor: "#020617",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.55,
    shadowRadius: 8,
    elevation: 3,
  },
};

function buildTokens(scheme: "light" | "dark"): ThemeTokens {
  return {
    scheme,
    colors: scheme === "dark" ? darkColors : lightColors,
    typography,
    spacing,
    radius,
    elevation: scheme === "dark" ? darkElevation : lightElevation,
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
