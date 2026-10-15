import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { SessionTabs } from "@/components/SessionTabs";
import { TerminalView } from "@/components/TerminalView";
import { SftpPanel } from "@/components/SftpPanel";
import { Welcome } from "@/components/Welcome";
import { HostDialog } from "@/components/HostDialog";
import { KeyDialog } from "@/components/KeyDialog";
import { SettingsDialog } from "@/components/SettingsDialog";
import { PassphraseDialog } from "@/components/PassphraseDialog";
import { BrandMark } from "@/components/BrandMark";
import type { ConfigHost, Host, Session, SshKey } from "@/lib/types";

type View = "hosts" | "keys";

function App() {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [keys, setKeys] = useState<SshKey[]>([]);
  const [view, setView] = useState<View>("hosts");

  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<Host | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [filesOpen, setFilesOpen] = useState(false);
  const [passPrompt, setPassPrompt] = useState<{
    host: Host;
    error?: string;
  } | null>(null);
  const connectToken = useRef(0);

  const [hostDialog, setHostDialog] = useState(false);
  const [editingHost, setEditingHost] = useState<Host | null>(null);
  const [keyDialog, setKeyDialog] = useState(false);
  const [editingKey, setEditingKey] = useState<SshKey | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    invoke<Host[]>("hosts_list").then(setHosts).catch(() => {});
    invoke<SshKey[]>("keys_list").then(setKeys).catch(() => {});
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // Atajos de teclado (⌘/Ctrl): W cierra pestaña, N nuevo host, E archivos, 1-9 cambia.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      if (e.key === "w" && activeId) {
        e.preventDefault();
        void closeSession(activeId);
      } else if (e.key === "n") {
        e.preventDefault();
        openNewHost();
      } else if (e.key === "e" && sessions.length > 0) {
        e.preventDefault();
        setFilesOpen((v) => !v);
      } else if (e.key >= "1" && e.key <= "9") {
        const i = Number(e.key) - 1;
        if (sessions[i]) {
          e.preventDefault();
          setActiveId(sessions[i].id);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, activeId]);

  const connectedHostIds = useMemo(
    () => new Set(sessions.map((s) => s.host.id)),
    [sessions],
  );

  // Auth del destino (args de nivel superior → camelCase).
  function targetAuth(h: Host, passphraseOverride?: string) {
    if ((h.auth_type ?? "password") === "key" && h.key_id) {
      const key = keys.find((k) => k.id === h.key_id);
      if (!key) throw new Error(`La clave de «${h.label || h.host}» ya no existe.`);
      return {
        password: null as string | null,
        privateKey: (key.path ? null : key.private_key) as string | null,
        privateKeyPath: (key.path ?? null) as string | null,
        passphrase: (passphraseOverride ?? key.passphrase ?? null) as string | null,
      };
    }
    return {
      password: (h.password ?? "") as string | null,
      privateKey: null as string | null,
      privateKeyPath: null as string | null,
      passphrase: null as string | null,
    };
  }

  // Auth de un bastión (struct anidado → snake_case, como espera serde).
  function jumpSpec(h: Host) {
    const base = { host: h.host, port: h.port, user: h.username };
    if ((h.auth_type ?? "password") === "key" && h.key_id) {
      const key = keys.find((k) => k.id === h.key_id);
      if (!key) throw new Error(`La clave del bastión «${h.label || h.host}» ya no existe.`);
      return {
        ...base,
        password: null,
        private_key: key.path ? null : key.private_key,
        private_key_path: key.path ?? null,
        passphrase: key.passphrase ?? null,
      };
    }
    return {
      ...base,
      password: h.password ?? "",
      private_key: null,
      private_key_path: null,
      passphrase: null,
    };
  }

  // Sigue los enlaces jump_host_id; devuelve los saltos ordenados del más externo
  // (el que se alcanza directo) al más cercano al destino.
  function resolveJumps(host: Host) {
    const chain: Host[] = [];
    const seen = new Set<string>([host.id]);
    let jid = host.jump_host_id ?? null;
    while (jid) {
      const bastion = hosts.find((h) => h.id === jid);
      if (!bastion || seen.has(bastion.id)) break;
      seen.add(bastion.id);
      chain.push(bastion);
      jid = bastion.jump_host_id ?? null;
    }
    chain.reverse();
    return chain.map(jumpSpec);
  }

  async function connect(host: Host, passphraseOverride?: string) {
    const token = ++connectToken.current;
    setConnecting(host);
    try {
      const auth = targetAuth(host, passphraseOverride);
      const jumps = resolveJumps(host);
      const id = await invoke<string>("ssh_connect", {
        host: host.host,
        port: host.port,
        user: host.username,
        password: auth.password,
        privateKey: auth.privateKey,
        privateKeyPath: auth.privateKeyPath,
        passphrase: auth.passphrase,
        jumps: jumps.length ? jumps : null,
        cols: 80,
        rows: 24,
      });
      // Si se canceló mientras conectaba, cerramos la sesión recién abierta.
      if (token !== connectToken.current) {
        void invoke("ssh_disconnect", { id });
        return;
      }
      setSessions((prev) => [...prev, { id, host }]);
      setActiveId(id);
    } catch (err) {
      if (token !== connectToken.current) return;
      const msg = err instanceof Error ? err.message : String(err);
      // Clave cifrada sin passphrase (o incorrecta): pedirla.
      if (/cifrada|passphrase/i.test(msg)) {
        setPassPrompt({
          host,
          error: passphraseOverride
            ? "Passphrase incorrecta. Inténtalo de nuevo."
            : undefined,
        });
        return;
      }
      setToast(msg);
    } finally {
      if (token === connectToken.current) setConnecting(null);
    }
  }

  function cancelConnect() {
    connectToken.current++;
    setConnecting(null);
  }

  // Passphrase introducida en el diálogo: opcionalmente la guarda en la clave.
  async function submitPassphrase(passphrase: string, remember: boolean) {
    const host = passPrompt?.host;
    setPassPrompt(null);
    if (!host) return;
    if (remember && host.key_id) {
      const key = keys.find((k) => k.id === host.key_id);
      if (key) {
        const updated = await invoke<SshKey[]>("key_upsert", {
          key: { ...key, passphrase },
        }).catch(() => null);
        if (updated) setKeys(updated);
      }
    }
    void connect(host, passphrase);
  }

  async function closeSession(id: string) {
    await invoke("ssh_disconnect", { id }).catch(() => {});
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      setActiveId((cur) => (cur === id ? (next.at(-1)?.id ?? null) : cur));
      return next;
    });
  }

  function openNewHost() {
    setEditingHost(null);
    setHostDialog(true);
  }
  function openEditHost(host: Host) {
    setEditingHost(host);
    setHostDialog(true);
  }
  async function deleteHost(host: Host) {
    const next = await invoke<Host[]>("host_delete", { id: host.id }).catch(() => null);
    if (next) setHosts(next);
  }

  function openNewKey() {
    setEditingKey(null);
    setKeyDialog(true);
  }
  function openKey(key: SshKey) {
    setEditingKey(key);
    setKeyDialog(true);
  }
  async function deleteKey(key: SshKey) {
    const next = await invoke<SshKey[]>("key_delete", { id: key.id }).catch(() => null);
    if (next) setKeys(next);
  }

  async function duplicateHost(host: Host) {
    const copy: Host = { ...host, id: crypto.randomUUID(), label: `${host.label} (copia)` };
    const next = await invoke<Host[]>("host_upsert", { host: copy }).catch(() => null);
    if (next) setHosts(next);
  }

  async function importSshConfig() {
    let cfgHosts: ConfigHost[];
    try {
      cfgHosts = await invoke<ConfigHost[]>("ssh_config_hosts");
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err));
      return;
    }
    if (!cfgHosts.length) {
      setToast("No se encontraron hosts en ~/.ssh/config");
      return;
    }
    let curKeys = keys;
    let curHosts = hosts;
    for (const ch of cfgHosts) {
      let keyId: string | null = null;
      if (ch.identity_file) {
        const existing = curKeys.find((k) => k.path === ch.identity_file);
        if (existing) {
          keyId = existing.id;
        } else {
          const id = crypto.randomUUID();
          curKeys = await invoke<SshKey[]>("key_upsert", {
            key: {
              id,
              label: `Clave (${ch.alias})`,
              private_key: "",
              path: ch.identity_file,
              passphrase: "",
            },
          });
          keyId = id;
        }
      }
      curHosts = await invoke<Host[]>("host_upsert", {
        host: {
          id: crypto.randomUUID(),
          label: ch.alias,
          host: ch.hostname || ch.alias,
          port: ch.port ?? 22,
          username: ch.user ?? "",
          password: "",
          auth_type: keyId ? "key" : "password",
          key_id: keyId,
          jump_host_id: null,
          group: "SSH config",
          color: null,
        },
      });
    }
    setKeys(curKeys);
    setHosts(curHosts);
    setToast(`Importados ${cfgHosts.length} hosts de ~/.ssh/config`);
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      <Sidebar
        view={view}
        onViewChange={setView}
        hosts={hosts}
        keys={keys}
        connectedHostIds={connectedHostIds}
        onConnect={connect}
        onNewHost={openNewHost}
        onEditHost={openEditHost}
        onDeleteHost={deleteHost}
        onDuplicateHost={duplicateHost}
        onImportConfig={importSshConfig}
        onNewKey={openNewKey}
        onOpenKey={openKey}
        onDeleteKey={deleteKey}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className="relative flex min-w-0 flex-1 flex-col bg-[#0C0C0E]">
        {sessions.length > 0 ? (
          <>
            <SessionTabs
              sessions={sessions}
              activeId={activeId}
              onSelect={setActiveId}
              onClose={closeSession}
              filesOpen={filesOpen}
              onToggleFiles={() => setFilesOpen((v) => !v)}
            />
            <div className="flex min-h-0 flex-1">
              <div className="relative min-h-0 flex-1">
                {sessions.map((s) => {
                  const isActive = s.id === activeId;
                  return (
                    <div
                      key={s.id}
                      className="absolute inset-0"
                      style={{
                        visibility: isActive ? "visible" : "hidden",
                        zIndex: isActive ? 10 : 0,
                      }}
                    >
                      <TerminalView sessionId={s.id} active={isActive} />
                    </div>
                  );
                })}
              </div>
              {filesOpen && activeId && (
                <SftpPanel
                  key={activeId}
                  sessionId={activeId}
                  onClose={() => setFilesOpen(false)}
                />
              )}
            </div>
          </>
        ) : (
          <Welcome hasHosts={hosts.length > 0} onNew={openNewHost} />
        )}

        {connecting && (
          <div className="absolute inset-0 z-20 grid place-items-center bg-background/70 backdrop-blur-sm">
            <div className="glass flex flex-col items-center gap-3 rounded-xl px-8 py-6">
              <div className="relative">
                <BrandMark className="h-10 w-auto text-fg" />
                <Loader2 className="absolute -right-2 -top-2 size-4 animate-spin text-amber" />
              </div>
              <p className="text-sm text-fg">
                Conectando a{" "}
                <span className="font-medium">
                  {connecting.label || connecting.host}
                </span>
                …
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                {connecting.username}@{connecting.host}:{connecting.port}
              </p>
              <button
                onClick={cancelConnect}
                className="mt-1 rounded-md border border-border px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-surface-2 hover:text-fg"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </main>

      <HostDialog
        open={hostDialog}
        onOpenChange={setHostDialog}
        host={editingHost}
        hosts={hosts}
        keys={keys}
        onSaved={setHosts}
      />
      <KeyDialog
        open={keyDialog}
        onOpenChange={setKeyDialog}
        sshKey={editingKey}
        onSaved={setKeys}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <PassphraseDialog
        open={!!passPrompt}
        hostLabel={passPrompt ? passPrompt.host.label || passPrompt.host.host : ""}
        error={passPrompt?.error}
        onOpenChange={(o) => {
          if (!o) setPassPrompt(null);
        }}
        onSubmit={submitPassphrase}
      />

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="glass flex items-center gap-2 rounded-lg border-destructive/40 px-4 py-2.5 text-sm text-fg shadow-xl">
            <span className="size-1.5 rounded-full bg-destructive" />
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
