import React from "react";
import { describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

vi.mock("@/src/theme/tokens", () => ({
  useTokens: () => ({
    radius: { md: 12, sm: 8 },
    spacing: { md: 16, sm: 8, xs: 4 },
    typography: {
      body: { fontSize: 16, lineHeight: 22 },
      caption: { fontSize: 12, lineHeight: 16 },
      weights: { semibold: "600" },
    },
    colors: {
      text: "#111111",
      textMuted: "#666666",
      accent: "#0b74de",
      surface: "#ffffff",
      surfaceElevated: "#f6f6f6",
      border: "#d8d8d8",
      warningTextOn: "#fff4d6",
      warning: "#b7791f",
    },
  }),
}));

vi.mock("@/src/hooks/useReducedMotion", () => ({
  useReducedMotion: () => true,
}));

vi.mock("@/src/components/Motion", () => ({
  FadeSlideIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/src/components/StatusPill", () => ({
  StatusPill: ({ label }: { label: string }) => <>{label}</>,
}));

import { TrustBanner } from "@/src/components/TrustBanner";
import { TrustCues } from "@/src/components/TrustCues";

function flattenText(node: TestRenderer.ReactTestInstance): string {
  if (!node.children) {
    return "";
  }
  return node.children
    .map((child: any) => (typeof child === "string" ? child : flattenText(child)))
    .join(" ");
}

describe("online-only trust regression", () => {
  it("keeps chat and check-in style offline trust surfaces truthful", () => {
    let banner: TestRenderer.ReactTestRenderer;
    let cues: TestRenderer.ReactTestRenderer;
    act(() => {
      banner = TestRenderer.create(
        <TrustBanner
          status={{ kind: "offline", pendingCount: 3, failedCount: 0 }}
          offlineMode="onlineOnly"
        />
      );
      cues = TestRenderer.create(
        <TrustCues
          status={{ kind: "offline", pendingCount: 3, failedCount: 0 }}
          offlineMode="onlineOnly"
          showSavedLocalHint
          variant="default"
        />
      );
    });

    const text = `${flattenText(banner!.root)} ${flattenText(cues!.root)}`;

    expect(text).toContain("Sending is paused");
    expect(text).not.toContain("Saved on this device");
    expect(text).not.toContain("Saved locally");
  });
});
