import { useMemo, useState } from "react";
import {
  FileInput,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Search,
  Server,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { PanelEmpty } from "@/components/panels/PanelEmpty";
import { Button } from "@/components/ui/button";
import { readSshConfig } from "@/lib/ipc";
import { useSftp } from "@/stores/sftp";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useHosts } from "@/stores/hosts";
import { useSessions } from "@/stores/sessions";
import { useUi } from "@/stores/ui";
import { cn } from "@/lib/utils";
import type { Host } from "@/types";

function HostRow({ host }: { host: Host }) {
  const connect = useSessions((s) => s.connect);
  const remove = useHosts((s) => s.remove);
  const browseFiles = useSftp((s) => s.connect);
  const openHostForm = useUi((s) => s.openHostForm);
  const hasLiveSession = useSessions((s) =>
    s.sessions.some((x) => x.host.id === host.id && x.status === "connected"),
  );

  return (
    <div className="group flex items-center rounded-lg transition-colors hover:bg-accent/50">
      <button
        className="min-w-0 flex-1 px-3 py-2 text-left"
        onClick={() => connect(host)}
        title={`Conectar a ${host.username}@${host.hostname}:${host.port}`}
      >
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] leading-5 font-medium">
            {host.name}
          </span>
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full bg-emerald-400/90 transition-opacity",
              hasLiveSession ? "status-live opacity-100" : "opacity-0",
            )}
          />
        </span>
        <span className="block truncate text-[11px] leading-4 text-muted-foreground">
          {host.username}@{host.hostname}
          {host.port !== 22 ? `:${host.port}` : ""}
        </span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="mr-1 size-6 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100"
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => void browseFiles(host)}>
            <FolderOpen className="size-3.5" /> Explorar archivos
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openHostForm(host)}>
            <Pencil className="size-3.5" /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => void remove(host.id)}
          >
            <Trash2 className="size-3.5" /> Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function HostsPanel() {
  const hosts = useHosts((s) => s.hosts);
  const save = useHosts((s) => s.save);
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);

  const importFromSshConfig = async () => {
    setImporting(true);
    try {
      const entries = await readSshConfig();
      const existing = useHosts.getState().hosts;
      const fresh = entries.filter(
        (e) =>
          !existing.some(
            (h) =>
              h.name === e.alias ||
              (h.hostname === e.hostname && h.port === e.port),
          ),
      );
      for (const entry of fresh) {
        await save({
          id: "",
          name: entry.alias,
          hostname: entry.hostname,
          port: entry.port,
          username: entry.user ?? "root",
          auth: {
            kind: "key",
            key_path: entry.identity_file ?? "~/.ssh/id_ed25519",
            passphrase: null,
          },
          tags: ["ssh-config"],
          group: null,
          jump_host_id: null,
          login_commands: [],
        });
      }
      toast.success(
        fresh.length > 0
          ? `${fresh.length} host${fresh.length === 1 ? "" : "s"} importados de ~/.ssh/config`
          : "Nada nuevo que importar de ~/.ssh/config",
      );
    } catch (e) {
      toast.error(String(e));
    } finally {
      setImporting(false);
    }
  };

  const groups = useMemo(() => {
    const q = query.toLowerCase();
    const filtered = hosts.filter(
      (h) =>
        !q ||
        h.name.toLowerCase().includes(q) ||
        h.hostname.toLowerCase().includes(q) ||
        h.tags.some((t) => t.toLowerCase().includes(q)),
    );
    const byGroup = new Map<string, Host[]>();
    for (const host of filtered) {
      const key = host.group ?? "Hosts";
      byGroup.set(key, [...(byGroup.get(key) ?? []), host]);
    }
    return [...byGroup.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [hosts, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative px-3 pt-3 pb-2">
        <Search className="pointer-events-none absolute top-[21px] left-[22px] size-3.5 text-muted-foreground/60" />
        <Input
          placeholder="Buscar"
          className="h-8 rounded-lg border-transparent bg-white/[0.06] pl-8 text-[13px] shadow-none focus-visible:border-input focus-visible:ring-0"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <ScrollArea className="min-h-0 flex-1 px-2">
        {hosts.length === 0 && (
          <PanelEmpty icon={Server} message="Aún no hay hosts. Crea el primero con el botón +.">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => useUi.getState().openHostForm(null)}
            >
              Nuevo host
            </Button>
          </PanelEmpty>
        )}

        {groups.map(([group, groupHosts]) => (
          <div key={group} className="mb-3">
            <p className="px-3 pt-1 pb-1 text-[11px] font-medium text-muted-foreground/60">
              {group}
            </p>
            <div className="stagger">
              {groupHosts.map((host) => (
                <HostRow key={host.id} host={host} />
              ))}
            </div>
          </div>
        ))}
      </ScrollArea>

      <div className="border-t border-border px-2 py-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-full justify-start text-xs text-muted-foreground"
          disabled={importing}
          onClick={() => void importFromSshConfig()}
        >
          <FileInput className="size-3.5" />
          {importing ? "Importando…" : "Importar de ~/.ssh/config"}
        </Button>
      </div>
    </div>
  );
}
