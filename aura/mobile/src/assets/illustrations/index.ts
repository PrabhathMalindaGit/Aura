import type { ImageSourcePropType } from "react-native";

export const Illustrations = {
  today: require("./ill_today.png"),
  progress: require("./ill_progress_empty.png"),
  chat: require("./ill_chat_empty.png"),
  weekly: require("./ill_weekly_report.png"),
  offline: require("./ill_offline.png"),
  safety: require("./ill_safety.png"),
  checkinSuccess: require("./ill_checkin_success.png"),
  syncing: require("./ill_syncing.png"),
} as const;

export type IllustrationKey = keyof typeof Illustrations;

export function getIllustration(key: IllustrationKey): ImageSourcePropType {
  return Illustrations[key];
}

