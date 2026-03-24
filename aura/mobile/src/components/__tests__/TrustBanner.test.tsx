import React from "react";
import { describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

vi.mock("@/src/theme/tokens", () => ({
  useTokens: () => ({
    radius: { md: 12, sm: 8 },
    spacing: { md: 16, sm: 8 },
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

import { TrustBanner } from "@/src/components/TrustBanner";

function flattenText(node: TestRenderer.ReactTestInstance): string {
  if (!node.children) {
    return "";
  }
  return node.children
    .map((child: any) => (typeof child === "string" ? child : flattenText(child)))
    .join(" ");
}

describe("TrustBanner", () => {
  it("shows saved-on-device offline copy for summary surfaces", () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <TrustBanner status={{ kind: "offline", pendingCount: 2, failedCount: 0 }} />
      );
    });

    const text = flattenText(renderer!.root);

    expect(text).toContain("Saved on this device");
    expect(text).not.toContain("Nothing was sent");
  });

  it("shows online-only offline copy without local-save wording", () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <TrustBanner
          status={{ kind: "offline", pendingCount: 4, failedCount: 0 }}
          offlineMode="onlineOnly"
        />
      );
    });

    const text = flattenText(renderer!.root);

    expect(text).toContain("Nothing was sent");
    expect(text).not.toContain("Saved on this device");
    expect(text).not.toContain("Saving on your device");
  });
});
