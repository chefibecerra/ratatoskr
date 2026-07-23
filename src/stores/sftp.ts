import { create } from "zustand";

import {
  sftpConnect,
  sftpDisconnect,
  sftpList,
  type SftpEntry,
} from "@/lib/ipc";
import type { Host } from "@/types";

interface SftpState {
  open: boolean;
  sftpId: string | null;
  host: Host | null;
  path: string;
  entries: SftpEntry[];
  loading: boolean;
  error: string | null;
  connect: (host: Host) => Promise<void>;
  navigate: (path: string) => Promise<void>;
  refresh: () => Promise<void>;
  close: () => Promise<void>;
}

export const useSftp = create<SftpState>((set, get) => ({
  open: false,
  sftpId: null,
  host: null,
  path: "/",
  entries: [],
  loading: false,
  error: null,

  connect: async (host) => {
    const sftpId = crypto.randomUUID();
    set({
      open: true,
      sftpId,
      host,
      path: "/",
      entries: [],
      loading: true,
      error: null,
    });
    try {
      const home = await sftpConnect(sftpId, host);
      set({ path: home });
      await get().refresh();
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  navigate: async (path) => {
    set({ path, loading: true, error: null });
    await get().refresh();
  },

  refresh: async () => {
    const { sftpId, path } = get();
    if (!sftpId) return;
    set({ loading: true });
    try {
      const entries = await sftpList(sftpId, path);
      set({ entries, loading: false, error: null });
    } catch (e) {
      set({ error: String(e), loading: false, entries: [] });
    }
  },

  close: async () => {
    const { sftpId } = get();
    if (sftpId) await sftpDisconnect(sftpId).catch(() => {});
    set({ open: false, sftpId: null, host: null, entries: [] });
  },
}));
