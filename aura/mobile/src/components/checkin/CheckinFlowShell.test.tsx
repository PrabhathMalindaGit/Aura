import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockTokens = {
  spacing: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxxl: 40,
  },
  radius: {
    xl: 24,
  },
  colors: {
    text: "#183042",
    textMuted: "#5e7182",
    border: "#d7e0e7",
  },
  typography: {
    section: {
      fontSize: 21,
      lineHeight: 28,
    },
    body: {
      fontSize: 16,
      lineHeight: 24,
    },
    weights: {
      semibold: "600",
    },
  },
};

vi.mock("react-native", () => ({
  StyleSheet: {
    create: <T extends Record<string, unknown>>(styles: T) => styles,
  },
  ScrollView: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-scroll-view", props, children),
  Text: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-text", props, children),
  View: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-view", props, children),
}));

vi.mock("@/src/theme/tokens", () => ({
  useTokens: () => mockTokens,
}));

vi.mock("@/src/components/GlassPanel", () => ({
  GlassPanel: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-glass-panel", props, children),
}));

vi.mock("@/src/components/HeroHeader", () => ({
  HeroHeader: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-hero-header", props, children),
}));

vi.mock("@/src/components/checkin/CheckinStepNavigator", () => ({
  CheckinStepNavigator: (props: Record<string, unknown>) =>
    React.createElement("mock-checkin-step-navigator", props),
}));

import { CheckinFlowShell } from "@/src/components/checkin/CheckinFlowShell";

describe("CheckinFlowShell", () => {
  let renderer: ReactTestRenderer | null = null;

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer?.unmount();
      });
    }
    renderer = null;
  });

  it("renders one persistent shell with the step header, stepper, helper area, and sticky footer", () => {
    act(() => {
      renderer = create(
        <CheckinFlowShell
          title="Daily check-in"
          subtitle="Step 2 of 4"
          currentStepTitle="Recovery"
          currentStepDescription="Exercises, strain and medication"
          helperContent={React.createElement("mock-helper", {}, "Helper")}
          steps={[
            { key: "symptoms", label: "Symptoms", icon: "checkin" },
            { key: "recovery", label: "Recovery", icon: "exercise" },
            { key: "support", label: "Support", icon: "coping" },
            { key: "review", label: "Review", icon: "success" },
          ]}
          activeStep={1}
          onSelectStep={() => undefined}
          footer={React.createElement("mock-footer", {}, "Footer")}
        >
          {React.createElement("mock-step-card", {}, "Step content")}
        </CheckinFlowShell>,
      );
    });

    const root = renderer!.root;
    const heroHeaders = root.findAll(
      (node) =>
        typeof node.type === "string" &&
        (node.type as string) === "mock-hero-header",
    );
    const navigators = root.findAll(
      (node) =>
        typeof node.type === "string" &&
        (node.type as string) === "mock-checkin-step-navigator",
    );
    const glassPanels = root.findAll(
      (node) =>
        typeof node.type === "string" &&
        (node.type as string) === "mock-glass-panel",
    );

    expect(heroHeaders).toHaveLength(1);
    expect(navigators).toHaveLength(1);
    expect(glassPanels).toHaveLength(1);

    const navigator = navigators[0]!;
    expect(navigator.props.activeStep).toBe(1);
    expect(navigator.props.steps.map((entry: { label: string }) => entry.label)).toEqual([
      "Symptoms",
      "Recovery",
      "Support",
      "Review",
    ]);

    const textContent = root
      .findAll(
        (node) =>
          typeof node.type === "string" && (node.type as string) === "mock-text",
      )
      .map((node) => node.children.join(""));

    expect(textContent).toContain("Recovery");
    expect(textContent).toContain("Exercises, strain and medication");
  });
});
