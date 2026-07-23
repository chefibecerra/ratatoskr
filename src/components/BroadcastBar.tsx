import { useState } from "react";
import { Radio, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSessions } from "@/stores/sessions";
import { useUi } from "@/stores/ui";

/**
 * Barra para enviar un comando a todas las sesiones conectadas a la vez.
 * Pensada para operar una flota de servidores de golpe.
 */
export function BroadcastBar() {
  const open = useUi((s) => s.broadcastOpen);
  const setOpen = useUi((s) => s.setBroadcastOpen);
  const broadcast = useSessions((s) => s.broadcast);
  const liveCount = useSessions(
    (s) => s.sessions.filter((x) => x.status === "connected").length,
  );
  const [command, setCommand] = useState("");

  if (!open) return null;

  const send = () => {
    if (!command.trim()) return;
    broadcast(command);
    setCommand("");
  };

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-yellow-500/[0.06] px-3 duration-200 animate-in slide-in-from-top-1">
      <Radio className="size-4 shrink-0 text-yellow-500/80" />
      <span className="shrink-0 text-[11px] text-muted-foreground">
        A {liveCount} sesion{liveCount === 1 ? "" : "es"}
      </span>
      <Input
        autoFocus
        placeholder="Comando para todas las sesiones conectadas…"
        className="h-7 flex-1 border-transparent bg-transparent font-mono text-xs shadow-none focus-visible:ring-0"
        value={command}
        onChange={(e) => setCommand(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") send();
          if (e.key === "Escape") setOpen(false);
        }}
      />
      <Button
        size="sm"
        className="h-7 rounded-full px-4 text-xs"
        disabled={!command.trim()}
        onClick={send}
      >
        Enviar
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 text-muted-foreground"
        onClick={() => setOpen(false)}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
