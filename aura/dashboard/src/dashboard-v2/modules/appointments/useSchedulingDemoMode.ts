import { useLocation, useNavigate } from 'react-router-dom';

export interface SchedulingDemoModeState {
  capabilityEnabled: boolean;
  enabled: boolean;
  indicatorLabel: string | null;
}

function parseEnvBoolean(value: unknown): boolean {
  return typeof value === 'string' && value.trim().toLowerCase() === 'true';
}

export function isSchedulingDemoCapabilityEnabled(): boolean {
  return parseEnvBoolean(import.meta.env.VITE_AURA_SCHEDULING_DEMO_ENABLED);
}

export function resolveSchedulingDemoMode(search: string): SchedulingDemoModeState {
  const capabilityEnabled = isSchedulingDemoCapabilityEnabled();
  const enabled = capabilityEnabled && new URLSearchParams(search).get('scheduleDemo') === '1';

  return {
    capabilityEnabled,
    enabled,
    indicatorLabel: enabled ? 'Synthetic scheduling demo' : null,
  };
}

export function useSchedulingDemoMode(): SchedulingDemoModeState & { toggleDemoMode: () => void } {
  const location = useLocation();
  const navigate = useNavigate();
  const state = resolveSchedulingDemoMode(location.search);

  function toggleDemoMode(): void {
    if (!state.capabilityEnabled) {
      return;
    }

    const params = new URLSearchParams(location.search);
    if (state.enabled) {
      params.delete('scheduleDemo');
    } else {
      params.set('scheduleDemo', '1');
    }

    const search = params.toString();
    navigate({
      pathname: location.pathname,
      search: search ? `?${search}` : '',
      hash: location.hash,
    });
  }

  return {
    ...state,
    toggleDemoMode,
  };
}
