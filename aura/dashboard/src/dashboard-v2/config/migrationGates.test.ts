import { afterEach, describe, expect, it } from 'vitest';
import {
  clearDashboardV2Gates,
  isDashboardV2RouteEnabled,
  readDashboardV2Gates,
  resolveDashboardV2RouteId,
  shouldUseDashboardV2Shell,
  writeDashboardV2Gates,
} from './migrationGates';

describe('dashboard v2 migration gates', () => {
  afterEach(() => {
    clearDashboardV2Gates();
  });

  it('defaults all shell and route gates to false', () => {
    expect(readDashboardV2Gates()).toEqual({
      shell: false,
      routes: {
        dashboard: false,
        worklist: false,
        communication: false,
        'patient-workspace': false,
        alerts: false,
        insights: false,
        appointments: false,
        settings: false,
      },
    });
  });

  it('resolves the patient workspace route only for the approved core patient paths', () => {
    expect(resolveDashboardV2RouteId('/patients/p1')).toBe('patient-workspace');
    expect(resolveDashboardV2RouteId('/patients/p1/history')).toBe('patient-workspace');
    expect(resolveDashboardV2RouteId('/patients/p1/plan')).toBeNull();
  });

  it('enables the v2 shell only for gated target routes', () => {
    writeDashboardV2Gates({
      shell: false,
      routes: {
        dashboard: false,
        worklist: true,
        communication: false,
        'patient-workspace': false,
        alerts: false,
        insights: false,
        appointments: false,
        settings: false,
      },
    });

    expect(isDashboardV2RouteEnabled('worklist')).toBe(true);
    expect(shouldUseDashboardV2Shell('/worklist')).toBe(true);
    expect(shouldUseDashboardV2Shell('/patients/p1/plan')).toBe(false);
  });
});
