import { create } from 'zustand';

export type AlertsFocusMode = 'queue' | 'workspace';

interface AlertsUiState {
  selectedAlertId: string | null;
  queueScrollTop: number;
  focusMode: AlertsFocusMode;
  governanceOpen: boolean;
  queueSheetOpen: boolean;
  setSelectedAlertId: (value: string | null) => void;
  setQueueScrollTop: (value: number) => void;
  setFocusMode: (value: AlertsFocusMode) => void;
  setGovernanceOpen: (value: boolean) => void;
  setQueueSheetOpen: (value: boolean) => void;
  reset: () => void;
}

const initialState = {
  selectedAlertId: null,
  queueScrollTop: 0,
  focusMode: 'queue' as AlertsFocusMode,
  governanceOpen: false,
  queueSheetOpen: false,
};

export const useAlertsUiStore = create<AlertsUiState>((set) => ({
  ...initialState,
  setSelectedAlertId: (value) => set({ selectedAlertId: value }),
  setQueueScrollTop: (value) => set({ queueScrollTop: value }),
  setFocusMode: (value) => set({ focusMode: value }),
  setGovernanceOpen: (value) => set({ governanceOpen: value }),
  setQueueSheetOpen: (value) => set({ queueSheetOpen: value }),
  reset: () => set({ ...initialState }),
}));

export function resetAlertsUiStore(): void {
  useAlertsUiStore.getState().reset();
}
