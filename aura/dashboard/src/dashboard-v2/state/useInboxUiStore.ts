import { create } from 'zustand';

export type InboxFocusMode = 'queue' | 'workspace';

interface InboxUiState {
  selectedThreadId: string | null;
  queueScrollTop: number;
  focusMode: InboxFocusMode;
  supportDrawerOpen: boolean;
  queueSheetOpen: boolean;
  setSelectedThreadId: (value: string | null) => void;
  setQueueScrollTop: (value: number) => void;
  setFocusMode: (value: InboxFocusMode) => void;
  setSupportDrawerOpen: (value: boolean) => void;
  setQueueSheetOpen: (value: boolean) => void;
  reset: () => void;
}

const initialState = {
  selectedThreadId: null,
  queueScrollTop: 0,
  focusMode: 'queue' as InboxFocusMode,
  supportDrawerOpen: false,
  queueSheetOpen: false,
};

export const useInboxUiStore = create<InboxUiState>((set) => ({
  ...initialState,
  setSelectedThreadId: (value) => set({ selectedThreadId: value }),
  setQueueScrollTop: (value) => set({ queueScrollTop: value }),
  setFocusMode: (value) => set({ focusMode: value }),
  setSupportDrawerOpen: (value) => set({ supportDrawerOpen: value }),
  setQueueSheetOpen: (value) => set({ queueSheetOpen: value }),
  reset: () => set({ ...initialState }),
}));

export function resetInboxUiStore(): void {
  useInboxUiStore.getState().reset();
}
