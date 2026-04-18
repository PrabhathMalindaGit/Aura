import { create } from 'zustand';

export type InsightsFocusMode = 'queue' | 'workspace';

interface InsightsUiState {
  selectedInsightId: string | null;
  queueScrollTop: number;
  focusMode: InsightsFocusMode;
  governanceOpen: boolean;
  queueSheetOpen: boolean;
  setSelectedInsightId: (value: string | null) => void;
  setQueueScrollTop: (value: number) => void;
  setFocusMode: (value: InsightsFocusMode) => void;
  setGovernanceOpen: (value: boolean) => void;
  setQueueSheetOpen: (value: boolean) => void;
  reset: () => void;
}

const initialState = {
  selectedInsightId: null,
  queueScrollTop: 0,
  focusMode: 'queue' as InsightsFocusMode,
  governanceOpen: false,
  queueSheetOpen: false,
};

export const useInsightsUiStore = create<InsightsUiState>((set) => ({
  ...initialState,
  setSelectedInsightId: (value) => set({ selectedInsightId: value }),
  setQueueScrollTop: (value) => set({ queueScrollTop: value }),
  setFocusMode: (value) => set({ focusMode: value }),
  setGovernanceOpen: (value) => set({ governanceOpen: value }),
  setQueueSheetOpen: (value) => set({ queueSheetOpen: value }),
  reset: () => set({ ...initialState }),
}));

export function resetInsightsUiStore(): void {
  useInsightsUiStore.getState().reset();
}
