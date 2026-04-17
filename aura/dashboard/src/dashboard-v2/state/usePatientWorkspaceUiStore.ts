import { create } from 'zustand';

export type PatientWorkspaceSupportView = 'coordination' | 'workflow' | 'governance';

interface PatientWorkspaceUiState {
  supportDrawerOpen: boolean;
  activeSupportView: PatientWorkspaceSupportView;
  selectedHistoryDate: string | null;
  setSupportDrawerOpen: (value: boolean) => void;
  setActiveSupportView: (value: PatientWorkspaceSupportView) => void;
  setSelectedHistoryDate: (value: string | null) => void;
  reset: () => void;
}

const initialState = {
  supportDrawerOpen: false,
  activeSupportView: 'coordination' as PatientWorkspaceSupportView,
  selectedHistoryDate: null,
};

export const usePatientWorkspaceUiStore = create<PatientWorkspaceUiState>((set) => ({
  ...initialState,
  setSupportDrawerOpen: (value) => set({ supportDrawerOpen: value }),
  setActiveSupportView: (value) => set({ activeSupportView: value }),
  setSelectedHistoryDate: (value) => set({ selectedHistoryDate: value }),
  reset: () => set({ ...initialState }),
}));

export function resetPatientWorkspaceUiStore(): void {
  usePatientWorkspaceUiStore.getState().reset();
}
