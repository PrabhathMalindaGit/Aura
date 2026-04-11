import { afterEach, describe, expect, it, vi } from "vitest";

const originalApiBase = process.env.EXPO_PUBLIC_API_BASE;

async function loadEnvModule({
  apiBase,
  browserHost,
  platform,
}: {
  apiBase?: string;
  browserHost?: string;
  platform: "web" | "ios" | "android";
}) {
  vi.resetModules();

  if (apiBase === undefined) {
    delete process.env.EXPO_PUBLIC_API_BASE;
  } else {
    process.env.EXPO_PUBLIC_API_BASE = apiBase;
  }

  vi.doMock("react-native", () => ({
    Platform: {
      OS: platform,
    },
  }));

  const globalScope = globalThis as {
    location?: { hostname?: string };
    window?: { location?: { hostname?: string } };
  };

  if (browserHost) {
    globalScope.location = { hostname: browserHost };
    globalScope.window = { location: { hostname: browserHost } };
  } else {
    delete globalScope.location;
    delete globalScope.window;
  }

  return import("./env");
}

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("react-native");

  const globalScope = globalThis as {
    location?: { hostname?: string };
    window?: { location?: { hostname?: string } };
  };
  delete globalScope.location;
  delete globalScope.window;

  if (originalApiBase === undefined) {
    delete process.env.EXPO_PUBLIC_API_BASE;
  } else {
    process.env.EXPO_PUBLIC_API_BASE = originalApiBase;
  }
});

describe("mobile API base resolution", () => {
  it("defaults to localhost when EXPO_PUBLIC_API_BASE is unset", async () => {
    const { API_BASE } = await loadEnvModule({
      platform: "web",
      browserHost: "localhost",
    });

    expect(API_BASE).toBe("http://localhost:3000");
  });

  it("keeps the configured LAN host on native", async () => {
    const { API_BASE } = await loadEnvModule({
      platform: "ios",
      apiBase: "http://192.168.8.100:3000",
    });

    expect(API_BASE).toBe("http://192.168.8.100:3000");
  });

  it("rewrites a stale device LAN host to localhost for localhost web", async () => {
    const { API_BASE } = await loadEnvModule({
      platform: "web",
      browserHost: "localhost",
      apiBase: "http://192.168.8.100:3000",
    });

    expect(API_BASE).toBe("http://localhost:3000");
  });

  it("keeps the configured LAN host when web itself is opened on that LAN host", async () => {
    const { API_BASE } = await loadEnvModule({
      platform: "web",
      browserHost: "192.168.8.100",
      apiBase: "http://192.168.8.100:3000",
    });

    expect(API_BASE).toBe("http://192.168.8.100:3000");
  });
});
