import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createCheckin,
  routerPush,
  routerReplace,
  scrollToMock,
  clearCheckinError,
  reloadCheckinError,
  getCheckinDraft,
  setCheckinDraft,
  clearCheckinDraft,
} = vi.hoisted(() => ({
  createCheckin: vi.fn(),
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
  scrollToMock: vi.fn(),
  clearCheckinError: vi.fn(async () => undefined),
  reloadCheckinError: vi.fn(async () => undefined),
  getCheckinDraft: vi.fn(async () => null),
  setCheckinDraft: vi.fn(async () => undefined),
  clearCheckinDraft: vi.fn(async () => undefined),
}));

vi.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => React.createElement("mock-redirect", { href }),
  useLocalSearchParams: () => ({}),
  useRouter: () => ({
    push: routerPush,
    replace: routerReplace,
  }),
}));

vi.mock("react-native", async () => {
  const ReactModule = await import("react");

  const ScrollView = ReactModule.forwardRef(
    (
      {
        children,
        ...props
      }: {
        children?: React.ReactNode;
        [key: string]: unknown;
      },
      ref: React.ForwardedRef<{ scrollTo: typeof scrollToMock }>,
    ) => {
      if (typeof ref === "function") {
        ref({ scrollTo: scrollToMock });
      } else if (ref) {
        ref.current = { scrollTo: scrollToMock };
      }

      return ReactModule.createElement("mock-scroll-view", props, children);
    },
  );

  return {
    ActivityIndicator: (props: Record<string, unknown>) =>
      ReactModule.createElement("mock-activity-indicator", props),
    Platform: { OS: "web" },
    Pressable: ({
      children,
      onLayout,
      ...props
    }: {
      children?: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
      onLayout?: (event: { nativeEvent: { layout: { y: number } } }) => void;
      [key: string]: unknown;
    }) => {
      onLayout?.({ nativeEvent: { layout: { y: 180 } } });
      return ReactModule.createElement(
        "mock-pressable",
        props,
        typeof children === "function" ? children({ pressed: false }) : children,
      );
    },
    ScrollView,
    StyleSheet: {
      create: <T extends Record<string, unknown>>(styles: T) => styles,
    },
    Text: ({
      children,
      ...props
    }: {
      children?: React.ReactNode;
      [key: string]: unknown;
    }) => ReactModule.createElement("mock-text", props, children),
    TextInput: (props: Record<string, unknown>) => ReactModule.createElement("mock-text-input", props),
    View: ({
      children,
      onLayout,
      ...props
    }: {
      children?: React.ReactNode;
      onLayout?: (event: { nativeEvent: { layout: { y: number } } }) => void;
      [key: string]: unknown;
    }) => {
      onLayout?.({ nativeEvent: { layout: { y: 180 } } });
      return ReactModule.createElement("mock-view", props, children);
    },
  };
});

vi.mock("@/src/components/Avatar", () => ({
  Avatar: (props: Record<string, unknown>) => React.createElement("mock-avatar", props),
}));

