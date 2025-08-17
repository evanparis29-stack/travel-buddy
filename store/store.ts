import { create } from "zustand";

type Store = {
  passports: string[];
  primaryPassport: string | null;
  addPassport: (p: string) => void;
  removePassport: (p: string) => void;
  setPrimaryPassport: (p: string) => void;
};

const useStore = create<Store>((set) => ({
  passports: [],
  primaryPassport: null,
  addPassport: (p) =>
    set((state) => {
      if (state.passports.includes(p)) return state; // avoid duplicates
      return { passports: [...state.passports, p] };
    }),
  removePassport: (p) =>
    set((state) => ({
      passports: state.passports.filter((x) => x !== p),
      primaryPassport:
        state.primaryPassport === p ? null : state.primaryPassport,
    })),
  setPrimaryPassport: (p) => set(() => ({ primaryPassport: p })),
}));

export default useStore;
