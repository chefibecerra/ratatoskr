import { EmptyState } from "@/components/EmptyState";
import { TerminalView } from "@/components/TerminalView";
import { useSessions } from "@/stores/sessions";
import { useUi } from "@/stores/ui";
import { cn } from "@/lib/utils";

function gridCols(count: number): string {
  if (count <= 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-2";
  if (count <= 4) return "grid-cols-2";
  if (count <= 6) return "grid-cols-3";
  return "grid-cols-3";
}

/**
 * Muestra la sesión activa a pantalla completa, o —en modo dividido— todas
 * las sesiones en una rejilla. Todas las instancias de xterm permanecen
 * montadas siempre; solo cambia cuáles se muestran (display:none para el resto).
 */
export function TerminalArea() {
  const sessions = useSessions((s) => s.sessions);
  const activeId = useSessions((s) => s.activeId);
  const setActive = useSessions((s) => s.setActive);
  const split = useUi((s) => s.splitView);

  if (sessions.length === 0) {
    return (
      <div className="relative flex-1 bg-terminal">
        <EmptyState />
      </div>
    );
  }

  const useSplit = split && sessions.length > 1;

  return (
    <div
      className={cn(
        "relative min-h-0 flex-1 bg-terminal",
        useSplit && cn("grid gap-px", gridCols(sessions.length)),
      )}
    >
      {sessions.map((session) => {
        const visible = useSplit || session.id === activeId;
        return (
          <div
            key={session.id}
            onMouseDownCapture={() => useSplit && setActive(session.id)}
            className={cn(
              "min-h-0 min-w-0",
              // único: cada terminal llena el área (absoluto); split: celda de rejilla
              useSplit ? "relative" : "absolute inset-0",
              visible ? "block" : "hidden",
              useSplit &&
                session.id === activeId &&
                "ring-1 ring-inset ring-primary/40",
            )}
          >
            <TerminalView session={session} active={session.id === activeId} />
          </div>
        );
      })}
    </div>
  );
}
