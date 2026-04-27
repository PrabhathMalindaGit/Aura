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

interface DashboardDemoEnvironment {
  readonly DEV?: boolean;
  readonly VITE_AURA_DASHBOARD_ANALYTICS_DEMO_ENABLED?: unknown;
}

function parseEnvBoolean(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

function createDisabledDemoMode(): DashboardDemoModeState {
  return {
    enabled: false,
    scenarioId: null,
    scenarioLabel: null,
    indicatorLabel: null,
    anchorIso: null,
  };
}

function readDashboardDemoCapability(
  env: DashboardDemoEnvironment = import.meta.env,
): boolean {
  return (
    env.DEV === true &&
    parseEnvBoolean(env.VITE_AURA_DASHBOARD_ANALYTICS_DEMO_ENABLED)
  );
}

export function isDashboardDemoCapabilityEnabled(
  env: DashboardDemoEnvironment = import.meta.env,
): boolean {
  return readDashboardDemoCapability(env);
}

export function resolveDashboardDemoMode(
  search: string,
  env: DashboardDemoEnvironment = import.meta.env,
): DashboardDemoModeState {
  if (!readDashboardDemoCapability(env)) {
    return createDisabledDemoMode();
  }

  const params = new URLSearchParams(search);
  const candidateScenarioId = params.get("dashboardDemo");

  if (!isDashboardDemoScenarioId(candidateScenarioId)) {
    return createDisabledDemoMode();
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
