/* @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <Routes>
        <Route path="/settings" element={<SettingsRouteFacade />} />
      </Routes>
    </MemoryRouter>,
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
  });

  it("preserves save-based profile, communication, and notification behavior", async () => {
    signInAs({ sub: "auth-settings-save", name: "Dr Hall" });
    const user = userEvent.setup();

    renderSettingsRoute();

    await user.clear(screen.getByLabelText("Clinician display name"));
    await user.type(screen.getByLabelText("Clinician display name"), "Dr Elena Hall");
    await user.clear(screen.getByLabelText("Clinician ID"));
    await user.type(screen.getByLabelText("Clinician ID"), "elena-hall-local");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(screen.getByText("Settings saved in this browser.")).toBeInTheDocument();
    expect(window.localStorage.getItem(CLINICIAN_ID_STORAGE_KEY)).toBe(
      "elena-hall-local",
    );
    expect(window.localStorage.getItem(CLINICIAN_NAME_STORAGE_KEY)).toBe(
      "Dr Elena Hall",
    );

    await user.click(screen.getByRole("button", { name: "Add template" }));
    await user.type(screen.getByLabelText("Template 1 title"), "Reviewed");
    await user.type(
      screen.getByLabelText("Template 1 body"),
      "Thanks, I have reviewed this update.",
    );
    await user.click(
      screen.getByRole("button", { name: "Save communication settings" }),
    );

    expect(getClinicianProfile().communicationAuthoring.templates).toHaveLength(1);

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
