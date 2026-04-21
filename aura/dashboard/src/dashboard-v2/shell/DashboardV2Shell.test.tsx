/* @vitest-environment jsdom */

import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetDashboardV2UiStore } from "../state/useDashboardV2UiStore";
import { DashboardV2Shell } from "./DashboardV2Shell";

const useMediaQueryMock = vi.fn(() => false);

vi.mock("../../components/auth/SessionTimeoutModal", () => ({
  SessionTimeoutModal: () => null,
}));

vi.mock("../../components/motion/PageTransition", () => ({
  PageTransition: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("../../components/system/OfflineBanner", () => ({
  OfflineBanner: () => null,
}));

vi.mock("../../components/ui/ClinicianAvatar", () => ({
  ClinicianAvatar: () => <div data-testid="clinician-avatar" />,
}));

vi.mock("../../hooks/useClinicianIdentity", () => ({
  useClinicianIdentity: () => ({
    displayName: "Clinician One",
    secondaryLine: "Recovery follow-up",
  }),
}));

vi.mock("../../hooks/useClinicianWorkspacePreferences", () => ({
  useClinicianWorkspacePreferences: () => ({
    availabilityLabel: "Recovery follow-up",
    resolvedTimezone: "UTC",
  }),
}));

vi.mock("../../hooks/useMediaQuery", () => ({
  useMediaQuery: (query: string) => useMediaQueryMock(query),
}));

vi.mock("../../services/apiClient", () => ({
  subscribeAuthRequired: () => () => undefined,
}));

vi.mock("../../services/connection", () => ({
  useConnectionStatus: () => ({
    online: true,
    lastSuccessAt: Date.parse("2026-04-19T10:54:00.000Z"),
  }),
}));

const sessionManager = {
  start: vi.fn(),
  stop: vi.fn(),
  updateConfig: vi.fn(),
  continueSession: vi.fn(),
  logout: vi.fn(),
};

vi.mock("../../services/sessionTimeout", () => ({
  createSessionTimeoutManager: () => sessionManager,
}));

vi.mock("../../services/sessionSettings", () => ({
  getSessionSettings: () => ({}),
  subscribeSessionSettings: () => () => undefined,
}));

vi.mock("../../utils/storageKeys", () => ({
  clearDashboardSessionData: vi.fn(),
}));

function renderShell(entry = "/dashboard"): void {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/" element={<DashboardV2Shell />}>
          <Route path="dashboard" element={<div>Dashboard workspace</div>} />
          <Route path="patients" element={<div>Patients workspace</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("DashboardV2Shell", () => {
  beforeEach(() => {
    resetDashboardV2UiStore();
    useMediaQueryMock.mockReset();
    useMediaQueryMock.mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps the dashboard shell free of foundation copy and shell-side context rail scaffolding", () => {
    renderShell();

    expect(screen.getByRole("heading", { name: "Today" })).toBeVisible();
    expect(screen.getAllByText("Live operational summary").length).toBeGreaterThan(0);
    expect(screen.getByRole("searchbox", { name: /Quick open/i })).toBeInTheDocument();
    expect(screen.getByText("Dashboard workspace")).toBeInTheDocument();
    expect(
      screen.queryByText(/Aura dashboard v2 foundation|Context rail foundation|Phase 1 preserves/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("complementary", { name: "Contextual governance rail" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Open explanation drawer/i)).not.toBeInTheDocument();
  });

  it("keeps the patients route on drawer-only context access even on wide layouts", async () => {
    const user = userEvent.setup();

    renderShell("/patients");

    expect(screen.getByText("Patients workspace")).toBeInTheDocument();
    expect(screen.queryByText("Freshness & scope")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Context" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Context" }));

    expect((await screen.findAllByRole("heading", { name: "Freshness & scope" })).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Open explanation drawer" })).toBeInTheDocument();
  });
});
