import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SpeechEventName = "start" | "end" | "result" | "error" | "nomatch";
type SpeechListener = (event?: any) => void;

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
  speechListeners,
  speechModule,
  stopReadAloud,
} = vi.hoisted(() => {
  const listeners: Partial<Record<SpeechEventName, SpeechListener[]>> = {};

  return {
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
    speechListeners: listeners,
    stopReadAloud: vi.fn(async () => undefined),
    speechModule: {
    addListener: vi.fn((eventName: SpeechEventName, listener: SpeechListener) => {
      const currentListeners = listeners[eventName] ?? [];
      listeners[eventName] = [...currentListeners, listener];
      return {
        remove: vi.fn(() => {
          listeners[eventName] = (listeners[eventName] ?? []).filter(
            (candidate) => candidate !== listener,
          );
        }),
      };
    }),
    abort: vi.fn(),
    isRecognitionAvailable: vi.fn(() => true),
    requestPermissionsAsync: vi.fn(async () => ({
      granted: true,
      status: "granted",
      canAskAgain: true,
      expires: "never",
    })),
    start: vi.fn(),
    stop: vi.fn(),
    supportsOnDeviceRecognition: vi.fn(() => true),
  },
  };
});

vi.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: speechModule,
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

vi.mock("@/src/utils/readAloud", () => ({
  stopReadAloud,
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

function emitSpeech(eventName: SpeechEventName, event?: any) {
  for (const listener of speechListeners[eventName] ?? []) {
    listener(event);
  }
}

function textContent(root: ReactTestRenderer["root"]): string {
  return root
    .findAll((node) => String(node.type) === "mock-text")
    .map((node) => node.children.join(" "))
    .join(" ");
}

function findSubmitButton(root: ReactTestRenderer["root"]) {
  return root
    .findAll((node) => String(node.type) === "mock-primary-button")
    .find((node) => node.props.label === "Submit check-in");
}

function selectStep(root: ReactTestRenderer["root"], stepIndex: number) {
  const navigator = root.find(
    (node) => String(node.type) === "mock-checkin-step-navigator",
  );
  act(() => {
    navigator.props.onSelectStep(stepIndex);
  });
}

function fillRequiredMood(root: ReactTestRenderer["root"]) {
  selectStep(root, 2);
  act(() => {
    findByA11y(root, "Set Mood to 4, Strong").props.onPress();
  });
}

async function reviewForVoiceSubmit(root: ReactTestRenderer["root"]) {
  selectStep(root, 3);
  await act(async () => {
    findByA11y(root, "Review for voice submit").props.onPress();
    await Promise.resolve();
  });
}

async function listenAndEmitConfirmation(root: ReactTestRenderer["root"], transcript: string) {
  await act(async () => {
    findByA11y(root, "Listen for voice submit confirmation").props.onPress();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    emitSpeech("result", {
      isFinal: true,
      results: transcript ? [{ transcript }] : [],
    });
    await Promise.resolve();
  });
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
    for (const key of Object.keys(speechListeners) as SpeechEventName[]) {
      speechListeners[key] = [];
    }
    speechModule.addListener.mockClear();
    speechModule.abort.mockClear();
    speechModule.isRecognitionAvailable.mockReset();
    speechModule.isRecognitionAvailable.mockReturnValue(true);
    speechModule.requestPermissionsAsync.mockReset();
    speechModule.requestPermissionsAsync.mockResolvedValue({
      granted: true,
      status: "granted",
      canAskAgain: true,
      expires: "never",
    });
    speechModule.start.mockClear();
    speechModule.stop.mockClear();
    speechModule.supportsOnDeviceRecognition.mockReset();
    speechModule.supportsOnDeviceRecognition.mockReturnValue(true);
    stopReadAloud.mockClear();
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

  it("blocks voice submit review when required fields are missing and uses existing validation", async () => {
    await act(async () => {
      renderer = create(<CheckinScreen />);
      await Promise.resolve();
    });

    await reviewForVoiceSubmit(renderer!.root);

    expect(createCheckin).not.toHaveBeenCalled();
    const navigator = renderer!.root.find(
      (node) => String(node.type) === "mock-checkin-step-navigator",
    );
    expect(navigator.props.activeStep).toBe(2);
    expect(textContent(renderer!.root)).toContain(
      "Choose the number that best matches your mood today.",
    );
  });

  it("shows a current voice submit summary with reviewable check-in fields", async () => {
    await act(async () => {
      renderer = create(<CheckinScreen />);
      await Promise.resolve();
    });

    const guidedPanel = renderer!.root.find(
      (node) => String(node.type) === "mock-voice-guided-checkin-panel",
    );
    act(() => {
      guidedPanel.props.onConfirmPain(6);
      guidedPanel.props.onConfirmExercise(80);
      guidedPanel.props.onConfirmMedicationStatus("missed");
      guidedPanel.props.onConfirmSleepHours(7.5);
      guidedPanel.props.onConfirmSleepQuality(3);
      guidedPanel.props.onConfirmNotes("Knee felt tight after stairs");
    });
    selectStep(renderer!.root, 0);
    const bodyMapSelector = renderer!.root.find(
      (node) => String(node.type) === "mock-body-map-selector",
    );
    act(() => {
      bodyMapSelector.props.onToggleRegion("knee_left");
    });
    fillRequiredMood(renderer!.root);
    const supportControls = renderer!.root.findAll(
      (node) => String(node.type) === "mock-segmented-control",
    );
    act(() => {
      supportControls.find((node) => node.props.accessibilityLabel === "Support request")?.props.onChange("follow_up");
    });

    await reviewForVoiceSubmit(renderer!.root);

    const text = textContent(renderer!.root);
    expect(text).toContain("Voice submit review");
    expect(text).toContain("Pain 6/10");
    expect(text).toContain("Mood 4/5, Strong");
    expect(text).toContain("Exercises 80% complete");
    expect(text).toContain("Medication Missed");
    expect(text).toContain("Left knee 6/10 ache");
    expect(text).toContain("Please follow up");
    expect(text).toContain("7.5 hours asleep");
    expect(text).toContain("Sleep quality okay");
    expect(text).toContain("Notes: Knee felt tight after stairs");
    expect(text).toContain(
      "I’ll submit this exact check-in after you say ‘yes submit.’ Urgent symptoms still go through Aura’s normal safety review.",
    );
    expect(findByA11y(renderer!.root, "Read voice submit summary")).toBeTruthy();
    expect(findByA11y(renderer!.root, "Confirm voice check-in submit").props.accessibilityState).toMatchObject({
      disabled: false,
    });
  });

  it("allows up to twelve body map areas before showing the selection limit", async () => {
    await act(async () => {
      renderer = create(<CheckinScreen />);
      await Promise.resolve();
    });

    selectStep(renderer!.root, 0);
    const regions = [
      "head",
      "neck",
      "shoulder_left",
      "shoulder_right",
      "upper_back",
      "lower_back",
      "arm_left",
      "arm_right",
      "elbow_left",
      "elbow_right",
      "wrist_hand_left",
      "wrist_hand_right",
    ];
    const bodyMapSelector = renderer!.root.find(
      (node) => String(node.type) === "mock-body-map-selector",
    );

    act(() => {
      for (const region of regions) {
        bodyMapSelector.props.onToggleRegion(region);
      }
    });

    const updatedSelector = renderer!.root.find(
      (node) => String(node.type) === "mock-body-map-selector",
    );
    expect(updatedSelector.props.value.selectedRegions).toEqual(regions);

    act(() => {
      updatedSelector.props.onToggleRegion("hip_left");
    });

    const limitedSelector = renderer!.root.find(
      (node) => String(node.type) === "mock-body-map-selector",
    );
    expect(limitedSelector.props.value.selectedRegions).toEqual(regions);

    const limitBanner = renderer!.root
      .findAll((node) => String(node.type) === "mock-banner")
      .find((node) => node.props.title === "Body map limit");
    expect(limitBanner?.props.message).toBe("Select up to 12 body areas.");
  });

  it("submits by voice only after explicit confirmation while awaiting confirmation", async () => {
    createCheckin.mockResolvedValue({
      ok: true,
      risk: { level: "low", reasonCodes: [] },
    });

    await act(async () => {
      renderer = create(<CheckinScreen />);
      await Promise.resolve();
    });
    fillRequiredMood(renderer!.root);

    await act(async () => {
      emitSpeech("result", {
        isFinal: true,
        results: [{ transcript: "confirm submit" }],
      });
      await Promise.resolve();
    });
    expect(createCheckin).not.toHaveBeenCalled();

    await reviewForVoiceSubmit(renderer!.root);
    await listenAndEmitConfirmation(renderer!.root, "yes submit");

    expect(createCheckin).toHaveBeenCalledTimes(1);
    expect(createCheckin.mock.calls[0]?.[1]).toMatchObject({
      date: "2026-04-11",
      mood: 4,
      pain: 0,
    });
    expect(clearCheckinDraft).toHaveBeenCalledWith("patient-1", "2026-04-11");
  });

  it.each(["confirm submit", "submit check-in"])(
    "accepts %s only during voice confirmation review",
    async (phrase) => {
      createCheckin.mockResolvedValue({
        ok: true,
        risk: { level: "low", reasonCodes: [] },
      });

      await act(async () => {
        renderer = create(<CheckinScreen />);
        await Promise.resolve();
      });
      fillRequiredMood(renderer!.root);
      await reviewForVoiceSubmit(renderer!.root);
      await listenAndEmitConfirmation(renderer!.root, phrase);

      expect(createCheckin).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["yes", "yeah", "okay", "ok", "sure", "maybe", "continue", "please", "go ahead", "submit", "send", "request", "log", ""])(
    "does not submit ambiguous voice confirmation %s",
    async (phrase) => {
      await act(async () => {
        renderer = create(<CheckinScreen />);
        await Promise.resolve();
      });
      fillRequiredMood(renderer!.root);
      await reviewForVoiceSubmit(renderer!.root);
      await listenAndEmitConfirmation(renderer!.root, phrase);

      expect(createCheckin).not.toHaveBeenCalled();
      expect(textContent(renderer!.root)).toContain("That was not a clear submit confirmation.");
    },
  );

  it.each([
    "cancel",
    "stop",
    "do not submit",
    "dont submit",
    "do not send",
    "dont send",
    "do not request",
    "dont request",
    "do not log",
    "dont log",
    "never mind",
    "go back",
  ])(
    "clears voice submit state for negative phrase %s",
    async (phrase) => {
      await act(async () => {
        renderer = create(<CheckinScreen />);
        await Promise.resolve();
      });
      fillRequiredMood(renderer!.root);
      await reviewForVoiceSubmit(renderer!.root);
      await listenAndEmitConfirmation(renderer!.root, phrase);

      expect(createCheckin).not.toHaveBeenCalled();
      expect(textContent(renderer!.root)).toContain("Voice submit cancelled.");
      expect(findByA11y(renderer!.root, "Confirm voice check-in submit").props.accessibilityState).toMatchObject({
        disabled: true,
      });
    },
  );

  it("prevents voice submit after confirmation expiry", async () => {
    await act(async () => {
      renderer = create(<CheckinScreen />);
      await Promise.resolve();
    });
    fillRequiredMood(renderer!.root);
    await reviewForVoiceSubmit(renderer!.root);

    await act(async () => {
      vi.advanceTimersByTime(31_000);
      await Promise.resolve();
    });
    await listenAndEmitConfirmation(renderer!.root, "yes submit");

    expect(createCheckin).not.toHaveBeenCalled();
    expect(textContent(renderer!.root)).toContain("Voice submit review expired.");
  });

  it("invalidates voice submit review when the draft changes", async () => {
    await act(async () => {
      renderer = create(<CheckinScreen />);
      await Promise.resolve();
    });
    fillRequiredMood(renderer!.root);
    await reviewForVoiceSubmit(renderer!.root);

    selectStep(renderer!.root, 2);
    act(() => {
      findByA11y(renderer!.root, "Set Mood to 5, Very strong").props.onPress();
    });
    selectStep(renderer!.root, 3);

    expect(textContent(renderer!.root)).toContain("Check-in changed. Review again before voice submit.");
    expect(findByA11y(renderer!.root, "Confirm voice check-in submit").props.accessibilityState).toMatchObject({
      disabled: true,
    });
  });

  it("keeps offline voice-confirmed submit behavior identical to manual submit", async () => {
    networkState.offline = true;

    await act(async () => {
      renderer = create(<CheckinScreen />);
      await Promise.resolve();
    });
    fillRequiredMood(renderer!.root);
    await reviewForVoiceSubmit(renderer!.root);

    await act(async () => {
      findByA11y(renderer!.root, "Confirm voice check-in submit").props.onPress();
      await Promise.resolve();
    });

    expect(createCheckin).not.toHaveBeenCalled();
    expect(setCheckinLocalError).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "offline",
        retryable: true,
      }),
    );
    expect(textContent(renderer!.root)).toContain("Voice submit is paused while you’re offline.");
  });

  it("routes high-risk voice-confirmed submissions exactly like manual submit", async () => {
    createCheckin.mockResolvedValue({
      ok: true,
      risk: { level: "high", reasonCodes: ["URGENT_HELP"] },
      alertId: "alert-voice-submit",
    });

    await act(async () => {
      renderer = create(<CheckinScreen />);
      await Promise.resolve();
    });
    fillRequiredMood(renderer!.root);
    await reviewForVoiceSubmit(renderer!.root);
    await listenAndEmitConfirmation(renderer!.root, "yes submit");

    expect(routerPush).toHaveBeenCalledWith({
      pathname: "/safety",
      params: {
        alertId: "alert-voice-submit",
        reasonCodes: "URGENT_HELP",
      },
    });
    expect(clearCheckinDraft).not.toHaveBeenCalled();
  });

  it("keeps V5-D1 free of forbidden voice side effects and OpenAI key exposure", () => {
    const source = [
      "app/(tabs)/checkin.tsx",
      "src/components/checkin/VoiceGuidedCheckinPanel.tsx",
      "src/utils/guidedCheckinParser.ts",
    ]
      .map((path) => require("node:fs").readFileSync(`${process.cwd()}/${path}`, "utf8"))
      .join("\n");

    expect(source).not.toContain("EXPO_PUBLIC_OPENAI_API_KEY");
    expect(source).not.toContain("OPENAI_API_KEY");
    expect(source).not.toContain("sendChat");
    expect(source).not.toContain("bookAppointment");
    expect(source).not.toContain("createAlert");
    expect(source).not.toContain("uploadPhoto");
    expect(source).not.toContain("/rag/reply");
    expect(source).not.toContain("/patient/voice/session");
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
