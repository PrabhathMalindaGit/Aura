import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveDashboardDemoMode } from "./dashboardDemoMode";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveDashboardDemoMode", () => {
  it("returns real mode when the env gate is off even if the query param is present", () => {
    vi.stubEnv("VITE_AURA_DASHBOARD_ANALYTICS_DEMO_ENABLED", "false");

    expect(
      resolveDashboardDemoMode("?dashboardDemo=urgentSafetyDay"),
    ).toEqual({
      enabled: false,
      scenarioId: null,
      scenarioLabel: null,
      indicatorLabel: null,
      anchorIso: null,
    });
  });

  it("returns real mode when the env gate is on but the query param is missing", () => {
    vi.stubEnv("VITE_AURA_DASHBOARD_ANALYTICS_DEMO_ENABLED", "true");

    expect(resolveDashboardDemoMode("")).toEqual({
      enabled: false,
      scenarioId: null,
      scenarioLabel: null,
      indicatorLabel: null,
      anchorIso: null,
    });
  });

  it("returns real mode when the env gate is on but the scenario is invalid", () => {
    vi.stubEnv("VITE_AURA_DASHBOARD_ANALYTICS_DEMO_ENABLED", "true");

    expect(resolveDashboardDemoMode("?dashboardDemo=notARealScenario")).toEqual({
      enabled: false,
      scenarioId: null,
      scenarioLabel: null,
      indicatorLabel: null,
      anchorIso: null,
    });
  });

  it("returns demo mode when the env gate is on and the scenario is valid", () => {
    vi.stubEnv("VITE_AURA_DASHBOARD_ANALYTICS_DEMO_ENABLED", "true");

    expect(
      resolveDashboardDemoMode("?dashboardDemo=urgentSafetyDay"),
    ).toMatchObject({
      enabled: true,
      scenarioId: "urgentSafetyDay",
      scenarioLabel: "Urgent safety day",
      indicatorLabel: "Demo mode",
      anchorIso: "2026-04-19T09:30:00.000Z",
    });
  });
});
