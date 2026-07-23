import { create } from "zustand";

import { deleteHost, listHosts, saveHost } from "@/lib/ipc";
import type { Host } from "@/types";

interface HostsState {
  hosts: Host[];
  loaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  save: (host: Host) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useHosts = create<HostsState>((set) => ({
  hosts: [],
  loaded: false,
  error: null,

  load: async () => {
    try {
      const hosts = await listHosts();
      set({ hosts, loaded: true, error: null });
    } catch (e) {
      set({ loaded: true, error: String(e) });
    }
  },

  save: async (host) => {
    const saved = await saveHost(host);
    set((s) => {
      const idx = s.hosts.findIndex((h) => h.id === saved.id);
      const hosts =
        idx >= 0
          ? s.hosts.map((h) => (h.id === saved.id ? saved : h))
          : [...s.hosts, saved];
      return { hosts };
    });
  },

  remove: async (id) => {
    await deleteHost(id);
    set((s) => ({ hosts: s.hosts.filter((h) => h.id !== id) }));
  },
}));
