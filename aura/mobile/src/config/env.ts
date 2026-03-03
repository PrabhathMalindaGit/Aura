import { Platform } from "react-native";

const rawApiBase = process.env.EXPO_PUBLIC_API_BASE?.trim();

export const API_BASE = rawApiBase && rawApiBase.length > 0
  ? rawApiBase
  : "http://localhost:3000";

export const isProbablyLocalhost =
  API_BASE.includes("localhost") || API_BASE.includes("127.0.0.1");

let warnedNativeLocalhost = false;
if (
  __DEV__ &&
  Platform.OS !== "web" &&
  isProbablyLocalhost &&
  !warnedNativeLocalhost
) {
  warnedNativeLocalhost = true;
  console.warn(
    "[Aura] API_BASE is localhost on native. Run npm run env:device before dev:device."
  );
}
