import type { CheckInItem } from "@/src/api/patient";

let selectedCheckin: CheckInItem | null = null;

export function setSelectedCheckin(item: CheckInItem | null): void {
  selectedCheckin = item;
}

export function getSelectedCheckin(): CheckInItem | null {
  return selectedCheckin;
}

export function clearSelectedCheckin(): void {
  selectedCheckin = null;
}
