import { create } from "zustand";

interface TableInsertState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useTableInsert = create<TableInsertState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

export function openTableInsert() {
  useTableInsert.getState().show();
}
