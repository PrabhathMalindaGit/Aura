export const SEEN_ALERTS_STORAGE_PREFIX = 'aura_seen_alerts_v1';
export const ASSIGNMENTS_STORAGE_KEY = 'aura_alert_assignments_v1';
export const RISK_OVERRIDES_STORAGE_KEY = 'aura_risk_overrides_v1';
export const CLINICIAN_ID_STORAGE_KEY = 'aura_clinician_id';
export const CLINICIAN_NAME_STORAGE_KEY = 'aura_clinician_name';
export const CLINICIAN_PROFILE_STORAGE_PREFIX = 'aura_clinician_profile_v1';
export const SESSION_SETTINGS_STORAGE_KEY = 'aura_session_settings_v1';
export const WORKSPACE_STATE_STORAGE_PREFIX = 'aura_clinician_workspace_v1';
export const PATIENT_HANDOFF_WORKSPACE_STORAGE_KEY = 'aura_patient_handoff_workspace_v1';

const TOKEN_STORAGE_KEYS = ['aura_auth_token', 'aura_access_token', 'aura_refresh_token', 'clinicianToken'];

const DASHBOARD_SESSION_KEYS = [
  ASSIGNMENTS_STORAGE_KEY,
  RISK_OVERRIDES_STORAGE_KEY,
  CLINICIAN_ID_STORAGE_KEY,
  CLINICIAN_NAME_STORAGE_KEY,
  PATIENT_HANDOFF_WORKSPACE_STORAGE_KEY,
  ...TOKEN_STORAGE_KEYS,
] as const;

function removeMatchingKeys(
  storage: Storage,
  exactKeys: readonly string[],
  prefixKeys: readonly string[],
): string[] {
  const removed: string[] = [];
  const toRemove = new Set<string>();

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) {
      continue;
    }

    if (exactKeys.includes(key) || prefixKeys.some((prefix) => key.startsWith(prefix))) {
      toRemove.add(key);
    }
  }

  toRemove.forEach((key) => {
    storage.removeItem(key);
    removed.push(key);
  });

  return removed;
}

export interface ClearedDashboardSessionKeys {
  local: string[];
  session: string[];
}

export function clearDashboardSessionData(): ClearedDashboardSessionKeys {
  if (typeof window === 'undefined') {
    return { local: [], session: [] };
  }

  const prefixes = [SEEN_ALERTS_STORAGE_PREFIX];

  return {
    local: removeMatchingKeys(window.localStorage, DASHBOARD_SESSION_KEYS, prefixes),
    session: removeMatchingKeys(window.sessionStorage, DASHBOARD_SESSION_KEYS, prefixes),
  };
}

export function getDashboardSessionKeyPrefixes(): string[] {
  return [SEEN_ALERTS_STORAGE_PREFIX];
}

export function getDashboardSessionExactKeys(): string[] {
  return [...DASHBOARD_SESSION_KEYS];
}
