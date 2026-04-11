import { Platform } from "react-native";

const DEFAULT_API_BASE = "http://localhost:3000";
const rawApiBase = process.env.EXPO_PUBLIC_API_BASE?.trim();

type BrowserLocationLike = {
  hostname?: string;
};

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function isPrivateIpv4Host(hostname: string): boolean {
  const match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return false;
  }

  const [first, second] = match.slice(1, 3).map((value) => Number(value));

  if (first === 10 || first === 127) {
    return true;
  }

  if (first === 192 && second === 168) {
    return true;
  }

  return first === 172 && second >= 16 && second <= 31;
}

function getBrowserLocation(): BrowserLocationLike | null {
  if (typeof globalThis === "undefined") {
    return null;
  }

  const candidate = globalThis as {
    location?: BrowserLocationLike;
    window?: { location?: BrowserLocationLike };
  };

  return candidate.location ?? candidate.window?.location ?? null;
}

function normalizeUrl(url: URL): string {
  const normalized = url.toString();
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function resolveApiBase(): string {
  const configuredBase =
    rawApiBase && rawApiBase.length > 0 ? rawApiBase : DEFAULT_API_BASE;

  if (Platform.OS !== "web") {
    return configuredBase;
  }

  const browserLocation = getBrowserLocation();
  const browserHost = browserLocation?.hostname?.trim() ?? "";
  if (!isLoopbackHost(browserHost)) {
    return configuredBase;
  }

  try {
    const configuredUrl = new URL(configuredBase);
    if (
      isLoopbackHost(configuredUrl.hostname) ||
      !isPrivateIpv4Host(configuredUrl.hostname)
    ) {
      return configuredBase;
    }

    configuredUrl.hostname = browserHost;
    return normalizeUrl(configuredUrl);
  } catch {
    return configuredBase;
  }
}

export const API_BASE = resolveApiBase();

export const isProbablyLocalhost =
  API_BASE.includes("localhost") || API_BASE.includes("127.0.0.1");

let warnedNativeLocalhost = false;
let warnedWebLanOverride = false;
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

if (
  __DEV__ &&
  Platform.OS === "web" &&
  rawApiBase &&
  rawApiBase.length > 0 &&
  rawApiBase !== API_BASE &&
  !warnedWebLanOverride
) {
  warnedWebLanOverride = true;
  console.warn(
    `[Aura] Using ${API_BASE} for web because EXPO_PUBLIC_API_BASE=${rawApiBase} points to a device/LAN host. Run npm run env:web for localhost web.`
  );
}
