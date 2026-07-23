import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { tunnelClose, tunnelOpen, type TunnelKind } from "@/lib/ipc";
import type { Host } from "@/types";

/** Definición persistida de un túnel; el estado "activo" es efímero. */
export interface TunnelDef {
  id: string;
  hostId: string;
  label: string;
  /** local (-L), remote (-R) o dynamic (-D, SOCKS). Ausente = local (legado). */
  kind?: TunnelKind;
  localPort: number;
  remoteHost: string;
  remotePort: number;
}

interface TunnelsState {
  tunnels: TunnelDef[];
  active: Record<string, boolean>;
  error: Record<string, string>;
  add: (def: Omit<TunnelDef, "id">) => void;
  remove: (id: string) => void;
  start: (def: TunnelDef, host: Host) => Promise<void>;
  stop: (id: string) => Promise<void>;
}

export const useTunnels = create<TunnelsState>()(
  persist(
    (set) => {
      void listen<{ tunnel_id: string; reason: string }>(
        "tunnel-closed",
        ({ payload }) => {
          set((s) => ({
            active: { ...s.active, [payload.tunnel_id]: false },
          }));
        },
      );

      return {
        tunnels: [],
        active: {},
        error: {},

        add: (def) =>
          set((s) => ({
            tunnels: [...s.tunnels, { ...def, id: crypto.randomUUID() }],
          })),

        remove: (id) => {
          void tunnelClose(id).catch(() => {});
          set((s) => ({ tunnels: s.tunnels.filter((t) => t.id !== id) }));
        },

        start: async (def, host) => {
          set((s) => ({ error: { ...s.error, [def.id]: "" } }));
          try {
            await tunnelOpen(
              def.id,
              def.kind ?? "local",
              host,
              def.localPort,
              def.remoteHost,
              def.remotePort,
            );
            set((s) => ({ active: { ...s.active, [def.id]: true } }));
          } catch (e) {
            set((s) => ({
              active: { ...s.active, [def.id]: false },
              error: { ...s.error, [def.id]: String(e) },
            }));
          }
        },

        stop: async (id) => {
          await tunnelClose(id).catch(() => {});
          set((s) => ({ active: { ...s.active, [id]: false } }));
        },
      };
    },
    {
      name: "ratatoskr-tunnels",
      // solo persistimos las definiciones; lo activo se recalcula por sesión
      partialize: (s) => ({ tunnels: s.tunnels }) as TunnelsState,
    },
  ),
);
