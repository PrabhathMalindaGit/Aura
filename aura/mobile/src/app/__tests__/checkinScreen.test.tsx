import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createCheckin,
  getCheckinAdaptation,
  routerPush,
  routerReplace,
  scrollToMock,
  clearCheckinError,
  reloadCheckinError,
  getCheckinDraft,
  setCheckinDraft,
  clearCheckinDraft,
  getCachedRecoverySupport,
  setCachedRecoverySupport,
  canPatientUseCheckin,
  getCareModeNotice,
  voiceTranscript,
  networkState,
  routeParams,
  setCheckinLocalError,
} = vi.hoisted(() => ({
  createCheckin: vi.fn(),
  getCheckinAdaptation: vi.fn(async (): Promise<any> => null),
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
  scrollToMock: vi.fn(),
  clearCheckinError: vi.fn(async () => undefined),
  reloadCheckinError: vi.fn(async () => undefined),
  getCheckinDraft: vi.fn(async () => null),
  setCheckinDraft: vi.fn(async () => undefined),
  clearCheckinDraft: vi.fn(async () => undefined),
  getCachedRecoverySupport: vi.fn(async () => null),
  setCachedRecoverySupport: vi.fn(async () => undefined),
  canPatientUseCheckin: vi.fn(() => true),
  getCareModeNotice: vi.fn((): any => null),
  voiceTranscript: { current: "dictated check-in note" },
  networkState: { offline: false },
  routeParams: {} as Record<string, string | string[] | undefined>,
  setCheckinLocalError: vi.fn(async () => undefined),
}));

vi.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => React.createElement("mock-redirect", { href }),
  useLocalSearchParams: () => routeParams,
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
    Switch: (props: Record<string, unknown>) => ReactModule.createElement("mock-switch", props),
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

