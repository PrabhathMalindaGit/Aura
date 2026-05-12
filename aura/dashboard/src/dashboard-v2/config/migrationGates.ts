export type DashboardV2RouteId =
  | 'dashboard'
  | 'worklist'
  | 'communication'
  | 'patients'
  | 'patient-workspace'
  | 'alerts'
  | 'insights'
  | 'appointments'
  | 'settings';

export interface DashboardV2Gates {
  shell: boolean;
  routes: Record<DashboardV2RouteId, boolean>;
}

interface DashboardV2GateOverrides {
  shell?: boolean;
  routes?: Partial<Record<DashboardV2RouteId, boolean>>;
}

export const DASHBOARD_V2_ROUTE_IDS: DashboardV2RouteId[] = [
  'dashboard',
  'worklist',
  'communication',
  'patients',
  'patient-workspace',
  'alerts',
  'insights',
  'appointments',
  'settings',
];

export const DASHBOARD_V2_GATES_STORAGE_KEY = 'aura_dashboard_v2_gates';

const DEFAULT_ROUTES: Record<DashboardV2RouteId, boolean> = {
  dashboard: true,
  worklist: true,
  communication: true,
  patients: true,
  'patient-workspace': true,
  alerts: true,
  insights: true,
  appointments: true,
  settings: true,
};

const PATIENT_WORKSPACE_ROUTE_PATTERN =
  /^\/patients\/(?!compare(?:\/|$))[^/]+(?:\/(?:overview|communications|guidance|history))?\/?$/;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function isRouteId(value: unknown): value is DashboardV2RouteId {
  return typeof value === 'string' && DASHBOARD_V2_ROUTE_IDS.includes(value as DashboardV2RouteId);
}

function isExplicitBoolean(value: unknown): value is boolean {
  return value === true || value === false;
}

function normalizeRoutes(
  value: unknown,
  fallback: Record<DashboardV2RouteId, boolean>,
): Record<DashboardV2RouteId, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...fallback };
  }

  const candidate = value as Partial<Record<DashboardV2RouteId, unknown>>;

  return DASHBOARD_V2_ROUTE_IDS.reduce<Record<DashboardV2RouteId, boolean>>((accumulator, routeId) => {
    accumulator[routeId] = isExplicitBoolean(candidate[routeId])
      ? candidate[routeId]
      : fallback[routeId];
    return accumulator;
  }, { ...fallback });
}

function normalizeRouteOverrides(value: unknown): Partial<Record<DashboardV2RouteId, boolean>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const candidate = value as Partial<Record<DashboardV2RouteId, unknown>>;

  return DASHBOARD_V2_ROUTE_IDS.reduce<Partial<Record<DashboardV2RouteId, boolean>>>(
    (accumulator, routeId) => {
      if (isExplicitBoolean(candidate[routeId])) {
        accumulator[routeId] = candidate[routeId];
      }

      return accumulator;
    },
    {},
  );
}

function normalizeGateOverrides(value: unknown): DashboardV2GateOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const candidate = value as Partial<Record<keyof DashboardV2Gates, unknown>>;
  const routes = normalizeRouteOverrides(candidate.routes);
  const overrides: DashboardV2GateOverrides = {};

  if (isExplicitBoolean(candidate.shell)) {
    overrides.shell = candidate.shell;
  }

  if (Object.keys(routes).length > 0) {
    overrides.routes = routes;
  }

  return overrides;
}

function parseEnvBoolean(value: unknown): boolean | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  return undefined;
}

function parseEnvRouteOverrides(value: unknown): Partial<Record<DashboardV2RouteId, boolean>> {
  if (typeof value !== 'string') {
    return {};
  }

  return value
    .split(',')
    .map((token) => token.trim())
    .reduce<Partial<Record<DashboardV2RouteId, boolean>>>((accumulator, token) => {
      if (!token) {
        return accumulator;
      }

      let rawRouteId = token;
      let override: boolean | undefined;

      if (token.startsWith('!') || token.startsWith('-')) {
        rawRouteId = token.slice(1).trim();
        override = false;
      } else {
        const [candidateRouteId, candidateValue] = token.split('=');
        if (candidateValue !== undefined) {
          rawRouteId = candidateRouteId.trim();
          override = parseEnvBoolean(candidateValue);
        } else {
          override = true;
        }
      }

      if (override === undefined || !isRouteId(rawRouteId)) {
        return accumulator;
      }

      accumulator[rawRouteId] = override;
      return accumulator;
    }, {});
}

