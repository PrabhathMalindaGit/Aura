import { create } from 'zustand';

export type AppointmentsFocusMode = 'queue' | 'workspace';

interface AppointmentsUiState {
  selectedRequestId: string | null;
  requestScrollTop: number;
  focusMode: AppointmentsFocusMode;
  governanceOpen: boolean;
  requestSheetOpen: boolean;
  setSelectedRequestId: (value: string | null) => void;
  setRequestScrollTop: (value: number) => void;
  setFocusMode: (value: AppointmentsFocusMode) => void;
  setGovernanceOpen: (value: boolean) => void;
  setRequestSheetOpen: (value: boolean) => void;
  reset: () => void;
}

const initialState = {
  selectedRequestId: null,
  requestScrollTop: 0,
  focusMode: 'queue' as AppointmentsFocusMode,
  governanceOpen: false,
  requestSheetOpen: false,
};

export const useAppointmentsUiStore = create<AppointmentsUiState>((set) => ({
  ...initialState,
  setSelectedRequestId: (value) => set({ selectedRequestId: value }),
  setRequestScrollTop: (value) => set({ requestScrollTop: value }),
  setFocusMode: (value) => set({ focusMode: value }),
  setGovernanceOpen: (value) => set({ governanceOpen: value }),
  setRequestSheetOpen: (value) => set({ requestSheetOpen: value }),
  reset: () => set({ ...initialState }),
}));

export function resetAppointmentsUiStore(): void {
  useAppointmentsUiStore.getState().reset();
}
