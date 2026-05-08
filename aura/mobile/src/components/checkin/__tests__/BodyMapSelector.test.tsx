import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockTokens = {
  colors: {
    border: "#d7e0e7",
    primary: "#2f6fed",
    primarySoft: "#eef4ff",
    success: "#2f8f83",
    successSoft: "#eaf7f4",
    surface: "#ffffff",
    surfaceSubtle: "#fbf9f5",
    text: "#183042",
    textMuted: "#5e7182",
  },
  radius: { md: 14, xl: 24 },
  scheme: "light",
  spacing: { sm: 8, md: 12 },
  typography: {
    body: { fontSize: 16, lineHeight: 24 },
    caption: { fontSize: 13, lineHeight: 18 },
    weights: { medium: "500", semibold: "600" },
  },
};

vi.mock("react-native", () => ({
  Pressable: ({
    children,
    style,
    ...props
  }: {
    children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
    style?: unknown;
    [key: string]: unknown;
  }) =>
    React.createElement(
      "mock-pressable",
      {
        ...props,
        style: typeof style === "function" ? style({ pressed: false }) : style,
      },
      typeof children === "function" ? children({ pressed: false }) : children,
    ),
  StyleSheet: {
    create: <T extends Record<string, unknown>>(styles: T) => styles,
  },
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

vi.mock("@/src/components/SegmentedControl", () => ({
  SegmentedControl: (props: Record<string, unknown>) =>
    React.createElement("mock-segmented-control", props),
}));

vi.mock("@/src/components/StatusPill", () => ({
  StatusPill: (props: Record<string, unknown>) =>
    React.createElement("mock-status-pill", props),
}));

vi.mock("@/src/theme/tokens", () => ({
  useTokens: () => mockTokens,
}));

import { BodyMapSelector } from "@/src/components/checkin/BodyMapSelector";
import type { CheckinBodyMapDraft } from "@/src/types/checkin";

const baseValue: CheckinBodyMapDraft = {
  selectedRegions: ["neck"],
  primaryRegion: "neck",
  selections: {
    neck: {
      intensity: 5,
      type: "ache",
    },
  },
};

describe("BodyMapSelector accessibility", () => {
  let renderer: ReactTestRenderer | null = null;

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer?.unmount();
      });
    }
    renderer = null;
  });

  it("keeps small visual hotspots but expands their touch area to at least 44 points", () => {
    act(() => {
      renderer = create(
        <BodyMapSelector
          value={baseValue}
          onToggleRegion={() => undefined}
          onSetPrimaryRegion={() => undefined}
        />,
      );
    });

    const neck = renderer!.root.findByProps({
      accessibilityLabel: "Remove Neck, primary pain area",
    });

    expect(neck.props.accessibilityState).toEqual({ selected: true });
    expect(neck.props.accessibilityHint).toBe(
      "Toggles this body area. Selected areas can be marked as the most bothersome area below.",
    );
    expect(neck.props.hitSlop).toEqual({ top: 11, bottom: 11, left: 8, right: 8 });
  });

  it("announces selected-region chips with selected state and primary context", () => {
    act(() => {
      renderer = create(
        <BodyMapSelector
          value={baseValue}
          onToggleRegion={() => undefined}
          onSetPrimaryRegion={() => undefined}
        />,
      );
    });

    const selectedChip = renderer!.root.findByProps({
      accessibilityLabel: "Neck is the most bothersome selected area",
    });

    expect(selectedChip.props.accessibilityState).toEqual({ selected: true });
  });
});