function readEnvGateOverrides(): DashboardV2GateOverrides {
  const shell = parseEnvBoolean(import.meta.env['VITE_AURA_DASHBOARD_V2_SHELL']);
  const routes = parseEnvRouteOverrides(import.meta.env['VITE_AURA_DASHBOARD_V2_ROUTES']);
  const overrides: DashboardV2GateOverrides = {};

  if (shell !== undefined) {
    overrides.shell = shell;
  }

  if (Object.keys(routes).length > 0) {
    overrides.routes = routes;
  }

  return overrides;
}

function resolveGates(
  defaults: DashboardV2Gates,
  envOverrides: DashboardV2GateOverrides,
  localOverrides: DashboardV2GateOverrides,
): DashboardV2Gates {
  return {
    shell: localOverrides.shell ?? envOverrides.shell ?? defaults.shell,
    routes: DASHBOARD_V2_ROUTE_IDS.reduce<Record<DashboardV2RouteId, boolean>>((accumulator, routeId) => {
      accumulator[routeId] =
        localOverrides.routes?.[routeId] ??
        envOverrides.routes?.[routeId] ??
        defaults.routes[routeId];
      return accumulator;
    }, { ...defaults.routes }),
  };
}

export function getDefaultDashboardV2Gates(): DashboardV2Gates {
  return {
    shell: true,
    routes: { ...DEFAULT_ROUTES },
  };
}

export function readDashboardV2Gates(): DashboardV2Gates {
  const defaults = getDefaultDashboardV2Gates();
  const envOverrides = readEnvGateOverrides();

  if (!isBrowser()) {
    return resolveGates(defaults, envOverrides, {});
  }

  try {
    const raw = window.localStorage.getItem(DASHBOARD_V2_GATES_STORAGE_KEY);
    if (!raw) {
      return resolveGates(defaults, envOverrides, {});
    }

    const storedOverrides = normalizeGateOverrides(JSON.parse(raw));
    return resolveGates(defaults, envOverrides, storedOverrides);
  } catch {
    return resolveGates(defaults, envOverrides, {});
  }
}

export function writeDashboardV2Gates(gates: DashboardV2Gates): DashboardV2Gates {
  const normalized = {
    shell: isExplicitBoolean(gates.shell) ? gates.shell : false,
    routes: normalizeRoutes(gates.routes, getDefaultDashboardV2Gates().routes),
  };

  if (!isBrowser()) {
    return normalized;
  }

  try {
    window.localStorage.setItem(DASHBOARD_V2_GATES_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    return normalized;
  }

  return normalized;
}

export function clearDashboardV2Gates(): void {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.removeItem(DASHBOARD_V2_GATES_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures during tests.
  }
}

export function resolveDashboardV2RouteId(pathname: string): DashboardV2RouteId | null {
  if (pathname.startsWith('/dashboard')) {
    return 'dashboard';
  }

  if (pathname.startsWith('/worklist')) {
    return 'worklist';
  }

  if (pathname.startsWith('/communication')) {
    return 'communication';
  }

  if (
    pathname === '/patients' ||
    pathname === '/patients/' ||
    pathname === '/patients/compare' ||
    pathname === '/patients/compare/'
  ) {
    return 'patients';
  }

  if (pathname.startsWith('/alerts')) {
    return 'alerts';
  }

  if (pathname.startsWith('/insights')) {
    return 'insights';
  }

  if (pathname.startsWith('/appointments')) {
    return 'appointments';
  }

  if (pathname.startsWith('/settings')) {
    return 'settings';
  }

  if (PATIENT_WORKSPACE_ROUTE_PATTERN.test(pathname)) {
    return 'patient-workspace';
  }

  return null;
}

export function isDashboardV2RouteEnabled(routeId: DashboardV2RouteId): boolean {
  return readDashboardV2Gates().routes[routeId];
}

export function isDashboardV2ExperienceEnabled(routeId: DashboardV2RouteId): boolean {
  const gates = readDashboardV2Gates();
  return gates.shell && gates.routes[routeId];
}

export function shouldUseDashboardV2Shell(pathname: string): boolean {
  const routeId = resolveDashboardV2RouteId(pathname);
  if (!routeId) {
    return false;
  }

  return isDashboardV2ExperienceEnabled(routeId);
}

export function resetDashboardV2GatesForTests(): void {
  clearDashboardV2Gates();
}
