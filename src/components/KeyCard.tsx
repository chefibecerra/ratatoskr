import { useState, type ReactNode } from "react";
import { KeyRound, Trash2, Check, X } from "lucide-react";
import type { SshKey } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  sshKey: SshKey;
  onOpen: () => void;
  onDelete: () => void;
};

export function KeyCard({ sshKey, onOpen, onDelete }: Props) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="group relative flex items-center gap-3 rounded-xl border border-transparent px-2.5 py-2 transition-colors hover:border-border hover:bg-surface-2/70">
      <button
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted-foreground">
          <KeyRound className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-fg">
            {sshKey.label}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            Clave privada SSH
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
        <div className="opacity-0 transition-opacity group-hover:opacity-100">
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
