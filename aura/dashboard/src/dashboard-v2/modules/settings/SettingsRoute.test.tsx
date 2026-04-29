/* @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLINICIAN_ID_STORAGE_KEY,
  CLINICIAN_NAME_STORAGE_KEY,
} from "../../../utils/storageKeys";
import {
  clearClinicianProfileForTests,
  getClinicianProfile,
} from "../../../services/clinicianProfile";
import { getThemeStorageKey } from "../../../services/theme";
import { SettingsRouteFacade } from "../../config/routeFacades";
import {
  getDefaultDashboardV2Gates,
  resetDashboardV2GatesForTests,
  writeDashboardV2Gates,
} from "../../config/migrationGates";
import {
  installMatchMediaMock,
  installResizeObserverMock,
  createJsonResponse,
} from "../../../test/mocks";

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function buildToken(input: { sub: string; name?: string; exp?: number }): string {
  const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = toBase64Url(
    JSON.stringify({
      sub: input.sub,
      name: input.name,
      exp: input.exp ?? Math.floor(Date.now() / 1000) + 60 * 60,
    }),
  );

  return `${header}.${payload}.signature`;
}

function signInAs(input: { sub: string; name?: string }): void {
  window.localStorage.setItem("aura_access_token", buildToken(input));
}

function installViewportMock(width: number): void {
  installMatchMediaMock((query) => {
    const maxMatch = query.match(/max-width:\s*(\d+)px/);
    if (maxMatch) {
      return width <= Number(maxMatch[1]);
    }

    const minMatch = query.match(/min-width:\s*(\d+)px/);
    if (minMatch) {
      return width >= Number(minMatch[1]);
    }

    return false;
  });
}

function renderSettingsRoute(): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/settings"]}>
        <Routes>
          <Route path="/settings" element={<SettingsRouteFacade />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function setSettingsGate(enabled: boolean): void {
  const defaults = getDefaultDashboardV2Gates();

  writeDashboardV2Gates({
    ...defaults,
    routes: {
      ...defaults.routes,
      settings: enabled,
    },
  });
}

describe("SettingsRouteFacade", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearClinicianProfileForTests();
    resetDashboardV2GatesForTests();
    installViewportMock(1440);
    installResizeObserverMock();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    resetDashboardV2GatesForTests();
  });

  it("keeps the legacy settings route available when the route is explicitly rolled back", async () => {
    signInAs({ sub: "auth-settings-legacy", name: "Dr Legacy" });
    setSettingsGate(false);

    renderSettingsRoute();

    expect(
      await screen.findByText("Clinician identity and handoff"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("v2-settings-route")).not.toBeInTheDocument();
  });

  it("renders the v2 settings route by default with grouped primary and secondary sections", () => {
    signInAs({ sub: "auth-settings-v2", name: "Dr Rivera" });

    renderSettingsRoute();

    expect(screen.getByTestId("v2-settings-route")).toBeVisible();
    expect(screen.getByTestId("v2-settings-status-bar")).toHaveTextContent(
      "Workspace preferences",
    );
    expect(screen.getByTestId("v2-settings-profile-section")).toHaveTextContent(
      "Workspace profile",
    );
    expect(
      screen.getByTestId("v2-settings-communication-section"),
    ).toHaveTextContent(
      "Communication authoring",
    );
    expect(
      screen.getByTestId("v2-settings-notification-section"),
    ).toHaveTextContent(
      "Notification preferences",
    );
    expect(screen.getByTestId("v2-settings-appearance-panel")).toHaveTextContent(
      "Appearance",
    );
    expect(screen.getByTestId("v2-settings-session-panel")).toHaveTextContent(
      "Session protection",
    );
    expect(screen.getByTestId("v2-settings-reference-panel")).toHaveTextContent(
      "Workspace reference",
    );
    expect(screen.getByTestId("v2-settings-maintenance-panel")).toHaveTextContent(
      "Restore workspace profile defaults",
    );
    expect(
      screen.queryByText("Workspace preferences foundation"),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("This browser only").length).toBeGreaterThan(0);
    expect(
      screen.queryByTestId("v2-settings-presentation-tools-panel"),
    ).not.toBeInTheDocument();
  });

  it("hides presentation tools and makes no status request unless the Vite flag is true", () => {
    signInAs({ sub: "auth-settings-hidden", name: "Dr Hidden" });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    renderSettingsRoute();

    expect(
      screen.queryByTestId("v2-settings-presentation-tools-panel"),
    ).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows backend-disabled presentation tooling when enabled but the server seed flag is off", async () => {
    vi.stubEnv("VITE_AURA_PRESENTATION_TOOLS_ENABLED", "true");
    signInAs({ sub: "auth-settings-presentation-disabled", name: "Dr Tools" });
    const requestUrls: string[] = [];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const requestUrl = input instanceof Request ? input.url : String(input);
      requestUrls.push(requestUrl);
      return createJsonResponse({
        ok: true,
        enabled: false,
        loaded: false,
        seedId: "phase-10c-presentation-seed-v1",
        counts: {},
        lastLoadedAt: null,
        message: "Presentation seed is disabled",
      });
    });

    renderSettingsRoute();

    const panel = await screen.findByTestId("v2-settings-presentation-tools-panel");
    await screen.findByText("Presentation seed is not enabled on the backend.");
    expect(panel).toHaveTextContent("Presentation tools");
    expect(panel).toHaveTextContent("Presentation seed is not enabled on the backend.");
    expect(panel).toHaveTextContent("Set AURA_PRESENTATION_SEED_ENABLED=true");
    expect(screen.getByRole("button", { name: "Load presentation data" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset presentation data" })).toBeDisabled();
    expect(requestUrls).toHaveLength(1);
    expect(new URL(requestUrls[0]).pathname).toBe("/clinician/dev/presentation/seed");
  });

  it("keeps presentation actions disabled when status cannot be loaded", async () => {
    vi.stubEnv("VITE_AURA_PRESENTATION_TOOLS_ENABLED", "true");
    signInAs({ sub: "auth-settings-presentation-error", name: "Dr Tools" });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createJsonResponse({ ok: false, error: "INTERNAL_ERROR" }, 500),
    );

    renderSettingsRoute();

    const panel = await screen.findByTestId("v2-settings-presentation-tools-panel");
    expect(await within(panel).findByText("Status unavailable")).toBeVisible();
    expect(panel).toHaveTextContent("The server is temporarily unavailable.");
    expect(screen.getByRole("button", { name: "Load presentation data" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset presentation data" })).toBeDisabled();
  });

  it("loads and resets presentation data through explicit user actions", async () => {
    vi.stubEnv("VITE_AURA_PRESENTATION_TOOLS_ENABLED", "true");
    signInAs({ sub: "auth-settings-presentation-actions", name: "Dr Tools" });
    const requests: Array<{ method: string; pathname: string }> = [];
    let loaded = false;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const requestUrl = input instanceof Request ? input.url : String(input);
      const method = init?.method ?? "GET";
      const pathname = new URL(requestUrl).pathname;
      requests.push({ method, pathname });

      if (method === "POST") {
        loaded = true;
      }
      if (method === "DELETE") {
        loaded = false;
      }

      return createJsonResponse({
        ok: true,
        enabled: true,
        loaded,
        seedId: "phase-10c-presentation-seed-v1",
        counts: loaded
          ? {
              patients: 8,
              checkIns: 112,
              alerts: 4,
              tasks: 8,
              appointmentRequests: 6,
              insightSuggestions: 8,
            }
          : {},
        lastLoadedAt: loaded ? "2026-04-28T10:00:00.000Z" : null,
      });
    });

    const user = userEvent.setup();
    renderSettingsRoute();

    expect(await screen.findByText("Presentation data not loaded")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Load presentation data" }));
    expect(await screen.findByText("Presentation data loaded.")).toBeVisible();
    expect(screen.getByText("Patients 8")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset presentation data" }));
    expect(await screen.findByText("Presentation data reset.")).toBeVisible();

    expect(requests).toEqual(
      expect.arrayContaining([
        { method: "GET", pathname: "/clinician/dev/presentation/seed" },
        { method: "POST", pathname: "/clinician/dev/presentation/seed" },
        { method: "DELETE", pathname: "/clinician/dev/presentation/seed" },
      ]),
    );
  });

  it("preserves save-based profile behavior", async () => {
    signInAs({ sub: "auth-settings-profile-save", name: "Dr Hall" });
    const user = userEvent.setup();

    renderSettingsRoute();

    fireEvent.change(screen.getByLabelText("Clinician display name"), {
      target: { value: "Dr Elena Hall" },
    });
    fireEvent.change(screen.getByLabelText("Clinician ID"), {
      target: { value: "elena-hall-local" },
    });
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(screen.getByText("Settings saved in this browser.")).toBeInTheDocument();
    expect(window.localStorage.getItem(CLINICIAN_ID_STORAGE_KEY)).toBe(
      "elena-hall-local",
    );
    expect(window.localStorage.getItem(CLINICIAN_NAME_STORAGE_KEY)).toBe(
      "Dr Elena Hall",
    );
  });

  it("preserves save-based communication authoring behavior", async () => {
    signInAs({ sub: "auth-settings-communication-save", name: "Dr Hall" });
    const user = userEvent.setup();

    renderSettingsRoute();

    await user.click(screen.getByRole("button", { name: "Add template" }));
    fireEvent.change(screen.getByLabelText("Template 1 title"), {
      target: { value: "Reviewed" },
    });
    fireEvent.change(screen.getByLabelText("Template 1 body"), {
      target: { value: "Thanks, I have reviewed this update." },
    });
    await user.click(
      screen.getByRole("button", { name: "Save communication settings" }),
    );

    expect(getClinicianProfile().communicationAuthoring.templates).toHaveLength(1);
  });

  it("preserves save-based notification preference behavior", async () => {
    signInAs({ sub: "auth-settings-notification-save", name: "Dr Hall" });
    const user = userEvent.setup();

    renderSettingsRoute();

    await user.selectOptions(
      screen.getByLabelText("Communication attention cues"),
      "reduced",
    );
    await user.click(screen.getByRole("checkbox", { name: /Quiet hours/i }));
    fireEvent.change(screen.getByLabelText("Quiet hours start time"), {
      target: { value: "22:00" },
    });
    fireEvent.change(screen.getByLabelText("Quiet hours end time"), {
      target: { value: "22:00" },
    });
    await user.click(
      screen.getByRole("button", { name: "Save notification settings" }),
    );

    expect(
      screen.getAllByText("Quiet hours start and end times must be different.")
        .length,
    ).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText("Quiet hours end time"), {
      target: { value: "06:45" },
    });
    await user.click(
      screen.getByRole("button", { name: "Save notification settings" }),
    );

    expect(getClinicianProfile().notificationPreferences.quietHours.enabled).toBe(
      true,
    );
    expect(screen.getByText("Communication cues reduced")).toBeInTheDocument();
    expect(screen.getByText("Quiet hours 22:00 - 06:45")).toBeInTheDocument();
  });

  it("keeps immediate controls local and conservative, including Unknown handling", async () => {
    const user = userEvent.setup();
    installViewportMock(560);

    renderSettingsRoute();

    const referencePanel = screen.getByTestId("v2-settings-reference-panel");
    expect(within(referencePanel).getByText("Authenticated scope")).toBeInTheDocument();
    expect(within(referencePanel).getByText("Unknown")).toBeInTheDocument();
    expect(screen.queryByText(/last synced/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/organization-wide/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(window.localStorage.getItem(getThemeStorageKey())).toBe("dark");

    await user.click(screen.getByRole("button", { name: "Restore defaults" }));
    expect(
      screen.getByText(
        "Defaults restored in the form. Save to keep them in this browser.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Shared shell state/i }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Workspace density/i }),
    ).toBeVisible();
  });
});
