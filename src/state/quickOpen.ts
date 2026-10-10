import { create } from "zustand";

interface QuickOpenState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useQuickOpen = create<QuickOpenState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

export function openQuickOpen() {
  useQuickOpen.getState().show();
}
