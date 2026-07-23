import { X } from "lucide-react";

import { useSessions } from "@/stores/sessions";
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
  const requestClose = useSessions((s) => s.requestClose);

  return (
    <div
      data-tauri-drag-region
      className="flex h-12 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border bg-background px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
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
          <span className="truncate">{session.title}</span>
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
  );
}
