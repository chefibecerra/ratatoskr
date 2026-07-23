import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

import { useHosts } from "@/stores/hosts";
import { useLibrary } from "@/stores/library";

export type VaultStatus = "loading" | "uninitialized" | "locked" | "unlocked";

interface VaultState {
  status: VaultStatus;
  check: () => Promise<void>;
  create: (password: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  lock: () => Promise<void>;
}

async function loadVaultData() {
  await Promise.all([
    useHosts.getState().load(),
    useLibrary.getState().loadSnippets(),
  ]);
}

export const useVault = create<VaultState>((set) => ({
  status: "loading",

  check: async () => {
    const status = await invoke<VaultStatus>("vault_status").catch(
      () => "uninitialized" as const,
    );
    set({ status });
    if (status === "unlocked") await loadVaultData();
  },

  create: async (password) => {
    await invoke("vault_create", { password });
    set({ status: "unlocked" });
    await loadVaultData();
  },

  unlock: async (password) => {
    await invoke("vault_unlock", { password });
    set({ status: "unlocked" });
    await loadVaultData();
  },

  lock: async () => {
    await invoke("vault_lock").catch(() => {});
    set({ status: "locked" });
  },
}));
