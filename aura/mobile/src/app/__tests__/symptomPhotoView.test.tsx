import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

const { authState, searchParams } = vi.hoisted(() => ({
  authState: { status: "signedIn" as "loading" | "signedIn" | "signedOut", token: "token-1" },
  searchParams: {
    mode: "pending",
    localFileUri: "file:///tmp/photo.jpg",
    date: "1970-01-01",
    kind: "other",
    createdAt: "1970-01-01T00:00:00.000Z",
  } as Record<string, string>,
}));

vi.mock("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => React.createElement("mock-redirect", { href }),
  useLocalSearchParams: () => searchParams,
  useRouter: () => ({
    replace: vi.fn(),
  }),
}));

vi.mock("@react-navigation/native", () => ({
  useFocusEffect: () => undefined,
}));

vi.mock("expo-file-system/legacy", () => ({
  default: {},
}));

vi.mock("react-native", () => ({
  ActivityIndicator: (props: Record<string, unknown>) =>
    React.createElement("mock-activity-indicator", props),
  Platform: { OS: "web" },
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
  ScrollView: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-scroll-view", props, children),
}));

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
  EmptyState: (props: Record<string, unknown>) => React.createElement("mock-empty-state", props),
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

vi.mock("@/src/components/MediaCard", () => ({
  MediaCard: (props: Record<string, unknown>) => React.createElement("mock-media-card", props),
}));

vi.mock("@/src/components/PrimaryButton", () => ({
  PrimaryButton: (props: Record<string, unknown>) =>
    React.createElement("mock-primary-button", props),
}));

vi.mock("@/src/components/Screen", () => ({
  Screen: ({
    children,
    header,
    ...props
  }: {
    children?: React.ReactNode;
    header?: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("mock-screen", props, header, children),
}));

vi.mock("@/src/components/SmartImage", () => ({
  SmartImage: (props: Record<string, unknown>) => React.createElement("mock-smart-image", props),
}));

vi.mock("@/src/components/StatusPill", () => ({
  StatusPill: (props: Record<string, unknown>) => React.createElement("mock-status-pill", props),
}));

vi.mock("@/src/components/TrackerTile", () => ({
  TrackerTile: (props: Record<string, unknown>) => React.createElement("mock-tracker-tile", props),
}));

vi.mock("@/src/state/auth", () => ({
  useAuth: () => authState,
}));

vi.mock("@/src/theme/tokens", () => ({
  useTokens: () => ({
    colors: {
      primary: "#2F6FED",
      text: "#183042",
      textMuted: "#5E7182",
      border: "#d7e0e7",
      surface: "#ffffff",
    },
    spacing: { sm: 8, md: 12, lg: 16, xl: 24 },
    radius: { md: 14 },
    typography: {
      body: { fontSize: 16, lineHeight: 24 },
      caption: { fontSize: 12, lineHeight: 16 },
      section: { fontSize: 20, lineHeight: 28 },
      weights: { semibold: "600" },
    },
  }),
}));

import SymptomPhotoViewScreen from "@/app/symptom-photo-view";

describe("Symptom photo view", () => {
  it("suppresses epoch and raw timestamp leaks on pending photo detail", async () => {
    authState.status = "signedIn";
    let renderer: ReactTestRenderer;

    await act(async () => {
      renderer = create(<SymptomPhotoViewScreen />);
    });

    const text = renderer!.root
      .findAll((node) => String(node.type) === "mock-text")
      .map((node) => node.children.join(" "))
      .join(" ");
    const mediaCards = renderer!.root.findAll(
      (node) => String(node.type) === "mock-media-card",
    );
    const detailCard = mediaCards.find((node) => node.props.title === "Photo summary");

    expect(text).toContain("Date unavailable");
    expect(text).not.toContain("1970");
    expect(text).not.toContain("1970-01-01T00:00:00.000Z");
    expect(detailCard?.props.subtitle).toBe("Saved time unavailable");
  });
});
