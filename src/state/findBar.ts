import { create } from "zustand";

type FindBarMode = "find" | "replace";

interface FindBarState {
  open: boolean;
  mode: FindBarMode;
  show: (mode: FindBarMode) => void;
  hide: () => void;
}

export const useFindBar = create<FindBarState>((set) => ({
  open: false,
  mode: "find",
  show: (mode) => set({ open: true, mode }),
  hide: () => set({ open: false }),
}));

export function openFindBar(mode: FindBarMode) {
  useFindBar.getState().show(mode);
}
