import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearDashboardV2Gates,
  getDefaultDashboardV2Gates,
  isDashboardV2RouteEnabled,
  readDashboardV2Gates,
  resolveDashboardV2RouteId,
  shouldUseDashboardV2Shell,
  writeDashboardV2Gates,
} from './migrationGates';

describe('dashboard v2 migration gates', () => {
  afterEach(() => {
    clearDashboardV2Gates();
    vi.unstubAllEnvs();
  });

  it('defaults the completed dashboard routes and shell to the v2 experience', () => {
    expect(readDashboardV2Gates()).toEqual({
      shell: true,
      routes: {
        dashboard: true,
        worklist: true,
        communication: true,
        patients: true,
        'patient-workspace': true,
        alerts: true,
        insights: true,
        appointments: true,
        settings: true,
      },
    });
  });

  it('resolves the patients roster and patient workspace only for the approved core patient paths', () => {
    expect(resolveDashboardV2RouteId('/patients')).toBe('patients');
    expect(resolveDashboardV2RouteId('/patients/p1')).toBe('patient-workspace');
    expect(resolveDashboardV2RouteId('/patients/p1/history')).toBe('patient-workspace');
    expect(resolveDashboardV2RouteId('/patients/compare')).toBeNull();
    expect(resolveDashboardV2RouteId('/patients/p1/plan')).toBeNull();
  });

  it('supports explicit false local overrides while leaving other completed routes on v2', () => {
    const defaults = getDefaultDashboardV2Gates();

    writeDashboardV2Gates({
      ...defaults,
      routes: {
        ...defaults.routes,
        worklist: false,
      },
    });

    expect(isDashboardV2RouteEnabled('worklist')).toBe(false);
    expect(isDashboardV2RouteEnabled('dashboard')).toBe(true);
    expect(shouldUseDashboardV2Shell('/worklist')).toBe(false);
    expect(shouldUseDashboardV2Shell('/patients/p1/plan')).toBe(false);
  });

  it('supports explicit shell rollback across completed routes', () => {
    const defaults = getDefaultDashboardV2Gates();

    writeDashboardV2Gates({
      ...defaults,
      shell: false,
    });

    expect(isDashboardV2RouteEnabled('dashboard')).toBe(true);
    expect(shouldUseDashboardV2Shell('/dashboard')).toBe(false);
    expect(shouldUseDashboardV2Shell('/worklist')).toBe(false);
  });

  it('supports explicit false env overrides for completed routes', () => {
    vi.stubEnv('VITE_AURA_DASHBOARD_V2_ROUTES', '!dashboard,communication=false');

    expect(readDashboardV2Gates().routes.dashboard).toBe(false);
    expect(readDashboardV2Gates().routes.communication).toBe(false);
    expect(readDashboardV2Gates().routes.alerts).toBe(true);
    expect(shouldUseDashboardV2Shell('/dashboard')).toBe(false);
  });

  it('prefers local overrides over env overrides', () => {
    const defaults = getDefaultDashboardV2Gates();
    vi.stubEnv('VITE_AURA_DASHBOARD_V2_ROUTES', '!dashboard');

    writeDashboardV2Gates({
      ...defaults,
      routes: {
        ...defaults.routes,
        dashboard: true,
      },
    });

    expect(readDashboardV2Gates().routes.dashboard).toBe(true);
    expect(shouldUseDashboardV2Shell('/dashboard')).toBe(true);
  });
});
