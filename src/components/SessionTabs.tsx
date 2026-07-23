import { useState } from "react";
import { Columns2, Square, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSessions } from "@/stores/sessions";
import { useUi } from "@/stores/ui";
import { cn } from "@/lib/utils";
import type { SessionStatus } from "@/types";

function StatusDot({ status }: { status: SessionStatus }) {
  return (
    <span
      className={cn("size-1.5 shrink-0 rounded-full transition-colors", {
        "animate-pulse bg-muted-foreground": status === "connecting",
        "status-live bg-emerald-400/90": status === "connected",
        "bg-muted-foreground/50": status === "closed",
        "bg-red-400/90": status === "error",
      })}
    />
  );
}

export function SessionTabs() {
  const sessions = useSessions((s) => s.sessions);
  const activeId = useSessions((s) => s.activeId);
  const setActive = useSessions((s) => s.setActive);
  const setTitle = useSessions((s) => s.setTitle);
  const requestClose = useSessions((s) => s.requestClose);
  const split = useUi((s) => s.splitView);
  const setSplit = useUi((s) => s.setSplitView);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const commitRename = () => {
    if (editingId) setTitle(editingId, draft);
    setEditingId(null);
  };

  return (
    <div
      data-tauri-drag-region
      className="flex h-12 shrink-0 items-center border-b border-border bg-background px-3"
    >
      <div className="flex flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {sessions.map((session) => (
        <div
          key={session.id}
          role="tab"
          aria-selected={session.id === activeId}
          tabIndex={0}
          onClick={() => setActive(session.id)}
          onKeyDown={(e) => e.key === "Enter" && setActive(session.id)}
          className={cn(
            "group flex h-7 max-w-48 min-w-0 cursor-default items-center gap-2 rounded-md px-2.5 text-xs",
            "transition-[background-color,color,transform] duration-150 active:scale-[0.97]",
            "duration-200 animate-in fade-in zoom-in-95",
            session.id === activeId
              ? "bg-white/[0.08] text-foreground"
              : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
          )}
        >
          <StatusDot status={session.status} />
          {editingId === session.id ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setEditingId(null);
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-24 bg-transparent text-xs text-foreground outline-none"
            />
          ) : (
            <span
              className="truncate"
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingId(session.id);
                setDraft(session.title);
              }}
              title="Doble clic para renombrar"
            >
              {session.title}
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              requestClose(session.id);
            }}
            className="-mr-0.5 rounded-sm p-0.5 opacity-0 transition-opacity hover:bg-white/10 group-hover:opacity-100"
            title="Cerrar sesión"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
      </div>

      {sessions.length > 1 && (
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "ml-1 size-7 shrink-0",
            split
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setSplit(!split)}
          title={split ? "Vista única" : "Dividir vista (⌘D)"}
        >
          {split ? (
            <Square className="size-4" />
          ) : (
            <Columns2 className="size-4" />
          )}
        </Button>
      )}
    </div>
  );
}
