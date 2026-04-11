import React from "react";
import { describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

vi.mock("@/src/theme/tokens", () => ({
  useTokens: () => ({
    spacing: { sm: 8, md: 12, xl: 24 },
    radius: { md: 12 },
    typography: {
      body: { fontSize: 16, lineHeight: 22 },
      caption: { fontSize: 12, lineHeight: 16 },
      weights: { semibold: "600" },
    },
    colors: {
      surface: "#ffffff",
      warning: "#c9892b",
      warningTextOn: "#fbf3e4",
      text: "#183042",
      textMuted: "#5e7182",
    },
  }),
}));

vi.mock("@/src/components/Card", () => ({
  Card: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-card", props, children),
}));

vi.mock("@/src/components/IconSet", () => ({
  DomainIcon: (props: Record<string, unknown>) => React.createElement("mock-domain-icon", props),
}));

vi.mock("@/src/components/PrimaryButton", () => ({
  PrimaryButton: (props: Record<string, unknown>) =>
    React.createElement("mock-primary-button", props),
}));

vi.mock("@/src/components/SecondaryButton", () => ({
  SecondaryButton: (props: Record<string, unknown>) =>
    React.createElement("mock-secondary-button", props),
}));

vi.mock("@/src/components/StatusPill", () => ({
  StatusPill: ({ label }: { label: string }) => React.createElement("mock-status-pill", null, label),
}));

import { CheckinSubmissionRecoveryCard } from "@/src/components/checkin/CheckinSubmissionRecoveryCard";

function flattenText(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : flattenText(child)))
    .join(" ");
}

describe("CheckinSubmissionRecoveryCard", () => {
  it("renders one truthful recovery state with retry and continue-editing actions", () => {
    let renderer: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <CheckinSubmissionRecoveryCard
          title="We couldn’t submit your check-in"
          message="The service could not finish this submission right now."
          detail="Your answers are still on this screen. Try again when you’re ready."
          primaryActionLabel="Try again"
          onPrimaryAction={() => undefined}
          secondaryActionLabel="Continue editing"
          onSecondaryAction={() => undefined}
          statusLabel="Just now"
        />
      );
    });

    const text = flattenText(renderer!.root);
    const buttons = renderer!.root.findAll((node) =>
      ["mock-primary-button", "mock-secondary-button"].includes(String(node.type)),
    );

    expect(text).toContain("We couldn’t submit your check-in");
    expect(text).toContain("The service could not finish this submission right now.");
    expect(text).toContain("Your answers are still on this screen. Try again when you’re ready.");
    expect(text).toContain("Just now");
    expect(buttons.map((node) => node.props.label)).toEqual(["Try again", "Continue editing"]);
  });
});
