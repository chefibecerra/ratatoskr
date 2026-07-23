import { useEffect } from "react";

import { useSessions } from "@/stores/sessions";
import { useUi } from "@/stores/ui";
import { useVault } from "@/stores/vault";

/**
 * Atajos globales. Captura en window para ganarle a xterm:
 * ⌘T/⌘J/⌘K paleta · ⌘, preferencias · ⌘N nuevo host · ⌘W cerrar pestaña
 * ⌘F buscar en terminal · ⌘1-9 ir a pestaña · ⌃Tab ciclar pestañas
 */
export function useShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const ui = useUi.getState();
      const sessions = useSessions.getState();

      // ⌘⇧B alterna la barra de broadcast (envío a toda la flota)
      if (e.metaKey && e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        const ui = useUi.getState();
        ui.setBroadcastOpen(!ui.broadcastOpen);
        return;
      }

      if (e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey) {
        switch (e.key) {
          // ⌘T y ⌘J replican Termius; ⌘K queda como alias.
          case "k":
          case "t":
          case "j":
            e.preventDefault();
            ui.setPaletteOpen(!ui.paletteOpen);
            return;
          case ",":
            e.preventDefault();
            ui.setSettingsOpen(true);
            return;
          case "n":
            e.preventDefault();
            ui.openHostForm(null);
            return;
          case "f":
            if (sessions.activeId) {
              e.preventDefault();
              ui.setFindOpen(true);
            }
            return;
          case "l":
            e.preventDefault();
            void useVault.getState().lock();
            return;
          case "d":
            if (sessions.sessions.length > 1) {
              e.preventDefault();
              ui.setSplitView(!ui.splitView);
            }
            return;
          case "w":
            if (sessions.activeId) {
              e.preventDefault();
              sessions.requestClose(sessions.activeId);
            }
            return;
        }
        if (e.key >= "1" && e.key <= "9") {
          const target = sessions.sessions[Number(e.key) - 1];
          if (target) {
            e.preventDefault();
            sessions.setActive(target.id);
          }
          return;
        }
      }

      if (e.ctrlKey && e.key === "Tab") {
        const list = sessions.sessions;
        if (list.length < 2 || !sessions.activeId) return;
        e.preventDefault();
        const current = list.findIndex((s) => s.id === sessions.activeId);
        const next = e.shiftKey
          ? (current - 1 + list.length) % list.length
          : (current + 1) % list.length;
        sessions.setActive(list[next].id);
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);
}
