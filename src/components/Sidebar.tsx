import { useMemo, useState, type ReactNode } from "react";
import { ChevronRight, Plus, Search, Settings } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { HostCard } from "@/components/HostCard";
import { KeyCard } from "@/components/KeyCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Host, SshKey } from "@/lib/types";

type View = "hosts" | "keys";

type Props = {
  view: View;
  onViewChange: (v: View) => void;
  hosts: Host[];
  keys: SshKey[];
  connectedHostIds: Set<string>;
  onConnect: (host: Host) => void;
  onNewHost: () => void;
  onEditHost: (host: Host) => void;
  onDeleteHost: (host: Host) => void;
  onDuplicateHost: (host: Host) => void;
  onImportConfig: () => void;
  onNewKey: () => void;
  onOpenKey: (key: SshKey) => void;
  onDeleteKey: (key: SshKey) => void;
  onOpenSettings: () => void;
};

export function Sidebar(props: Props) {
  const { view, onViewChange, hosts, keys } = props;
  const [query, setQuery] = useState("");

  const filteredHosts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return hosts;
    return hosts.filter((h) =>
      `${h.label} ${h.host} ${h.username}`.toLowerCase().includes(q),
    );
  }, [hosts, query]);

  const filteredKeys = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return keys;
    return keys.filter((k) => k.label.toLowerCase().includes(q));
  }, [keys, query]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Agrupa los hosts filtrados por su grupo; los sin grupo van al final.
  const grouped = useMemo(() => {
    const map = new Map<string, Host[]>();
    for (const h of filteredHosts) {
      const g = h.group?.trim() || "";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(h);
    }
    return [...map.entries()].sort((a, b) => {
      if (a[0] === "") return 1;
      if (b[0] === "") return -1;
      return a[0].localeCompare(b[0]);
    });
  }, [filteredHosts]);
  const hasNamedGroups = grouped.some(([g]) => g !== "");

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-border bg-surface/60">
      <div
        data-tauri-drag-region
        className="flex h-14 items-center justify-center"
      >
        <BrandMark className="h-7 w-auto text-fg" />
      </div>

      {/* Conmutador de secciones */}
      <div className="px-3 pb-2">
        <div className="flex gap-1 rounded-lg bg-surface-2/60 p-1">
          <Tab active={view === "hosts"} onClick={() => onViewChange("hosts")}>
            Hosts
          </Tab>
          <Tab active={view === "keys"} onClick={() => onViewChange("keys")}>
            Claves
          </Tab>
        </div>
      </div>

      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={view === "hosts" ? "Buscar host…" : "Buscar clave…"}
            className="h-9 w-full rounded-lg border border-input bg-surface-2/60 pl-9 pr-3 text-sm text-fg outline-none select-text placeholder:text-muted-foreground/70 focus-visible:border-amber/40 focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
        {view === "hosts" ? (
          filteredHosts.length === 0 ? (
            <Empty>
              {hosts.length === 0
                ? "Todavía no has guardado ningún host."
                : "Sin resultados."}
            </Empty>
          ) : (
            grouped.map(([groupName, groupHosts]) => {
              const key = groupName || "__ungrouped__";
              const showHeader = groupName !== "" || hasNamedGroups;
              const isCollapsed = collapsed.has(key);
              return (
                <div key={key}>
                  {showHeader && (
                    <button
                      onClick={() => toggleGroup(key)}
                      className="flex w-full items-center gap-1.5 px-2 pb-1 pt-2 text-left"
                    >
                      <ChevronRight
                        className={cn(
                          "size-3 text-muted-foreground transition-transform",
                          !isCollapsed && "rotate-90",
                        )}
                      />
                      <span className="flex-1 truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {groupName || "Sin grupo"}
                      </span>
                      <span className="text-[11px] tabular-nums text-muted-foreground/50">
                        {groupHosts.length}
                      </span>
                    </button>
                  )}
                  {!isCollapsed &&
                    groupHosts.map((h) => (
                      <HostCard
                        key={h.id}
                        host={h}
                        connected={props.connectedHostIds.has(h.id)}
                        onConnect={() => props.onConnect(h)}
                        onEdit={() => props.onEditHost(h)}
                        onDuplicate={() => props.onDuplicateHost(h)}
                        onDelete={() => props.onDeleteHost(h)}
                      />
                    ))}
                </div>
              );
            })
          )
        ) : filteredKeys.length === 0 ? (
          <Empty>
            {keys.length === 0
              ? "Todavía no has guardado ninguna clave."
              : "Sin resultados."}
          </Empty>
        ) : (
          filteredKeys.map((k) => (
            <KeyCard
              key={k.id}
              sshKey={k}
              onOpen={() => props.onOpenKey(k)}
              onDelete={() => props.onDeleteKey(k)}
            />
          ))
        )}
      </div>

      <div className="border-t border-border p-3">
        {view === "hosts" ? (
          <>
            <Button className="w-full" onClick={props.onNewHost}>
              <Plus /> Nuevo host
            </Button>
            <button
              onClick={props.onImportConfig}
              className="mt-1.5 w-full text-center text-[11px] text-muted-foreground transition-colors hover:text-fg"
            >
              Importar ~/.ssh/config
            </button>
          </>
        ) : (
          <Button className="w-full" onClick={props.onNewKey}>
            <Plus /> Nueva clave
          </Button>
        )}
        <div className="mt-2 flex items-center justify-between px-0.5">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
            Ratatoskr · v0.1.0
          </span>
          <button
            title="Ajustes"
            onClick={props.onOpenSettings}
            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <Settings className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-elevated text-fg shadow-sm"
          : "text-muted-foreground hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="px-3 py-8 text-center text-xs text-muted-foreground">{children}</p>
  );
}
