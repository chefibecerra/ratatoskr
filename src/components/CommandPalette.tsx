import { AppWindow, Plus, Server, Settings2 } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useHosts } from "@/stores/hosts";
import { useSessions } from "@/stores/sessions";
import { useUi } from "@/stores/ui";

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPaletteOpen);
  const openHostForm = useUi((s) => s.openHostForm);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);
  const hosts = useHosts((s) => s.hosts);
  const connect = useSessions((s) => s.connect);
  const sessions = useSessions((s) => s.sessions);
  const setActive = useSessions((s) => s.setActive);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Ratatoskr">
      <CommandInput placeholder="Conectar a un host o buscar una acción…" />
      <CommandList>
        <CommandEmpty>Sin resultados.</CommandEmpty>

        {sessions.length > 0 && (
          <CommandGroup heading="Pestañas abiertas">
            {sessions.map((session, index) => (
              <CommandItem
                key={session.id}
                value={`pestaña ${session.title} ${index + 1}`}
                onSelect={() => run(() => setActive(session.id))}
              >
                <AppWindow className="size-4 text-muted-foreground" />
                <span>{session.title}</span>
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                  ⌘{index + 1}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {hosts.length > 0 && (
          <CommandGroup heading="Conectar">
            {hosts.map((host) => (
              <CommandItem
                key={host.id}
                value={`${host.name} ${host.hostname} ${host.tags.join(" ")}`}
                onSelect={() => run(() => connect(host))}
              >
                <Server className="size-4 text-muted-foreground" />
                <span>{host.name}</span>
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                  {host.username}@{host.hostname}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />

        <CommandGroup heading="Acciones">
          <CommandItem onSelect={() => run(() => openHostForm(null))}>
            <Plus className="size-4 text-muted-foreground" />
            Nuevo host
          </CommandItem>
          <CommandItem onSelect={() => run(() => setSettingsOpen(true))}>
            <Settings2 className="size-4 text-muted-foreground" />
            Preferencias
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
