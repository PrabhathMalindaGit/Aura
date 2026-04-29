import React from "react";
import { describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";

vi.mock("@/src/theme/tokens", () => ({
  useTokens: () => ({
    spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
    radius: { md: 12 },
    typography: {
      body: { fontSize: 16, lineHeight: 22 },
      caption: { fontSize: 12, lineHeight: 16 },
      section: { fontSize: 20, lineHeight: 28 },
      weights: { semibold: "600" },
    },
    colors: {
      surface: "#ffffff",
      surfaceSubtle: "#f8f6f2",
      border: "#d9d9d9",
      text: "#183042",
      textMuted: "#5e7182",
      success: "#2f8f83",
      successTextOn: "#edf8f6",
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

vi.mock("@/src/components/checkin/CheckinReviewCard", () => ({
  CheckinReviewCard: ({
    summary,
    notesPreview,
  }: {
    summary: string;
    notesPreview?: string;
  }) => React.createElement("mock-review-card", null, summary, notesPreview),
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

vi.mock("@/src/utils/date", () => ({
  formatPatientCardTimestamp: () => "Today at 11:02 AM",
  formatISOToHuman: () => "Apr 11, 2026",
}));

import { CheckinConfirmationPanel } from "@/src/components/checkin/CheckinConfirmationPanel";

function flattenText(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : flattenText(child)))
    .join(" ");
}

describe("CheckinConfirmationPanel", () => {
  it("renders a calm confirmation summary with patient-safe timestamps", () => {
    let renderer: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(
        <CheckinConfirmationPanel
          submittedAtISO="2026-04-11T11:02:00.000Z"
          summary="Pain 3/10 today. Exercises 80% complete."
          chips={[
            { id: "pain", label: "Pain 3/10", tone: "warning" },
            { id: "exercise", label: "Exercises 80%", tone: "success" },
          ]}
          notesPreview="Knee felt steadier after stretching."
          onBackToToday={() => undefined}
          onViewProgress={() => undefined}
        />
      );
    });

    const text = flattenText(renderer!.root);
    const buttons = renderer!.root.findAll((node) =>
      ["mock-primary-button", "mock-secondary-button"].includes(String(node.type)),
    );

    expect(text).toContain("Check-in submitted");
    expect(text).toContain("Today at 11:02 AM");
    expect(text).toContain("Apr 11, 2026");
    expect(text).toContain("What was recorded");
    expect(text).toContain("Pain 3/10 today. Exercises 80% complete.");
    expect(text).toContain("Knee felt steadier after stretching.");
    expect(buttons.map((node) => node.props.label)).toEqual(["Back to Today", "View Progress"]);
  });
});
