import { create } from "zustand";

import {
  clearHistory,
  deleteSnippet,
  forgetKnownHost,
  listHistory,
  listKnownHosts,
  listSnippets,
  listSshKeys,
  saveSnippet,
} from "@/lib/ipc";
import type { HistoryEntry, KnownHost, Snippet, SshKey } from "@/types";

/**
 * Datos de la "biblioteca" (claves, fragmentos, historial), el equivalente
 * al Vault/Keychain de Termius. Fase 2 los mueve al vault cifrado.
 */
interface LibraryState {
  keys: SshKey[];
  snippets: Snippet[];
  history: HistoryEntry[];
  knownHosts: KnownHost[];
  loadKeys: () => Promise<void>;
  loadSnippets: () => Promise<void>;
  loadHistory: () => Promise<void>;
  loadKnownHosts: () => Promise<void>;
  saveSnippet: (snippet: Snippet) => Promise<void>;
  removeSnippet: (id: string) => Promise<void>;
  forgetKnownHost: (host: string) => Promise<void>;
  clearHistory: () => Promise<void>;
}

export const useLibrary = create<LibraryState>((set) => ({
  keys: [],
  snippets: [],
  history: [],
  knownHosts: [],

  loadKeys: async () => {
    set({ keys: await listSshKeys().catch(() => []) });
  },

  loadKnownHosts: async () => {
    set({ knownHosts: await listKnownHosts().catch(() => []) });
  },

  forgetKnownHost: async (host) => {
    await forgetKnownHost(host);
    set((s) => ({ knownHosts: s.knownHosts.filter((k) => k.host !== host) }));
  },

  loadSnippets: async () => {
    set({ snippets: await listSnippets().catch(() => []) });
  },

  loadHistory: async () => {
    set({ history: await listHistory().catch(() => []) });
  },

  saveSnippet: async (snippet) => {
    const saved = await saveSnippet(snippet);
    set((s) => {
      const exists = s.snippets.some((x) => x.id === saved.id);
      return {
        snippets: exists
          ? s.snippets.map((x) => (x.id === saved.id ? saved : x))
          : [...s.snippets, saved],
      };
    });
  },

  removeSnippet: async (id) => {
    await deleteSnippet(id);
    set((s) => ({ snippets: s.snippets.filter((x) => x.id !== id) }));
  },

  clearHistory: async () => {
    await clearHistory();
    set({ history: [] });
  },
}));
