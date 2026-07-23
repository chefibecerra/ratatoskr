import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { FileInput, Plus, Search, Zap } from "lucide-react";

import { readSshConfig } from "@/lib/ipc";
import { useHosts } from "@/stores/hosts";
import { useSessions } from "@/stores/sessions";
import { useUi } from "@/stores/ui";
import logo from "@/assets/ratatoskr.png?inline";

function Action({
  icon: Icon,
  label,
  shortcut,
  onClick,
}: {
  icon: typeof Plus;
  label: string;
  shortcut?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex w-64 items-center gap-3 rounded-xl border border-border bg-white/[0.02] px-3.5 py-2.5 text-left transition-colors hover:border-white/15 hover:bg-white/[0.04]"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-white/[0.03] text-muted-foreground transition-colors group-hover:text-foreground">
        <Icon className="size-4" />
      </span>
      <span className="flex-1 text-[13px]">{label}</span>
      {shortcut && (
        <kbd className="rounded border border-border bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

export function EmptyState() {
  const hosts = useHosts((s) => s.hosts);
  const connect = useSessions((s) => s.connect);
  const openHostForm = useUi((s) => s.openHostForm);
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);
  const [version, setVersion] = useState("");

  useEffect(() => {
    void getVersion().then(setVersion);
  }, []);

  const recent = hosts.slice(0, 3);

  const importConfig = async () => {
    const entries = await readSshConfig().catch(() => []);
    const existing = useHosts.getState().hosts;
    const fresh = entries.filter(
      (e) =>
        !existing.some(
          (h) => h.name === e.alias || (h.hostname === e.hostname && h.port === e.port),
        ),
    );
    for (const e of fresh) {
      await useHosts.getState().save({
        id: "",
        name: e.alias,
        hostname: e.hostname,
        port: e.port,
        username: e.user ?? "root",
        auth: { kind: "key", key_path: e.identity_file ?? "~/.ssh/id_ed25519", passphrase: null },
        tags: ["ssh-config"],
        group: null,
        jump_host_id: null,
        login_commands: [],
        agent_forward: false,
      });
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-7 bg-terminal px-6 duration-500 animate-in fade-in">
      {/* logo con glow */}
      <div className="relative">
        <div className="absolute -inset-8 rounded-full bg-white/[0.04] blur-2xl" />
        <img
          src={logo}
          alt=""
          draggable={false}
          className="relative size-16 rounded-2xl shadow-xl duration-700 animate-in zoom-in-95"
        />
      </div>

      <div className="text-center">
        <h1 className="text-2xl font-light tracking-tight">Ratatoskr</h1>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground/70">
          {version ? `v${version}` : ""}
        </p>
      </div>

      {/* accesos rápidos */}
      <div className="flex flex-col gap-2">
        <Action
          icon={Search}
          label="Buscar y conectar"
          shortcut="⌘T"
          onClick={() => setPaletteOpen(true)}
        />
        <Action
          icon={Plus}
          label="Nuevo host"
          shortcut="⌘N"
          onClick={() => openHostForm(null)}
        />
        {hosts.length === 0 && (
          <Action
            icon={FileInput}
            label="Importar de ~/.ssh/config"
            onClick={() => void importConfig()}
          />
        )}
      </div>

      {/* hosts recientes */}
      {recent.length > 0 && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-[10px] font-medium tracking-wider text-muted-foreground/50 uppercase">
            Recientes
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {recent.map((host) => (
              <button
                key={host.id}
                onClick={() => connect(host)}
                className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-white/15 hover:text-foreground"
              >
                <Zap className="size-3" />
                {host.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
