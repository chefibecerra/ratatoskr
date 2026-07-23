import { useEffect } from "react";
import {
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  SquareTerminal,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { sshWrite } from "@/lib/ipc";
import { useLibrary } from "@/stores/library";
import { useSessions } from "@/stores/sessions";
import { useUi } from "@/stores/ui";
import type { Snippet } from "@/types";

function SnippetRow({ snippet }: { snippet: Snippet }) {
  const removeSnippet = useLibrary((s) => s.removeSnippet);
  const openSnippetForm = useUi((s) => s.openSnippetForm);
  const activeSession = useSessions((s) =>
    s.sessions.find((x) => x.id === s.activeId && x.status === "connected"),
  );

  const run = () => {
    if (!activeSession) return;
    void sshWrite(activeSession.id, snippet.command + "\n").catch(() => {});
  };

  return (
    <div className="group flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-accent/50">
      <SquareTerminal className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[13px] leading-5 font-medium">
          {snippet.name}
        </span>
        <span className="block truncate font-mono text-[10px] leading-4 text-muted-foreground">
          {snippet.command}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 disabled:opacity-0"
        disabled={!activeSession}
        onClick={run}
        title={
          activeSession
            ? "Ejecutar en la sesión activa"
            : "Sin sesión activa"
        }
      >
        <Play className="size-3.5" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100"
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => openSnippetForm(snippet)}>
            <Pencil className="size-3.5" /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => void removeSnippet(snippet.id)}
          >
            <Trash2 className="size-3.5" /> Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function SnippetsPanel() {
  const snippets = useLibrary((s) => s.snippets);
  const loadSnippets = useLibrary((s) => s.loadSnippets);
  const openSnippetForm = useUi((s) => s.openSnippetForm);

  useEffect(() => {
    void loadSnippets();
  }, [loadSnippets]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1 px-2 pt-2">
        {snippets.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
            <p className="text-xs leading-5 text-muted-foreground">
              Guarda comandos frecuentes y ejecútalos con un clic en la sesión
              activa.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => openSnippetForm(null)}
            >
              <Plus className="size-3.5" /> Nuevo fragmento
            </Button>
          </div>
        )}
        {snippets.map((snippet) => (
          <SnippetRow key={snippet.id} snippet={snippet} />
        ))}
      </ScrollArea>
      {snippets.length > 0 && (
        <div className="border-t border-border px-2 py-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-full justify-start text-xs text-muted-foreground"
            onClick={() => openSnippetForm(null)}
          >
            <Plus className="size-3.5" /> Nuevo fragmento
          </Button>
        </div>
      )}
    </div>
  );
}
