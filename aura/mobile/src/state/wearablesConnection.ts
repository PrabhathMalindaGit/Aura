import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "aura:wearablesConnected:v1:";

function storageKey(patientId: string): string {
  return `${PREFIX}${patientId}`;
}

function normalizeBoolean(value: string | null): boolean {
  return value === "1";
}

export async function getWearablesConnected(patientId: string): Promise<boolean> {
  if (!patientId.trim()) {
    return false;
  }
  try {
    const value = await AsyncStorage.getItem(storageKey(patientId));
    return normalizeBoolean(value);
  } catch {
    return false;
  }
}

export async function setWearablesConnected(
  patientId: string,
  connected: boolean
): Promise<void> {
  if (!patientId.trim()) {
    return;
  }
  await AsyncStorage.setItem(storageKey(patientId), connected ? "1" : "0");
}

export async function clearWearablesConnected(patientId: string): Promise<void> {
  if (!patientId.trim()) {
    return;
  }
  await AsyncStorage.removeItem(storageKey(patientId));
}
