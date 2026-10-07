import { create } from "zustand";

interface HistoryOverlayState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useHistoryOverlay = create<HistoryOverlayState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

export function openHistoryOverlay() {
  useHistoryOverlay.getState().show();
}
