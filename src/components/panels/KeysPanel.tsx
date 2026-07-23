import { useEffect } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLibrary } from "@/stores/library";

function KeyRow({ name, path }: { name: string; path: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(path);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="group flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-accent/50">
      <KeyRound className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[13px] leading-5 font-medium">
          {name}
        </span>
        <span className="block truncate font-mono text-[10px] leading-4 text-muted-foreground">
          {path}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100"
        onClick={() => void copy()}
        title="Copiar ruta"
      >
        {copied ? (
          <Check className="size-3.5 text-emerald-400" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </Button>
    </div>
  );
}

export function KeysPanel() {
  const keys = useLibrary((s) => s.keys);
  const loadKeys = useLibrary((s) => s.loadKeys);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1 px-2 pt-2">
        {keys.length === 0 && (
          <div className="px-3 py-10 text-center text-xs leading-5 text-muted-foreground">
            No se encontraron claves en ~/.ssh
          </div>
        )}
        {keys.map((key) => (
          <KeyRow key={key.path} name={key.name} path={key.path} />
        ))}
      </ScrollArea>
      <p className="border-t border-border px-4 py-2.5 text-[11px] leading-4 text-muted-foreground/70">
        Estas claves aparecen al crear o editar un host.
      </p>
    </div>
  );
}
