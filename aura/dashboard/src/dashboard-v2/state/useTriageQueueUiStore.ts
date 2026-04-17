import { create } from 'zustand';

export type TriageQueueFocusMode = 'queue' | 'workspace';

interface TriageQueueUiState {
  selectedCaseKey: string | null;
  queueScrollTop: number;
  focusMode: TriageQueueFocusMode;
  governanceOpen: boolean;
  queueSheetOpen: boolean;
  setSelectedCaseKey: (value: string | null) => void;
  setQueueScrollTop: (value: number) => void;
  setFocusMode: (value: TriageQueueFocusMode) => void;
  setGovernanceOpen: (value: boolean) => void;
  setQueueSheetOpen: (value: boolean) => void;
  reset: () => void;
}

const initialState = {
  selectedCaseKey: null,
  queueScrollTop: 0,
  focusMode: 'queue' as TriageQueueFocusMode,
  governanceOpen: false,
  queueSheetOpen: false,
};

export const useTriageQueueUiStore = create<TriageQueueUiState>((set) => ({
  ...initialState,
  setSelectedCaseKey: (value) => set({ selectedCaseKey: value }),
  setQueueScrollTop: (value) => set({ queueScrollTop: value }),
  setFocusMode: (value) => set({ focusMode: value }),
  setGovernanceOpen: (value) => set({ governanceOpen: value }),
  setQueueSheetOpen: (value) => set({ queueSheetOpen: value }),
  reset: () => set({ ...initialState }),
}));

export function resetTriageQueueUiStore(): void {
  useTriageQueueUiStore.getState().reset();
}