vi.mock("@/src/components/Banner", () => ({
  Banner: (props: Record<string, unknown>) => React.createElement("mock-banner", props),
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

vi.mock("@/src/components/HeroHeader", () => ({
  HeroHeader: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-hero-header", props, children),
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

vi.mock("@/src/components/PrimaryButton", () => ({
  PrimaryButton: (props: Record<string, unknown>) =>
    React.createElement("mock-primary-button", props),
}));

vi.mock("@/src/components/Screen", () => ({
  Screen: ({
    children,
    banner,
    ...props
  }: {
    children?: React.ReactNode;
    banner?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-screen", props, banner, children),
}));

vi.mock("@/src/components/SecondaryButton", () => ({
  SecondaryButton: (props: Record<string, unknown>) =>
    React.createElement("mock-secondary-button", props),
}));

vi.mock("@/src/components/SegmentedControl", () => ({
  SegmentedControl: (props: Record<string, unknown>) =>
    React.createElement("mock-segmented-control", props),
}));

vi.mock("@/src/components/Skeleton", () => ({
  SkeletonBlock: (props: Record<string, unknown>) => React.createElement("mock-skeleton-block", props),
}));

vi.mock("@/src/components/StatusPill", () => ({
  StatusPill: (props: Record<string, unknown>) => React.createElement("mock-status-pill", props),
}));

vi.mock("@/src/components/TrustBanner", () => ({
  TrustBanner: (props: Record<string, unknown>) => React.createElement("mock-trust-banner", props),
}));

vi.mock("@/src/components/TrustCues", () => ({
  TrustCues: (props: Record<string, unknown>) => React.createElement("mock-trust-cues", props),
}));

vi.mock("@/src/components/checkin/BodyMapSelector", () => ({
  BodyMapSelector: (props: Record<string, unknown>) =>
    React.createElement("mock-body-map-selector", props),
}));

vi.mock("@/src/components/checkin/CheckinConfirmationPanel", () => ({
  CheckinConfirmationPanel: (props: Record<string, unknown>) =>
    React.createElement("mock-checkin-confirmation-panel", props),
}));

vi.mock("@/src/components/checkin/CheckinReviewCard", () => ({
  CheckinReviewCard: (props: Record<string, unknown>) =>
    React.createElement("mock-checkin-review-card", props),
}));

vi.mock("@/src/components/checkin/CheckinStepCard", () => ({
  CheckinStepCard: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-checkin-step-card", props, children),
}));

vi.mock("@/src/components/checkin/CheckinStepNavigator", () => ({
  CheckinStepNavigator: (props: Record<string, unknown>) =>
    React.createElement("mock-checkin-step-navigator", props),
}));

vi.mock("@/src/components/checkin/CheckinSubmissionRecoveryCard", () => ({
  CheckinSubmissionRecoveryCard: (props: Record<string, unknown>) =>
    React.createElement("mock-checkin-submission-recovery", props),
}));

vi.mock("@/src/components/checkin/NeedHelpPrompt", () => ({
  NeedHelpPrompt: (props: Record<string, unknown>) =>
    React.createElement("mock-need-help-prompt", props),
}));

vi.mock("@/src/components/checkin/SymptomChipGroup", () => ({
  SymptomChipGroup: (props: Record<string, unknown>) =>
    React.createElement("mock-symptom-chip-group", props),
}));

vi.mock("@/src/api/patient", () => ({
  createCheckin,
}));

vi.mock("@/src/dev/renderAudit", () => ({
  isPatientDebugUIEnabled: () => false,
  useDevRenderAudit: () => undefined,
}));

vi.mock("@/src/state/auth", () => ({
  useAuth: () => ({
    status: "signedIn",
    token: "token-1",
    patient: {
      id: "patient-1",
      displayName: "Patient One",
    },
  }),
}));

vi.mock("@/src/state/checkinDraft", () => ({
  getCheckinDraft,
  setCheckinDraft,
  clearCheckinDraft,
}));

vi.mock("@/src/state/lastError", () => ({
  useLastError: () => ({
    label: "Never",
    lastError: null,
    clear: clearCheckinError,
    reload: reloadCheckinError,
    setLocalError: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/src/state/network", () => ({
  useIsOffline: () => false,
}));

vi.mock("@/src/state/refresh", () => ({
  useLastRefreshed: () => ({
    label: "Never",
    lastRefreshedAt: 0,
    refreshLocal: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/src/state/trustStatus", () => ({
  useTrustStatus: () => ({ kind: "ok" }),
}));

vi.mock("@/src/theme/tokens", () => ({
  useTokens: () => ({
    colors: {
      primary: "#2F6FED",
      text: "#183042",
      textMuted: "#5E7182",
      border: "#d7e0e7",
      surface: "#ffffff",
      success: "#2F8F83",
      warning: "#C9892B",
      danger: "#C94A3B",
    },
    spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxxl: 40 },
    radius: { sm: 10, md: 14, lg: 18, xl: 24 },
    typography: {
      title: { fontSize: 28, lineHeight: 34 },
      section: { fontSize: 20, lineHeight: 28 },
      body: { fontSize: 16, lineHeight: 24 },
      caption: { fontSize: 12, lineHeight: 16 },
      weights: { medium: "500", semibold: "600" },
    },
  }),
}));

import CheckinScreen from "@/app/(tabs)/checkin";

function findByA11y(root: ReactTestRenderer["root"], label: string) {
  const match = root.findAll(
    (node) =>
      typeof node.props?.accessibilityLabel === "string" &&
      node.props.accessibilityLabel === label,
  )[0];

  if (!match) {
    throw new Error(`Could not find accessibility label: ${label}`);
  }

  return match;
}

describe("Check-in screen validation", () => {
  let renderer: ReactTestRenderer | null = null;

  beforeEach(() => {
    vi.useFakeTimers();
    scrollToMock.mockReset();
    createCheckin.mockReset();
    clearCheckinError.mockReset();
    reloadCheckinError.mockReset();
    getCheckinDraft.mockReset();
    getCheckinDraft.mockResolvedValue(null);
    setCheckinDraft.mockReset();
    clearCheckinDraft.mockReset();
  });

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer?.unmount();
      });
    }
    renderer = null;
    vi.useRealTimers();
  });

  it("moves to the invalid step, shows inline validation, and scrolls to the first invalid field", async () => {
    await act(async () => {
      renderer = create(<CheckinScreen />);
    });

    const navigator = renderer!.root.find(
      (node) => String(node.type) === "mock-checkin-step-navigator",
    );
    act(() => {
      navigator.props.onSelectStep(3);
    });

    const submitButton = renderer!.root
      .findAll((node) => String(node.type) === "mock-primary-button")
      .find((node) => node.props.label === "Submit check-in");

    expect(submitButton?.props.disabled).toBe(false);

    await act(async () => {
      submitButton?.props.onPress();
      vi.runAllTimers();
    });

    const updatedNavigator = renderer!.root.find(
      (node) => String(node.type) === "mock-checkin-step-navigator",
    );
    expect(updatedNavigator.props.activeStep).toBe(2);

    const text = renderer!.root
      .findAll((node) => String(node.type) === "mock-text")
      .map((node) => node.children.join(" "));

    expect(text).toContain("Choose the number that best matches your mood today.");
    expect(scrollToMock).toHaveBeenCalled();
  });

  it("keeps recovery focused on two primary inputs until optional detail is expanded", async () => {
    await act(async () => {
      renderer = create(<CheckinScreen />);
      await Promise.resolve();
    });

    const navigator = renderer!.root.find(
      (node) => String(node.type) === "mock-checkin-step-navigator",
    );
    act(() => {
      navigator.props.onSelectStep(1);
    });

    const initialText = renderer!.root
      .findAll((node) => String(node.type) === "mock-text")
      .map((node) => node.children.join(" "));

    expect(initialText).toContain("Exercise completion");
    expect(initialText).toContain("How rehab felt");
    expect(initialText).not.toContain("Confidence in progress");
    expect(initialText).not.toContain("Movement and function");

    act(() => {
      findByA11y(renderer!.root, "Show optional recovery details").props.onPress();
    });

    const expandedText = renderer!.root
      .findAll((node) => String(node.type) === "mock-text")
      .map((node) => node.children.join(" "));

    expect(expandedText).toContain("Confidence in progress");
    expect(expandedText).toContain("Movement and function");
    expect(expandedText).toContain("Medication");
  });

  it("autosaves a same-day draft and clears it after a successful low-risk submit", async () => {
    createCheckin.mockResolvedValue({
      ok: true,
      risk: { level: "low", reasonCodes: [] },
    });

    await act(async () => {
      renderer = create(<CheckinScreen />);
      await Promise.resolve();
    });

    const navigator = renderer!.root.find(
      (node) => String(node.type) === "mock-checkin-step-navigator",
    );

    act(() => {
      navigator.props.onSelectStep(2);
    });

    act(() => {
      findByA11y(renderer!.root, "Set value 4").props.onPress();
    });

    await act(async () => {
      vi.runAllTimers();
      await Promise.resolve();
    });

    expect(setCheckinDraft).toHaveBeenCalled();

    act(() => {
      navigator.props.onSelectStep(3);
    });

    const submitButton = renderer!.root
      .findAll((node) => String(node.type) === "mock-primary-button")
      .find((node) => node.props.label === "Submit check-in");

    await act(async () => {
      submitButton?.props.onPress();
      await Promise.resolve();
    });

    expect(createCheckin).toHaveBeenCalled();
    expect(clearCheckinDraft).toHaveBeenCalledWith("patient-1", "2026-04-11");

    const confirmation = renderer!.root.findAll(
      (node) => String(node.type) === "mock-checkin-confirmation-panel",
    )[0];
    expect(confirmation).toBeTruthy();
  });

  it("routes high-risk submissions to Safety without showing a success confirmation", async () => {
    createCheckin.mockResolvedValue({
      ok: true,
      risk: { level: "high", reasonCodes: ["URGENT_HELP"] },
      alertId: "alert-1",
    });

    await act(async () => {
      renderer = create(<CheckinScreen />);
      await Promise.resolve();
    });

    const navigator = renderer!.root.find(
      (node) => String(node.type) === "mock-checkin-step-navigator",
    );

    act(() => {
      navigator.props.onSelectStep(2);
    });
    act(() => {
      findByA11y(renderer!.root, "Set value 4").props.onPress();
    });
    act(() => {
      navigator.props.onSelectStep(3);
    });

    const submitButton = renderer!.root
      .findAll((node) => String(node.type) === "mock-primary-button")
      .find((node) => node.props.label === "Submit check-in");

    await act(async () => {
      submitButton?.props.onPress();
      await Promise.resolve();
    });

    expect(routerPush).toHaveBeenCalledWith({
      pathname: "/safety",
      params: {
        alertId: "alert-1",
        reasonCodes: "URGENT_HELP",
      },
    });
    expect(
      renderer!.root.findAll(
        (node) => String(node.type) === "mock-checkin-confirmation-panel",
      ),
    ).toHaveLength(0);
    expect(clearCheckinDraft).not.toHaveBeenCalled();
  });
});
