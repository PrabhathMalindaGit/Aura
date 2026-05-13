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

vi.mock("expo-image", () => ({
  Image: (props: Record<string, unknown>) => React.createElement("mock-image", props),
}));

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

  function renderSelector(
    props: Partial<React.ComponentProps<typeof BodyMapSelector>> = {},
  ) {
    const onToggleRegion = props.onToggleRegion ?? vi.fn();
    const onSetPrimaryRegion = props.onSetPrimaryRegion ?? vi.fn();

    act(() => {
      renderer = create(
        <BodyMapSelector
          value={props.value ?? baseValue}
          onToggleRegion={onToggleRegion}
          onSetPrimaryRegion={onSetPrimaryRegion}
        />,
      );
    });

    return {
      onSetPrimaryRegion,
      onToggleRegion,
      renderer: renderer!,
    };
  }

  it("renders the front body map by default", () => {
    const { renderer } = renderSelector();

    expect(renderer.root.findByProps({ testID: "body-map-image-front" })).toBeTruthy();
  });

  it("switches to the back body map and back to the front body map", () => {
    const { renderer } = renderSelector();
    const segmentedControl = renderer.root.findByProps({ accessibilityLabel: "Body map view" });

    act(() => {
      segmentedControl.props.onChange("back");
    });

    expect(renderer.root.findByProps({ testID: "body-map-image-back" })).toBeTruthy();

    act(() => {
      segmentedControl.props.onChange("front");
    });

    expect(renderer.root.findByProps({ testID: "body-map-image-front" })).toBeTruthy();
  });

  it("selecting a body region can update selected state", () => {
    const onToggleRegion = vi.fn();
    const { renderer } = renderSelector({
      value: {
        selectedRegions: [],
        primaryRegion: null,
        selections: {},
      },
      onToggleRegion,
    });

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Select Neck area" }).props.onPress();
    });

    expect(onToggleRegion).toHaveBeenCalledWith("neck");

    act(() => {
      renderer.update(
        <BodyMapSelector
          value={baseValue}
          onToggleRegion={onToggleRegion}
          onSetPrimaryRegion={() => undefined}
        />,
      );
    });

    expect(
      renderer.root.findByProps({
        accessibilityLabel: "Deselect Neck area, primary pain area",
      }).props.accessibilityState,
    ).toEqual({ selected: true });
  });

  it("exposes accessible labels for tappable body-region hotspots", () => {
    const { renderer } = renderSelector({
      value: {
        selectedRegions: [],
        primaryRegion: null,
        selections: {},
      },
    });

    expect(renderer.root.findByProps({ accessibilityLabel: "Select Left shoulder area" })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: "Select Right knee area" })).toBeTruthy();
  });

  it("keeps small visual hotspots but expands their touch area to at least 44 points", () => {
    const { renderer } = renderSelector();

    const neck = renderer!.root.findByProps({
      accessibilityLabel: "Deselect Neck area, primary pain area",
    });

    expect(neck.props.accessibilityState).toEqual({ selected: true });
    expect(neck.props.accessibilityHint).toBe(
      "Toggles this body area. Selected areas can be marked as the most bothersome area below.",
    );
    expect(neck.props.hitSlop).toEqual({ top: 9, bottom: 9, left: 5, right: 5 });
  });

  it("announces selected-region chips with selected state and primary context", () => {
    const { renderer } = renderSelector();

    const selectedChip = renderer!.root.findByProps({
      accessibilityLabel: "Neck is the most bothersome selected area",
    });

    expect(selectedChip.props.accessibilityState).toEqual({ selected: true });
  });
});
