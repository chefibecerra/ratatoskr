import { FolderOpen, X } from "lucide-react";
import { colorFor, type Session } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  sessions: Session[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  filesOpen: boolean;
  onToggleFiles: () => void;
};

export function SessionTabs({
  sessions,
  activeId,
  onSelect,
  onClose,
  filesOpen,
  onToggleFiles,
}: Props) {
  return (
    <div
      data-tauri-drag-region
      className="flex h-11 items-center gap-1 border-b border-border bg-surface/60 px-2"
    >
      {sessions.map((s) => {
        const active = s.id === activeId;
        return (
          <div
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={cn(
              "group flex h-8 max-w-48 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm transition-colors",
              active
                ? "border-border bg-surface-2 text-fg"
                : "border-transparent text-muted-foreground hover:bg-surface-2/60 hover:text-fg",
            )}
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: colorFor(s.host) }}
            />
            <span className="truncate">{s.host.label || s.host.host}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose(s.id);
              }}
              className={cn(
                "grid size-4 shrink-0 place-items-center rounded transition-colors hover:bg-accent hover:text-fg",
                active ? "opacity-70" : "opacity-0 group-hover:opacity-70",
              )}
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}

      <div data-tauri-drag-region className="flex-1" />

      <button
        onClick={onToggleFiles}
        title="Archivos (SFTP)"
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors",
          filesOpen
            ? "bg-surface-2 text-fg"
            : "text-muted-foreground hover:bg-surface-2/60 hover:text-fg",
        )}
      >
        <FolderOpen className="size-4" /> Archivos
      </button>
    </div>
  );
}
