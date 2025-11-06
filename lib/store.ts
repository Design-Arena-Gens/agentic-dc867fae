import { create } from 'zustand';

interface User {
  id: string;
  username: string;
  balance: number;
}

interface Store {
  user: User | null;
  setUser: (user: User) => void;
}

export const useStore = create<Store>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));
