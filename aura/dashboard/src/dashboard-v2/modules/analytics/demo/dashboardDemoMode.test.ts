import { describe, expect, it } from "vitest";
import {
  isDashboardDemoCapabilityEnabled,
  resolveDashboardDemoMode,
} from "./dashboardDemoMode";

describe("resolveDashboardDemoMode", () => {
  it("returns real mode when the env gate is off even if the query param is present", () => {
    expect(
      resolveDashboardDemoMode("?dashboardDemo=urgentSafetyDay", {
        DEV: true,
        VITE_AURA_DASHBOARD_ANALYTICS_DEMO_ENABLED: "false",
      }),
    ).toEqual({
      enabled: false,
      scenarioId: null,
      scenarioLabel: null,
      indicatorLabel: null,
      anchorIso: null,
    });
  });

  it("returns real mode when the env gate is on but local dev is false", () => {
    expect(
      resolveDashboardDemoMode("?dashboardDemo=urgentSafetyDay", {
        DEV: false,
        VITE_AURA_DASHBOARD_ANALYTICS_DEMO_ENABLED: "true",
      }),
    ).toEqual({
      enabled: false,
      scenarioId: null,
      scenarioLabel: null,
      indicatorLabel: null,
      anchorIso: null,
    });
  });

  it("returns real mode when the env gate is on but the query param is missing", () => {
    expect(
      resolveDashboardDemoMode("", {
        DEV: true,
        VITE_AURA_DASHBOARD_ANALYTICS_DEMO_ENABLED: "true",
      }),
    ).toEqual({
      enabled: false,
      scenarioId: null,
      scenarioLabel: null,
      indicatorLabel: null,
      anchorIso: null,
    });
  });

  it("returns real mode when the env gate is on but the scenario is invalid", () => {
    expect(
      resolveDashboardDemoMode("?dashboardDemo=notARealScenario", {
        DEV: true,
        VITE_AURA_DASHBOARD_ANALYTICS_DEMO_ENABLED: "true",
      }),
    ).toEqual({
      enabled: false,
      scenarioId: null,
      scenarioLabel: null,
      indicatorLabel: null,
      anchorIso: null,
    });
  });

  it("returns demo mode when local dev, env gate, and scenario are all valid", () => {
    expect(
      resolveDashboardDemoMode("?dashboardDemo=urgentSafetyDay", {
        DEV: true,
        VITE_AURA_DASHBOARD_ANALYTICS_DEMO_ENABLED: "true",
      }),
    ).toMatchObject({
      enabled: true,
      scenarioId: "urgentSafetyDay",
      scenarioLabel: "Urgent safety day",
      indicatorLabel: "Demo mode",
      anchorIso: "2026-04-19T09:30:00.000Z",
    });
  });

  it("exposes demo capability only for local dev with the explicit env gate enabled", () => {
    expect(
      isDashboardDemoCapabilityEnabled({
        DEV: false,
        VITE_AURA_DASHBOARD_ANALYTICS_DEMO_ENABLED: "true",
      }),
    ).toBe(false);
    expect(
      isDashboardDemoCapabilityEnabled({
        DEV: true,
        VITE_AURA_DASHBOARD_ANALYTICS_DEMO_ENABLED: "false",
      }),
    ).toBe(false);
    expect(
      isDashboardDemoCapabilityEnabled({
        DEV: true,
        VITE_AURA_DASHBOARD_ANALYTICS_DEMO_ENABLED: "true",
      }),
    ).toBe(true);
  });
});
