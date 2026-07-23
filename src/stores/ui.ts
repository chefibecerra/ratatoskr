import { create } from "zustand";

import type { Host, Snippet } from "@/types";

export type SidebarSection =
  | "hosts"
  | "keys"
  | "snippets"
  | "known-hosts"
  | "history";

interface UiState {
  sidebarSection: SidebarSection;
  settingsOpen: boolean;
  paletteOpen: boolean;
  findOpen: boolean;
  hostFormOpen: boolean;
  editingHost: Host | null;
  snippetFormOpen: boolean;
  editingSnippet: Snippet | null;
  /** sesión conectada esperando confirmación de cierre */
  confirmCloseSessionId: string | null;
  setSidebarSection: (section: SidebarSection) => void;
  setSettingsOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setFindOpen: (open: boolean) => void;
  openHostForm: (host: Host | null) => void;
  setHostFormOpen: (open: boolean) => void;
  openSnippetForm: (snippet: Snippet | null) => void;
  setSnippetFormOpen: (open: boolean) => void;
  setConfirmCloseSessionId: (id: string | null) => void;
}

export const useUi = create<UiState>((set) => ({
  sidebarSection: "hosts",
  settingsOpen: false,
  paletteOpen: false,
  findOpen: false,
  hostFormOpen: false,
  editingHost: null,
  snippetFormOpen: false,
  editingSnippet: null,
  confirmCloseSessionId: null,
  setSidebarSection: (section) => set({ sidebarSection: section }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setFindOpen: (open) => set({ findOpen: open }),
  openHostForm: (host) => set({ hostFormOpen: true, editingHost: host }),
  setHostFormOpen: (open) =>
    set((s) => ({
      hostFormOpen: open,
      editingHost: open ? s.editingHost : null,
    })),
  openSnippetForm: (snippet) =>
    set({ snippetFormOpen: true, editingSnippet: snippet }),
  setSnippetFormOpen: (open) =>
    set((s) => ({
      snippetFormOpen: open,
      editingSnippet: open ? s.editingSnippet : null,
    })),
  setConfirmCloseSessionId: (id) => set({ confirmCloseSessionId: id }),
}));
