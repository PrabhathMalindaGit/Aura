import React from "react";
import { describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

vi.mock("@/src/theme/tokens", () => ({
  useTokens: () => ({
    spacing: { xs: 4, sm: 8 },
    colors: {
      textMuted: "#666666",
    },
    typography: {
      caption: { fontSize: 12, lineHeight: 16 },
    },
  }),
}));

vi.mock("@/src/components/StatusPill", () => ({
  StatusPill: ({ label }: { label: string }) => <>{label}</>,
}));

import { TrustCues } from "@/src/components/TrustCues";

function flattenText(node: TestRenderer.ReactTestInstance): string {
  if (!node.children) {
    return "";
  }
  return node.children
    .map((child: any) => (typeof child === "string" ? child : flattenText(child)))
    .join(" ");
}

describe("TrustCues", () => {
  it("shows saved-on-device hint for summary offline state", () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <TrustCues
          status={{ kind: "offline", pendingCount: 2, failedCount: 0 }}
          showSavedLocalHint
          showPending
          variant="default"
        />
      );
    });

    const text = flattenText(renderer!.root);

    expect(text).toContain("Saved on this device");
  });

  it("removes saved-local hints for online-only offline state", () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <TrustCues
          status={{ kind: "offline", pendingCount: 2, failedCount: 0 }}
          offlineMode="onlineOnly"
          showSavedLocalHint
          showPending
          variant="default"
        />
      );
    });

    const text = flattenText(renderer!.root);

    expect(text).toContain("Offline");
    expect(text).toContain("Sending is paused until you reconnect.");
    expect(text).not.toContain("Saved on this device");
    expect(text).not.toContain("Saved locally");
  });

  it("shows a stale last-synced cue when refresh data is old", () => {
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <TrustCues
          status={{ kind: "ok", pendingCount: 0, failedCount: 0 }}
          lastUpdatedLabel="3h ago"
          lastUpdatedAt={Date.now() - 3 * 60 * 60 * 1000}
          showLastUpdated
          variant="default"
        />
      );
    });

    const text = flattenText(renderer!.root);

    expect(text).toContain("Last synced 3h ago");
    expect(text).toContain("This information may be a little out of date.");
  });
});