vi.mock("@/src/components/EmptyState", () => ({
  EmptyState: (props: Record<string, unknown>) =>
    React.createElement("mock-empty-state", props),
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

vi.mock("@/src/components/VoiceDictationButton", () => ({
  VoiceDictationButton: (props: Record<string, unknown>) =>
    React.createElement("mock-voice-dictation-button", {
      ...props,
      accessibilityRole: "button",
      accessibilityLabel: "Start voice dictation",
      accessibilityHint: "Adds spoken words to this text field for review before sending.",
      accessibilityState: { disabled: Boolean(props.disabled), busy: undefined },
      onPress: () => {
        (props.onTranscript as (text: string) => void)?.(voiceTranscript.current);
      },
    }),
}));

vi.mock("@/src/components/ReadAloudButton", () => ({
  ReadAloudButton: (props: Record<string, unknown>) =>
    React.createElement("mock-read-aloud-button" as any, {
      ...props,
      accessibilityRole: "button",
      accessibilityLabel: props.label ?? "Read aloud",
      onPress: vi.fn(),
    } as any),
  normalizeReadAloudText: (parts: Array<string | null | undefined>) =>
    parts.filter(Boolean).join(". "),
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

vi.mock("@/src/components/checkin/VoiceGuidedCheckinPanel", () => ({
  VoiceGuidedCheckinPanel: (props: Record<string, unknown>) =>
    React.createElement("mock-voice-guided-checkin-panel", {
      ...props,
      accessibilityLabel: "Voice-guided check-in panel",
    }),
}));

vi.mock("@/src/api/patient", () => ({
  createCheckin,
  getCheckinAdaptation,
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
    setLocalError: setCheckinLocalError,
  }),
}));

vi.mock("@/src/state/network", () => ({
  useIsOffline: () => networkState.offline,
}));

vi.mock("@/src/state/refresh", () => ({
  useLastRefreshed: () => ({
    label: "Never",
    lastRefreshedAt: 0,
    refreshLocal: vi.fn(async () => undefined),
  }),
}));

vi.mock("@/src/state/recoverySupport", () => ({
  canPatientUseCheckin,
  getCachedRecoverySupport,
  getCareModeNotice,
  setCachedRecoverySupport,
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

vi.mock("@/src/utils/date", () => ({
  todayISO: vi.fn(() => "2026-04-11"),
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
    getCheckinAdaptation.mockReset();
    getCheckinAdaptation.mockResolvedValue(null);
    getCachedRecoverySupport.mockReset();
    getCachedRecoverySupport.mockResolvedValue(null);
    setCachedRecoverySupport.mockReset();
    canPatientUseCheckin.mockReset();
    canPatientUseCheckin.mockReturnValue(true);
    getCareModeNotice.mockReset();
    getCareModeNotice.mockReturnValue(null);
    voiceTranscript.current = "dictated check-in note";
    networkState.offline = false;
    for (const key of Object.keys(routeParams)) {
      delete routeParams[key];
    }
    setCheckinLocalError.mockClear();
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

  it("shows a calm shortened-check-in cue when adaptation is enabled for the day", async () => {
    getCheckinAdaptation.mockResolvedValue({
      patientId: "patient-1",
      date: "2026-04-11",
      mode: "shortened",
      decisionSource: "adaptive_shortened",
      reasonCodes: ["stable_recent_recovery"],
      reasonDetails: [
        {
          code: "RECOVERY_STABLE",
          label: "Pain, mood, and adherence stayed stable across recent check-ins.",
          category: "stability",
        },
      ],
      clinicianSummary: "Shortened prompts are active because recent recovery has stayed stable.",
      explanation:
        "Today’s check-in starts with the most important questions. You can add more detail anytime.",
      configVersion: 2,
      thresholdVersion: 1,
      generatedAt: "2026-04-11T07:00:00.000Z",
      optionalSections: {
        recovery: true,
        support: true,
        dailyContext: true,
      },
    });

    await act(async () => {
      renderer = create(<CheckinScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const statusPills = renderer!.root.findAll(
      (node) => String(node.type) === "mock-status-pill",
    );
    const text = renderer!.root
      .findAll((node) => String(node.type) === "mock-text")
      .map((node) => node.children.join(" "));

    expect(statusPills.map((node) => node.props.label)).toContain("Shorter today");
    expect(text).toContain(
      "Today’s check-in starts with the most important questions. You can add more detail anytime.",
    );

    const addMoreDetailButton = renderer!.root.findAll(
      (node) =>
        String(node.type) === "mock-secondary-button" &&
        node.props.label === "Add more detail",
    )[0];

    expect(addMoreDetailButton).toBeDefined();

    await act(async () => {
      addMoreDetailButton.props.onPress();
    });

    const navigator = renderer!.root.find(
      (node) => String(node.type) === "mock-checkin-step-navigator",
    );
    act(() => {
      navigator.props.onSelectStep(1);
    });

    const expandedText = renderer!.root
      .findAll((node) => String(node.type) === "mock-text")
      .map((node) => node.children.join(" "));

    expect(expandedText).toContain("Confidence in progress");
  });

  it("shows the calm full-flow explanation during a cooldown-backed standard day", async () => {
    getCheckinAdaptation.mockResolvedValue({
      patientId: "patient-1",
      date: "2026-04-11",
      mode: "standard",
      decisionSource: "cooldown_standard",
      reasonCodes: ["EXERCISE_PLAN_UPDATED_RECENTLY"],
      reasonDetails: [
        {
          code: "EXERCISE_PLAN_UPDATED_RECENTLY",
          label: "Exercise plan was updated within the last 72 hours.",
          category: "cooldown",
        },
      ],
      clinicianSummary: "Full flow is active while recent safety or care changes settle.",
      explanation:
        "Today’s check-in includes the full set of questions while recent care updates settle.",
      configVersion: 2,
      thresholdVersion: 1,
      generatedAt: "2026-04-11T07:00:00.000Z",
      optionalSections: {
        recovery: true,
        support: true,
        dailyContext: true,
      },
    });

    await act(async () => {
      renderer = create(<CheckinScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const text = renderer!.root
      .findAll((node) => String(node.type) === "mock-text")
      .map((node) => node.children.join(" "));

    expect(text).toContain(
      "Today’s check-in includes the full set of questions while recent care updates settle.",
    );
  });

  it("keeps expanded mode opening the extra detail sections automatically", async () => {
    getCheckinAdaptation.mockResolvedValue({
      patientId: "patient-1",
      date: "2026-04-11",
      mode: "expanded",
      decisionSource: "hard_safety_expanded",
      reasonCodes: ["OPEN_ALERT_PRESENT"],
      reasonDetails: [
        {
          code: "OPEN_ALERT_PRESENT",
          label: "There is an open safety alert.",
          category: "safety",
        },
      ],
      clinicianSummary: "Expanded prompts are active because current safety signals need more detail.",
      explanation:
        "Today’s check-in includes a few extra detail prompts because recent recovery changed.",
      configVersion: 2,
      thresholdVersion: 1,
      generatedAt: "2026-04-11T07:00:00.000Z",
      optionalSections: {
        recovery: false,
        support: false,
        dailyContext: false,
      },
    });

    await act(async () => {
      renderer = create(<CheckinScreen />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const navigator = renderer!.root.find(
      (node) => String(node.type) === "mock-checkin-step-navigator",
    );
    act(() => {
      navigator.props.onSelectStep(1);
    });

    const statusPills = renderer!.root.findAll(
      (node) => String(node.type) === "mock-status-pill",
    );
    const text = renderer!.root
      .findAll((node) => String(node.type) === "mock-text")
      .map((node) => node.children.join(" "));

    expect(statusPills.map((node) => node.props.label)).toContain("Extra detail today");
    expect(text).toContain("Confidence in progress");
    expect(text).toContain("Movement and function");
  });

  it("renders a read-only check-in shell when care status blocks active tracking", async () => {
    canPatientUseCheckin.mockReturnValue(false);
    getCareModeNotice.mockReturnValue({
      title: "Care program completed",
      message:
        "Your care program has ended. Historical progress stays available here, but routine messaging and check-ins are no longer active.",
    });

    await act(async () => {
      renderer = create(<CheckinScreen />);
      await Promise.resolve();
    });

    const emptyStates = renderer!.root.findAll(
      (node) => String(node.type) === "mock-empty-state",
    );
    const buttons = renderer!.root.findAll(
      (node) => String(node.type) === "mock-primary-button",
    );

    expect(emptyStates[0]?.props.title).toBe("Check-ins are not active right now");
    expect(emptyStates[0]?.props.description).toContain(
      "routine messaging and check-ins are no longer active",
    );
    expect(buttons.some((node) => node.props.label === "Back to Today")).toBe(true);
  });

  it("renders guided check-in only in the active form and leaves manual controls available", async () => {
    await act(async () => {
      renderer = create(<CheckinScreen />);
      await Promise.resolve();
    });

    expect(
      renderer!.root.findAll((node) => String(node.type) === "mock-voice-guided-checkin-panel"),
    ).toHaveLength(1);
    expect(
      renderer!.root.findAll((node) => String(node.type) === "mock-body-map-selector"),
    ).toHaveLength(1);
    expect(createCheckin).not.toHaveBeenCalled();
  });

  it("uses the voiceGuided route flag only to expand guided check-in without writing data", async () => {
    routeParams.voiceGuided = "1";

    await act(async () => {
      renderer = create(<CheckinScreen />);
      await Promise.resolve();
    });

    const guidedPanel = renderer!.root.find(
      (node) => String(node.type) === "mock-voice-guided-checkin-panel",
    );

    expect(guidedPanel.props.initialExpanded).toBe(true);
    expect(guidedPanel.props.beginOnMount).toBe(true);
    expect(guidedPanel.props.accessibilityLabel).toBe("Voice-guided check-in panel");
    expect(createCheckin).not.toHaveBeenCalled();
    expect(setCheckinDraft).not.toHaveBeenCalled();
    expect(clearCheckinDraft).not.toHaveBeenCalled();
  });

  it("ignores array voiceGuided route params safely", async () => {
    routeParams.voiceGuided = ["1"];

    await act(async () => {
      renderer = create(<CheckinScreen />);
      await Promise.resolve();
    });

    const guidedPanel = renderer!.root.find(
      (node) => String(node.type) === "mock-voice-guided-checkin-panel",
    );

    expect(guidedPanel.props.initialExpanded).toBe(false);
    expect(guidedPanel.props.beginOnMount).toBe(false);
    expect(createCheckin).not.toHaveBeenCalled();
  });

  it("exposes contextual accessibility labels, values, and states on check-in controls", async () => {
    await act(async () => {
      renderer = create(<CheckinScreen />);
      await Promise.resolve();
    });

    const painDecrease = findByA11y(renderer!.root, "Decrease Pain");
    expect(painDecrease.props.accessibilityValue).toEqual({
      min: 0,
      max: 10,
      now: 0,
      text: "Pain: 0/10",
    });
    expect(painDecrease.props.accessibilityState).toEqual({ disabled: true });
    expect(painDecrease.props.accessibilityHint).toBe("Pain is already at the minimum.");

    const painIncrease = findByA11y(renderer!.root, "Increase Pain");
    expect(painIncrease.props.accessibilityValue).toEqual({
      min: 0,
      max: 10,
      now: 0,
      text: "Pain: 0/10",
    });
    expect(painIncrease.props.accessibilityHint).toBe("Increases Pain by 1.");

    const navigator = renderer!.root.find(
      (node) => String(node.type) === "mock-checkin-step-navigator",
    );

    act(() => {
      navigator.props.onSelectStep(2);
    });

    const moodChoice = findByA11y(renderer!.root, "Set Mood to 4, Strong");
    expect(moodChoice.props.accessibilityState).toEqual({ selected: false });

    act(() => {
      moodChoice.props.onPress();
    });

    expect(findByA11y(renderer!.root, "Set Mood to 4, Strong").props.accessibilityState).toEqual({
      selected: true,
    });
    expect(findByA11y(renderer!.root, "Clear Stress or overwhelm").props.accessibilityState).toEqual({
      disabled: true,
    });

    const supportSwitch = renderer!.root.find((node) => String(node.type) === "mock-switch");
    expect(supportSwitch.props.accessibilityLabel).toBe("Extra support today");
    expect(supportSwitch.props.accessibilityHint).toBe(
      "Turn on if you would like non-urgent encouragement or practical support today.",
    );
    expect(supportSwitch.props.accessibilityState).toEqual({ checked: false });

    expect(findByA11y(renderer!.root, "Check-in notes for your care team").props.accessibilityHint).toBe(
      "Optional. Dictation adds text here for review before you submit.",
    );
  });

  it("lets guided confirmation update draft fields without submitting", async () => {
    createCheckin.mockResolvedValue({
      ok: true,
      risk: { level: "low", reasonCodes: [] },
    });

    await act(async () => {
      renderer = create(<CheckinScreen />);
      await Promise.resolve();
    });

    const guidedPanel = renderer!.root.find(
      (node) => String(node.type) === "mock-voice-guided-checkin-panel",
    );
    act(() => {
      guidedPanel.props.onConfirmPain(6);
    });

    expect(createCheckin).not.toHaveBeenCalled();

    const navigator = renderer!.root.find(
      (node) => String(node.type) === "mock-checkin-step-navigator",
    );

    act(() => {
      navigator.props.onSelectStep(2);
    });
    act(() => {
      findByA11y(renderer!.root, "Set Mood to 4, Strong").props.onPress();
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

    expect(createCheckin).toHaveBeenCalledTimes(1);
    expect(createCheckin.mock.calls[0]?.[1].pain).toBe(6);
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
      findByA11y(renderer!.root, "Set Mood to 4, Strong").props.onPress();
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

  it("appends dictated notes without submitting until Submit is pressed", async () => {
    voiceTranscript.current = "walking caused soreness";
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
      findByA11y(renderer!.root, "Check-in notes for your care team").props.onChangeText("Knee felt tight");
      findByA11y(renderer!.root, "Start voice dictation").props.onPress();
    });

    expect(findByA11y(renderer!.root, "Check-in notes for your care team").props.value).toBe(
      "Knee felt tight walking caused soreness",
    );
    expect(createCheckin).not.toHaveBeenCalled();

    act(() => {
      findByA11y(renderer!.root, "Set Mood to 4, Strong").props.onPress();
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

    expect(createCheckin).toHaveBeenCalled();
    expect(createCheckin.mock.calls[0]?.[1].notes).toBe(
      "Knee felt tight walking caused soreness",
    );
  });

  it("adds question read-aloud without reading notes or submitting", async () => {
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
      findByA11y(renderer!.root, "Check-in notes for your care team").props.onChangeText(
        "Private note from patient",
      );
    });

    const readAloudButtons = renderer!.root.findAll(
      (node) => String(node.type) === "mock-read-aloud-button",
    );

    expect(readAloudButtons.length).toBeGreaterThan(0);
    expect(readAloudButtons.some((node) => node.props.text.includes("Mood"))).toBe(true);
    expect(readAloudButtons.map((node) => node.props.text).join(" ")).not.toContain(
      "Private note from patient",
    );

    await act(async () => {
      readAloudButtons[0].props.onPress();
      await Promise.resolve();
    });

    expect(createCheckin).not.toHaveBeenCalled();
  });

  it("keeps high-risk dictated notes inside the normal submit and safety flow", async () => {
    voiceTranscript.current = "I need urgent help today";
    createCheckin.mockResolvedValue({
      ok: true,
      risk: { level: "high", reasonCodes: ["URGENT_HELP"] },
      alertId: "alert-voice",
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
      findByA11y(renderer!.root, "Start voice dictation").props.onPress();
    });

    expect(createCheckin).not.toHaveBeenCalled();

    act(() => {
      findByA11y(renderer!.root, "Set Mood to 4, Strong").props.onPress();
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

    expect(createCheckin.mock.calls[0]?.[1].notes).toBe("I need urgent help today");
    expect(routerPush).toHaveBeenCalledWith({
      pathname: "/safety",
      params: {
        alertId: "alert-voice",
        reasonCodes: "URGENT_HELP",
      },
    });
  });

  it("keeps offline submit blocking unchanged after dictation fills notes", async () => {
    networkState.offline = true;
    voiceTranscript.current = "Pain spiked after stairs";

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
      findByA11y(renderer!.root, "Start voice dictation").props.onPress();
    });

    expect(findByA11y(renderer!.root, "Check-in notes for your care team").props.value).toBe(
      "Pain spiked after stairs",
    );
    expect(createCheckin).not.toHaveBeenCalled();

    act(() => {
      findByA11y(renderer!.root, "Set Mood to 4, Strong").props.onPress();
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

    expect(createCheckin).not.toHaveBeenCalled();
    expect(setCheckinLocalError).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "offline",
        retryable: true,
      }),
    );
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
      findByA11y(renderer!.root, "Set Mood to 4, Strong").props.onPress();
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

  it("hides guided check-in after successful low-risk submission confirmation", async () => {
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
      findByA11y(renderer!.root, "Set Mood to 4, Strong").props.onPress();
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

    expect(
      renderer!.root.findAll((node) => String(node.type) === "mock-checkin-confirmation-panel"),
    ).toHaveLength(1);
    expect(
      renderer!.root.findAll((node) => String(node.type) === "mock-voice-guided-checkin-panel"),
    ).toHaveLength(0);
  });
});
