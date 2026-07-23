import {
  History,
  KeyRound,
  Plus,
  Server,
  Settings2,
  ShieldCheck,
  SquareTerminal,
} from "lucide-react";

import { HistoryPanel } from "@/components/panels/HistoryPanel";
import { HostsPanel } from "@/components/panels/HostsPanel";
import { KeysPanel } from "@/components/panels/KeysPanel";
import { KnownHostsPanel } from "@/components/panels/KnownHostsPanel";
import { SnippetsPanel } from "@/components/panels/SnippetsPanel";
import { Button } from "@/components/ui/button";
import { useUi, type SidebarSection } from "@/stores/ui";
import { cn } from "@/lib/utils";

const SECTIONS: {
  id: SidebarSection;
  label: string;
  icon: typeof Server;
}[] = [
  { id: "hosts", label: "Hosts", icon: Server },
  { id: "keys", label: "Claves", icon: KeyRound },
  { id: "snippets", label: "Fragmentos", icon: SquareTerminal },
  { id: "known-hosts", label: "Servidores", icon: ShieldCheck },
  { id: "history", label: "Historial", icon: History },
];

export function Sidebar() {
  const section = useUi((s) => s.sidebarSection);
  const setSection = useUi((s) => s.setSidebarSection);
  const openHostForm = useUi((s) => s.openHostForm);
  const openSnippetForm = useUi((s) => s.openSnippetForm);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);

  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const newAction =
    section === "hosts"
      ? () => openHostForm(null)
      : section === "snippets"
        ? () => openSnippetForm(null)
        : null;

  return (
    <aside className="flex w-[264px] shrink-0 flex-col border-r border-border bg-background">
      {/* zona de arrastre bajo los semáforos de macOS */}
      <div
        data-tauri-drag-region
        className="flex h-12 shrink-0 items-center border-b border-border pr-2 pl-[88px]"
      >
        <span className="pointer-events-none min-w-0 flex-1 truncate text-[13px] font-medium tracking-tight text-muted-foreground">
          {current.label}
        </span>
        {newAction && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:text-foreground"
            onClick={newAction}
            title={section === "hosts" ? "Nuevo host (⌘N)" : "Nuevo fragmento"}
          >
            <Plus className="size-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground hover:text-foreground"
          onClick={() => setSettingsOpen(true)}
          title="Preferencias (⌘,)"
        >
          <Settings2 className="size-4" />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* riel de secciones, estilo Termius */}
        <nav className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-border pt-2">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              title={label}
              className={cn(
                "flex size-8 items-center justify-center rounded-lg",
                "transition-[background-color,color,transform] duration-150 active:scale-90",
                section === id
                  ? "bg-white/[0.08] text-foreground"
                  : "text-muted-foreground/70 hover:bg-white/[0.04] hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </nav>

        {/* key={section}: cada cambio de sección remonta el panel con su entrada */}
        <div
          key={section}
          className="flex min-h-0 min-w-0 flex-1 flex-col duration-200 animate-in fade-in slide-in-from-left-2"
        >
          {section === "hosts" && <HostsPanel />}
          {section === "keys" && <KeysPanel />}
          {section === "snippets" && <SnippetsPanel />}
          {section === "known-hosts" && <KnownHostsPanel />}
          {section === "history" && <HistoryPanel />}
        </div>
      </div>

      <div className="border-t border-border px-3 py-2">
        <button
          className="flex w-full items-center justify-between rounded-md px-1 py-1 text-[11px] text-muted-foreground/70 transition-colors hover:text-muted-foreground"
          onClick={() => useUi.getState().setPaletteOpen(true)}
        >
          <span>Buscar y conectar</span>
          <kbd className="rounded border border-border bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px]">
            ⌘T
          </kbd>
        </button>
      </div>
    </aside>
  );
}
