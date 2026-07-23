import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useHosts } from "@/stores/hosts";
import { useLibrary } from "@/stores/library";
import { useSessions } from "@/stores/sessions";
import { cn } from "@/lib/utils";
import type { HistoryEntry } from "@/types";

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const host = useHosts((s) => s.hosts.find((h) => h.id === entry.host_id));
  const connect = useSessions((s) => s.connect);

  return (
    <button
      className="group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent/50 disabled:cursor-default disabled:hover:bg-transparent"
      disabled={!host}
      onClick={() => host && connect(host)}
      title={
        host
          ? `Conectar a ${entry.username}@${entry.hostname}`
          : "Este host ya no existe"
      }
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          entry.ok ? "bg-emerald-400/90" : "bg-red-400/90",
        )}
      />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[13px] leading-5 font-medium">
          {entry.host_name}
        </span>
        <span className="block truncate text-[10px] leading-4 text-muted-foreground">
          {entry.ok ? `${entry.username}@${entry.hostname}` : (entry.error ?? "falló")}
        </span>
      </div>
      <span className="shrink-0 text-[10px] text-muted-foreground/70">
        {relativeTime(entry.timestamp)}
      </span>
    </button>
  );
}

export function HistoryPanel() {
  const history = useLibrary((s) => s.history);
  const loadHistory = useLibrary((s) => s.loadHistory);
  const clear = useLibrary((s) => s.clearHistory);
  const sessions = useSessions((s) => s.sessions);

  // recarga al abrir el panel y cuando cambian las sesiones (nuevas conexiones)
  useEffect(() => {
    void loadHistory();
  }, [loadHistory, sessions.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1 px-2 pt-2">
        {history.length === 0 && (
          <div className="px-3 py-10 text-center text-xs leading-5 text-muted-foreground">
            Aún no hay conexiones registradas.
          </div>
        )}
        {history.map((entry) => (
          <HistoryRow key={entry.id} entry={entry} />
        ))}
      </ScrollArea>
      {history.length > 0 && (
        <div className="border-t border-border px-2 py-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-full justify-start text-xs text-muted-foreground"
            onClick={() => void clear()}
          >
            Limpiar historial
          </Button>
        </div>
      )}
    </div>
  );
}
