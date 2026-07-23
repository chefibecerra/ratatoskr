import { Channel } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";

import { sshConnect, sshDisconnect } from "@/lib/ipc";
import { useUi } from "@/stores/ui";
import type { Host, SessionStatus } from "@/types";

/**
 * Buffer entre el Channel de Tauri y la instancia de xterm: los primeros bytes
 * del servidor pueden llegar antes de que el terminal esté montado.
 */
export class SessionStream {
  private buffer: Uint8Array[] = [];
  private sink: ((data: Uint8Array) => void) | null = null;

  push(data: Uint8Array) {
    if (this.sink) {
      this.sink(data);
    } else {
      this.buffer.push(data);
    }
  }

  attach(cb: (data: Uint8Array) => void) {
    this.sink = cb;
    for (const chunk of this.buffer) cb(chunk);
    this.buffer = [];
  }

  detach() {
    this.sink = null;
  }
}

export interface Session {
  id: string;
  host: Host;
  title: string;
  status: SessionStatus;
  reason?: string;
  stream: SessionStream;
  /** evita doble invoke de ssh_connect para la misma sesión */
  starting: boolean;
}

interface SessionsState {
  sessions: Session[];
  activeId: string | null;
  connect: (host: Host) => void;
  /** dispara la conexión real con el tamaño medido del terminal */
  establish: (sessionId: string, cols: number, rows: number) => Promise<void>;
  reconnect: (sessionId: string) => void;
  /** cierra directo si no hay conexión viva; si la hay, pide confirmación */
  requestClose: (sessionId: string) => void;
  close: (sessionId: string) => Promise<void>;
  setActive: (sessionId: string) => void;
}

function openChannel(stream: SessionStream): Channel<ArrayBuffer> {
  const channel = new Channel<ArrayBuffer>();
  channel.onmessage = (data) => stream.push(new Uint8Array(data));
  return channel;
}

export const useSessions = create<SessionsState>((set, get) => {
  void listen<{ session_id: string; reason: string }>(
    "ssh-session-closed",
    ({ payload }) => {
      set((s) => ({
        sessions: s.sessions.map((session) =>
          session.id === payload.session_id && session.status !== "error"
            ? { ...session, status: "closed" as const, reason: payload.reason }
            : session,
        ),
      }));
    },
  );

  const patch = (sessionId: string, partial: Partial<Session>) =>
    set((s) => ({
      sessions: s.sessions.map((x) =>
        x.id === sessionId ? { ...x, ...partial } : x,
      ),
    }));

  return {
    sessions: [],
    activeId: null,

    connect: (host) => {
      const id = crypto.randomUUID();
      const session: Session = {
        id,
        host,
        title: host.name || host.hostname,
        status: "connecting",
        stream: new SessionStream(),
        starting: false,
      };
      set((s) => ({ sessions: [...s.sessions, session], activeId: id }));
    },

    establish: async (sessionId, cols, rows) => {
      const session = get().sessions.find((s) => s.id === sessionId);
      if (!session || session.status !== "connecting" || session.starting) {
        return;
      }
      patch(sessionId, { starting: true });

      try {
        await sshConnect(
          sessionId,
          session.host,
          cols,
          rows,
          openChannel(session.stream),
        );
        patch(sessionId, { status: "connected", starting: false });
      } catch (e) {
        patch(sessionId, {
          status: "error",
          reason: String(e),
          starting: false,
        });
      }
    },

    reconnect: (sessionId) => {
      patch(sessionId, {
        status: "connecting",
        reason: undefined,
        stream: new SessionStream(),
        starting: false,
      });
    },

    requestClose: (sessionId) => {
      const session = get().sessions.find((s) => s.id === sessionId);
      if (!session) return;
      if (session.status === "connected") {
        useUi.getState().setConfirmCloseSessionId(sessionId);
      } else {
        void get().close(sessionId);
      }
    },

    close: async (sessionId) => {
      const session = get().sessions.find((s) => s.id === sessionId);
      if (session && session.status === "connected") {
        await sshDisconnect(sessionId).catch(() => {});
      }
      set((s) => {
        const sessions = s.sessions.filter((x) => x.id !== sessionId);
        const activeId =
          s.activeId === sessionId
            ? (sessions[sessions.length - 1]?.id ?? null)
            : s.activeId;
        return { sessions, activeId };
      });
    },

    setActive: (sessionId) => set({ activeId: sessionId }),
  };
});
