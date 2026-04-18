/* @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

function wrapper({ children }: { children: ReactNode }): JSX.Element {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe("useSettingsViewModel", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    clearClinicianProfileForTests();
  });

  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("saves profile changes without overwriting unsaved communication drafts", () => {
    signInAs({ sub: "auth-settings-1", name: "Dr Rivera" });

    const { result } = renderHook(() => useSettingsViewModel(), { wrapper });

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

    const { result } = renderHook(() => useSettingsViewModel(), { wrapper });

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

    const { result } = renderHook(() => useSettingsViewModel(), { wrapper });

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
});
