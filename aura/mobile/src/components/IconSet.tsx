import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useMemo, type ComponentProps } from "react";
import type { StyleProp, TextStyle } from "react-native";

import { useTokens } from "@/src/theme/tokens";

export type DomainIconKey =
  | "home"
  | "tasks"
  | "checkin"
  | "chat"
  | "progress"
  | "weekly"
  | "appointments"
  | "insights"
  | "exercise"
  | "sleep"
  | "hydration"
  | "nutrition"
  | "meds"
  | "wearables"
  | "photos"
  | "proms"
  | "rehabJourney"
  | "caregiver"
  | "safety"
  | "coping"
  | "settings"
  | "login"
  | "info"
  | "warning"
  | "success";

export const DOMAIN_ICON_KEYS: DomainIconKey[] = [
  "home",
  "tasks",
  "checkin",
  "chat",
  "progress",
  "weekly",
  "appointments",
  "insights",
  "exercise",
  "sleep",
  "hydration",
  "nutrition",
  "meds",
  "wearables",
  "photos",
  "proms",
  "rehabJourney",
  "caregiver",
  "safety",
  "coping",
  "settings",
  "login",
  "info",
  "warning",
  "success",
];

type MaterialIconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

const ICON_MAP: Record<DomainIconKey, MaterialIconName> = {
  home: "home-variant-outline",
  tasks: "clipboard-text-outline",
  checkin: "clipboard-check-outline",
  chat: "message-text-outline",
  progress: "chart-line",
  weekly: "calendar-week",
  appointments: "calendar-clock",
  insights: "lightbulb-on-outline",
  exercise: "dumbbell",
  sleep: "power-sleep",
  hydration: "cup-water",
  nutrition: "food-apple-outline",
  meds: "pill",
  wearables: "watch-variant",
  photos: "camera-outline",
  proms: "file-document-edit-outline",
  rehabJourney: "map-marker-path",
  caregiver: "account-heart-outline",
  safety: "shield-check-outline",
  coping: "meditation",
  settings: "cog-outline",
  login: "account-arrow-right-outline",
  info: "information-outline",
  warning: "alert-circle-outline",
  success: "check-circle-outline",
};

export function getDomainIconName(key: DomainIconKey): MaterialIconName {
  return ICON_MAP[key] ?? "help-circle-outline";
}

export type DomainIconTone =
  | "muted"
  | "text"
  | "primary"
  | "accent"
  | "success"
  | "warning"
  | "danger";

type DomainIconProps = {
  icon: DomainIconKey;
  size?: number;
  tone?: DomainIconTone;
  style?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  testID?: string;
};

export function DomainIcon({
  icon,
  size = 18,
  tone = "muted",
  style,
  accessibilityLabel,
  testID,
}: DomainIconProps) {
  const tokens = useTokens();

  const color = useMemo(() => {
    if (tone === "text") {
      return tokens.colors.text;
    }
    if (tone === "primary") {
      return tokens.colors.primary;
    }
    if (tone === "accent") {
      return tokens.colors.accent;
    }
    if (tone === "success") {
      return tokens.colors.success;
    }
    if (tone === "warning") {
      return tokens.colors.warning;
    }
    if (tone === "danger") {
      return tokens.colors.danger;
    }
    return tokens.colors.textMuted;
  }, [tone, tokens.colors.accent, tokens.colors.danger, tokens.colors.primary, tokens.colors.success, tokens.colors.text, tokens.colors.textMuted, tokens.colors.warning]);

  return (
    <MaterialCommunityIcons
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? `${icon} icon`}
      name={getDomainIconName(icon)}
      size={size}
      color={color}
      style={style}
    />
  );
}
