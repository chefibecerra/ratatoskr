import { useState, type ReactNode } from "react";
import { Pencil, Copy, Trash2, Check, X } from "lucide-react";
import { colorFor, type Host } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  host: Host;
  connected?: boolean;
  onConnect: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

export function HostCard({
  host,
  connected,
  onConnect,
  onEdit,
  onDuplicate,
  onDelete,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const color = colorFor(host);
  const initial = (host.label || host.host).trim().charAt(0).toUpperCase();

  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 rounded-xl border border-transparent px-2.5 py-2 transition-colors",
        "hover:border-border hover:bg-surface-2/70",
      )}
    >
      <button
        onClick={onConnect}
        className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none"
      >
        <span
          className="relative grid size-9 shrink-0 place-items-center rounded-lg font-display text-sm font-bold text-black/80"
          style={{ backgroundColor: color }}
        >
          {initial || "?"}
          {connected && (
            <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-leaf ring-2 ring-surface" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-fg">
            {host.label || host.host}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {host.username}@{host.host}:{host.port}
          </span>
        </span>
      </button>

      {confirming ? (
        <div className="flex items-center gap-1">
          <IconBtn title="Confirmar" onClick={onDelete} tone="danger">
            <Check className="size-3.5" />
          </IconBtn>
          <IconBtn title="Cancelar" onClick={() => setConfirming(false)}>
            <X className="size-3.5" />
          </IconBtn>
        </div>
      ) : (
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <IconBtn title="Editar" onClick={onEdit}>
            <Pencil className="size-3.5" />
          </IconBtn>
          <IconBtn title="Duplicar" onClick={onDuplicate}>
            <Copy className="size-3.5" />
          </IconBtn>
          <IconBtn title="Eliminar" onClick={() => setConfirming(true)} tone="danger">
            <Trash2 className="size-3.5" />
          </IconBtn>
        </div>
      )}
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  tone,
}: {
  children: ReactNode;
  title: string;
  onClick: () => void;
  tone?: "danger";
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        "grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent",
        tone === "danger" ? "hover:text-destructive" : "hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
