import { useEffect } from "react";
import { ShieldCheck, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLibrary } from "@/stores/library";
import type { KnownHost } from "@/types";

function KnownHostRow({ entry }: { entry: KnownHost }) {
  const forget = useLibrary((s) => s.forgetKnownHost);

  return (
    <div className="group flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-accent/50">
      <ShieldCheck className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[13px] leading-5 font-medium">
          {entry.host}
        </span>
        <span
          className="block truncate font-mono text-[10px] leading-4 text-muted-foreground"
          title={entry.fingerprint}
        >
          {entry.fingerprint}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100"
        onClick={() => void forget(entry.host)}
        title="Olvidar este servidor"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

export function KnownHostsPanel() {
  const knownHosts = useLibrary((s) => s.knownHosts);
  const loadKnownHosts = useLibrary((s) => s.loadKnownHosts);

  useEffect(() => {
    void loadKnownHosts();
  }, [loadKnownHosts]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1 px-2 pt-2">
        {knownHosts.length === 0 && (
          <div className="px-3 py-10 text-center text-xs leading-5 text-muted-foreground">
            Aún no hay servidores registrados.
          </div>
        )}
        {knownHosts.map((entry) => (
          <KnownHostRow key={entry.host} entry={entry} />
        ))}
      </ScrollArea>
      <p className="border-t border-border px-4 py-2.5 text-[11px] leading-4 text-muted-foreground/70">
        La clave de cada servidor se guarda en la primera conexión y se
        verifica en las siguientes. Si cambia, la conexión se rechaza.
      </p>
    </div>
  );
}
