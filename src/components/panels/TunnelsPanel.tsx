import { useState } from "react";
import { Play, Plus, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { TunnelForm } from "@/components/TunnelForm";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useHosts } from "@/stores/hosts";
import { useTunnels, type TunnelDef } from "@/stores/tunnels";
import { cn } from "@/lib/utils";

const KIND_BADGE: Record<string, { tag: string; title: string }> = {
  local: { tag: "L", title: "Local (-L)" },
  remote: { tag: "R", title: "Remoto (-R)" },
  dynamic: { tag: "D", title: "Dinámico (-D, SOCKS)" },
};

function routeText(def: TunnelDef): string {
  switch (def.kind) {
    case "remote":
      return `servidor:${def.remotePort} → ${def.remoteHost}:${def.localPort}`;
    case "dynamic":
      return `SOCKS5 en localhost:${def.localPort}`;
    default:
      return `localhost:${def.localPort} → ${def.remoteHost}:${def.remotePort}`;
  }
}

function TunnelRow({ def }: { def: TunnelDef }) {
  const active = useTunnels((s) => s.active[def.id] ?? false);
  const error = useTunnels((s) => s.error[def.id]);
  const start = useTunnels((s) => s.start);
  const stop = useTunnels((s) => s.stop);
  const remove = useTunnels((s) => s.remove);
  const host = useHosts((s) => s.hosts.find((h) => h.id === def.hostId));

  const toggle = async () => {
    if (active) {
      await stop(def.id);
    } else if (host) {
      await start(def, host);
    } else {
      toast.error("El host de este túnel ya no existe.");
    }
  };

  return (
    <div className="group flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-accent/50">
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          active ? "status-live bg-emerald-400/90" : "bg-muted-foreground/40",
        )}
      />
      <div className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span
            className="shrink-0 rounded bg-muted px-1 font-mono text-[9px] leading-4 text-muted-foreground"
            title={(KIND_BADGE[def.kind ?? "local"] ?? KIND_BADGE.local).title}
          >
            {(KIND_BADGE[def.kind ?? "local"] ?? KIND_BADGE.local).tag}
          </span>
          <span className="truncate text-[13px] leading-5 font-medium">
            {def.label}
          </span>
        </span>
        <span className="block truncate font-mono text-[10px] leading-4 text-muted-foreground">
          {routeText(def)}
        </span>
        {error && (
          <span className="block truncate text-[10px] text-destructive">
            {error}
          </span>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 text-muted-foreground"
        onClick={() => void toggle()}
        title={active ? "Detener" : "Iniciar"}
      >
        {active ? <Square className="size-3.5" /> : <Play className="size-3.5" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100"
        onClick={() => remove(def.id)}
        title="Eliminar"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

export function TunnelsPanel() {
  const tunnels = useTunnels((s) => s.tunnels);
  const [formOpen, setFormOpen] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1 px-2 pt-2">
        {tunnels.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
            <p className="text-xs leading-5 text-muted-foreground">
              Reenvía un puerto local a un servicio interno (base de datos,
              panel) a través de SSH.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setFormOpen(true)}
            >
              <Plus className="size-3.5" /> Nuevo túnel
            </Button>
          </div>
        )}
        {tunnels.map((def) => (
          <TunnelRow key={def.id} def={def} />
        ))}
      </ScrollArea>

      {tunnels.length > 0 && (
        <div className="border-t border-border px-2 py-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-full justify-start text-xs text-muted-foreground"
            onClick={() => setFormOpen(true)}
          >
            <Plus className="size-3.5" /> Nuevo túnel
          </Button>
        </div>
      )}

      <TunnelForm open={formOpen} onOpenChange={setFormOpen} />
    </div>
  );
}
