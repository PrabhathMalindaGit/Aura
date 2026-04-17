export type DashboardV2RouteId =
  | 'dashboard'
  | 'worklist'
  | 'communication'
  | 'patient-workspace'
  | 'alerts'
  | 'insights'
  | 'appointments'
  | 'settings';

export interface DashboardV2Gates {
  shell: boolean;
  routes: Record<DashboardV2RouteId, boolean>;
}

export const DASHBOARD_V2_ROUTE_IDS: DashboardV2RouteId[] = [
  'dashboard',
  'worklist',
  'communication',
  'patient-workspace',
  'alerts',
  'insights',
  'appointments',
  'settings',
];

export const DASHBOARD_V2_GATES_STORAGE_KEY = 'aura_dashboard_v2_gates';

const DEFAULT_ROUTES: Record<DashboardV2RouteId, boolean> = {
  dashboard: false,
  worklist: false,
  communication: false,
  'patient-workspace': false,
  alerts: false,
  insights: false,
  appointments: false,
  settings: false,
};

const PATIENT_WORKSPACE_ROUTE_PATTERN =
  /^\/patients\/[^/]+(?:\/(?:overview|communications|guidance|history))?\/?$/;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function isRouteId(value: unknown): value is DashboardV2RouteId {
  return typeof value === 'string' && DASHBOARD_V2_ROUTE_IDS.includes(value as DashboardV2RouteId);
}

function toBoolean(value: unknown): boolean {
  return value === true;
}

function normalizeRoutes(
  value: unknown,
  fallback: Record<DashboardV2RouteId, boolean> = DEFAULT_ROUTES,
): Record<DashboardV2RouteId, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...fallback };
  }

  const candidate = value as Partial<Record<DashboardV2RouteId, unknown>>;

  return DASHBOARD_V2_ROUTE_IDS.reduce<Record<DashboardV2RouteId, boolean>>((accumulator, routeId) => {
    accumulator[routeId] = toBoolean(candidate[routeId]);
    return accumulator;
  }, { ...fallback });
}

function normalizeGates(value: unknown): DashboardV2Gates {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      shell: false,
      routes: { ...DEFAULT_ROUTES },
    };
  }

  const candidate = value as Partial<DashboardV2Gates>;

  return {
    shell: toBoolean(candidate.shell),
    routes: normalizeRoutes(candidate.routes),
  };
}

function parseEnvEnabledRoutes(value: unknown): DashboardV2RouteId[] {
  if (typeof value !== 'string') {
    return [];
  }

  return value
    .split(',')
    .map((token) => token.trim())
    .filter((token): token is DashboardV2RouteId => isRouteId(token));
}

function readEnvGates(): DashboardV2Gates {
  const enabledRoutes = parseEnvEnabledRoutes(import.meta.env['VITE_AURA_DASHBOARD_V2_ROUTES']);
  const shell = import.meta.env['VITE_AURA_DASHBOARD_V2_SHELL'] === 'true';
  const routes = enabledRoutes.reduce<Record<DashboardV2RouteId, boolean>>((accumulator, routeId) => {
    accumulator[routeId] = true;
    return accumulator;
  }, { ...DEFAULT_ROUTES });

  return {
    shell,
    routes,
  };
}

function mergeGates(left: DashboardV2Gates, right: DashboardV2Gates): DashboardV2Gates {
  return {
    shell: left.shell || right.shell,
    routes: DASHBOARD_V2_ROUTE_IDS.reduce<Record<DashboardV2RouteId, boolean>>((accumulator, routeId) => {
      accumulator[routeId] = left.routes[routeId] || right.routes[routeId];
      return accumulator;
    }, { ...DEFAULT_ROUTES }),
  };
}

export function getDefaultDashboardV2Gates(): DashboardV2Gates {
  return {
    shell: false,
    routes: { ...DEFAULT_ROUTES },
  };
}

export function readDashboardV2Gates(): DashboardV2Gates {
  const envGates = readEnvGates();

  if (!isBrowser()) {
    return envGates;
  }

  try {
    const raw = window.localStorage.getItem(DASHBOARD_V2_GATES_STORAGE_KEY);
    if (!raw) {
      return envGates;
    }

    const storedGates = normalizeGates(JSON.parse(raw));
    return mergeGates(envGates, storedGates);
  } catch {
    return envGates;
  }
}

export function writeDashboardV2Gates(gates: DashboardV2Gates): DashboardV2Gates {
  const normalized = normalizeGates(gates);

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

export function shouldUseDashboardV2Shell(pathname: string): boolean {
  const routeId = resolveDashboardV2RouteId(pathname);
  if (!routeId) {
    return false;
  }

  const gates = readDashboardV2Gates();
  return gates.shell || gates.routes[routeId];
}

export function resetDashboardV2GatesForTests(): void {
  clearDashboardV2Gates();
}
