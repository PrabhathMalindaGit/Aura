import {
  getDashboardDemoScenario,
  isDashboardDemoScenarioId,
  type DashboardDemoScenarioId,
} from "./dashboardDemoScenarios";

export interface DashboardDemoModeState {
  enabled: boolean;
  scenarioId: DashboardDemoScenarioId | null;
  scenarioLabel: string | null;
  indicatorLabel: string | null;
  anchorIso: string | null;
}

function parseEnvBoolean(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

function readDashboardDemoCapability(): boolean {
  return parseEnvBoolean(
    import.meta.env.VITE_AURA_DASHBOARD_ANALYTICS_DEMO_ENABLED,
  );
}

export function isDashboardDemoCapabilityEnabled(): boolean {
  return readDashboardDemoCapability();
}

export function resolveDashboardDemoMode(search: string): DashboardDemoModeState {
  if (!readDashboardDemoCapability()) {
    return {
      enabled: false,
      scenarioId: null,
      scenarioLabel: null,
      indicatorLabel: null,
      anchorIso: null,
    };
  }

  const params = new URLSearchParams(search);
  const candidateScenarioId = params.get("dashboardDemo");

  if (!isDashboardDemoScenarioId(candidateScenarioId)) {
    return {
      enabled: false,
      scenarioId: null,
      scenarioLabel: null,
      indicatorLabel: null,
      anchorIso: null,
    };
  }

  const scenario = getDashboardDemoScenario(candidateScenarioId);

  return {
    enabled: true,
    scenarioId: candidateScenarioId,
    scenarioLabel: scenario.label,
    indicatorLabel: scenario.indicatorLabel,
    anchorIso: scenario.anchorIso,
  };
}
