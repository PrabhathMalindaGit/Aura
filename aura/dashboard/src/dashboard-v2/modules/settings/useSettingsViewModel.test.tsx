/* @vitest-environment jsdom */

import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearClinicianProfileForTests,
  getClinicianProfile,
  setClinicianProfile,
} from "../../../services/clinicianProfile";
import {
  getSessionSettings,
  getSessionSettingsStorageKey,
} from "../../../services/sessionSettings";
import { getThemeMode, getThemeStorageKey } from "../../../services/theme";
import { createJsonResponse } from "../../../test/mocks";
import { useSettingsViewModel } from "./useSettingsViewModel";

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

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createWrapper(queryClient: QueryClient = createQueryClient()) {
  return function wrapper({ children }: { children: ReactNode }): JSX.Element {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

describe("useSettingsViewModel", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearClinicianProfileForTests();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("saves profile changes without overwriting unsaved communication drafts", () => {
    signInAs({ sub: "auth-settings-1", name: "Dr Rivera" });

    const { result } = renderHook(() => useSettingsViewModel(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.profileSection.onProfileFieldChange(
        "displayName",
        "Dr Elena Rivera",
      );
      result.current.communicationSection.onSignatureChange("Unsaved signature");
    });

    act(() => {
      result.current.profileSection.onSave();
    });

    expect(getClinicianProfile().displayName).toBe("Dr Elena Rivera");
    expect(getClinicianProfile().communicationAuthoring.defaultSignature).toBe("");
    expect(result.current.communicationSection.draft.defaultSignature).toBe(
      "Unsaved signature",
    );
    expect(result.current.profileSection.notice).toBe(
      "Settings saved in this browser.",
    );
  });

  it("restores workspace defaults into the draft until the clinician saves again", () => {
    signInAs({ sub: "auth-settings-2", name: "Dr Chen" });
    setClinicianProfile({
      ...getClinicianProfile(),
      displayName: "Dr Saved Chen",
      clinicianId: "saved-chen-local",
    });

    const { result } = renderHook(() => useSettingsViewModel(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.maintenancePanel.onRestoreDefaults();
    });

    expect(result.current.profileSection.draftProfile.displayName).toBe("Dr Chen");
    expect(result.current.profileSection.draftProfile.clinicianId).toBe(
      "auth-settings-2",
    );
    expect(getClinicianProfile().displayName).toBe("Dr Saved Chen");
    expect(result.current.maintenancePanel.notice).toBe(
      "Defaults restored in the form. Save to keep them in this browser.",
    );
  });

  it("applies theme and session protection changes immediately", () => {
    signInAs({ sub: "auth-settings-3", name: "Dr Theme" });

    const { result } = renderHook(() => useSettingsViewModel(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.appearancePanel.onThemeModeChange("dark");
      result.current.sessionPanel.onUpdate({ idleMinutes: 10, enabled: false });
    });

    expect(getThemeMode()).toBe("dark");
    expect(window.localStorage.getItem(getThemeStorageKey())).toBe("dark");
    expect(getSessionSettings().idleMinutes).toBe(10);
    expect(getSessionSettings().enabled).toBe(false);
    expect(
      window.localStorage.getItem(getSessionSettingsStorageKey()),
    ).toContain('"idleMinutes":10');
    expect(result.current.appearancePanel.notice).toBe("Theme set to dark.");
    expect(result.current.sessionPanel.notice).toBe(
      "Session security settings updated.",
    );
  });

  it("keeps presentation tooling disabled without the dashboard env flag", () => {
    signInAs({ sub: "auth-settings-4", name: "Dr Hidden" });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { result } = renderHook(() => useSettingsViewModel(), {
      wrapper: createWrapper(),
    });

    expect(result.current.presentationToolsPanel).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("loads presentation data and invalidates dashboard query caches when enabled", async () => {
    vi.stubEnv("VITE_AURA_PRESENTATION_TOOLS_ENABLED", "true");
    signInAs({ sub: "auth-settings-5", name: "Dr Tools" });
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const requestMethods: string[] = [];
    let loaded = false;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const method = init?.method ?? "GET";
      requestMethods.push(method);
      if (method === "POST") {
        loaded = true;
      }

      return createJsonResponse({
        ok: true,
        enabled: true,
        loaded,
        seedId: "phase-10c-presentation-seed-v1",
        counts: loaded ? { patients: 8, checkIns: 112 } : {},
        lastLoadedAt: loaded ? "2026-04-28T10:00:00.000Z" : null,
      });
    });

    const { result } = renderHook(() => useSettingsViewModel(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => {
      expect(result.current.presentationToolsPanel?.loading).toBe(false);
    });

    act(() => {
      result.current.presentationToolsPanel?.onLoad();
    });

    await waitFor(() => {
      expect(result.current.presentationToolsPanel?.notice).toBe(
        "Presentation data loaded.",
      );
    });

    expect(requestMethods).toContain("POST");
    expect(result.current.presentationToolsPanel?.loaded).toBe(true);
    expect(result.current.presentationToolsPanel?.countsSummary).toContain(
      "Patients 8",
    );
    expect(invalidateSpy).toHaveBeenCalled();
  });
});
