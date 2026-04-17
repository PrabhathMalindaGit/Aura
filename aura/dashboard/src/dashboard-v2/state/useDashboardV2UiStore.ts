import { create } from 'zustand';

export type DashboardV2LayoutMode = 'workspace' | 'focus';

interface DashboardV2UiState {
  navCollapsed: boolean;
  navDrawerOpen: boolean;
  contextRailOpen: boolean;
  layoutMode: DashboardV2LayoutMode;
  setNavCollapsed: (value: boolean) => void;
  toggleNavCollapsed: () => void;
  setNavDrawerOpen: (value: boolean) => void;
  setContextRailOpen: (value: boolean) => void;
  setLayoutMode: (value: DashboardV2LayoutMode) => void;
  reset: () => void;
}

const initialState = {
  navCollapsed: false,
  navDrawerOpen: false,
  contextRailOpen: false,
  layoutMode: 'workspace' as DashboardV2LayoutMode,
};

export const useDashboardV2UiStore = create<DashboardV2UiState>((set) => ({
  ...initialState,
  setNavCollapsed: (value) => set({ navCollapsed: value }),
  toggleNavCollapsed: () => set((state) => ({ navCollapsed: !state.navCollapsed })),
  setNavDrawerOpen: (value) => set({ navDrawerOpen: value }),
  setContextRailOpen: (value) => set({ contextRailOpen: value }),
  setLayoutMode: (value) => set({ layoutMode: value }),
  reset: () => set({ ...initialState }),
}));

export function resetDashboardV2UiStore(): void {
  useDashboardV2UiStore.getState().reset();
}
