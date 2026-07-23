import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useHosts } from "@/stores/hosts";
import { useLibrary } from "@/stores/library";
import { cn } from "@/lib/utils";
import type { Host } from "@/types";

const CUSTOM_KEY = "__custom__";

interface HostFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  host: Host | null;
}

interface FormState {
  name: string;
  hostname: string;
  port: string;
  username: string;
  authKind: "password" | "key";
  password: string;
  keyPath: string;
  passphrase: string;
  tags: string;
  group: string;
  jumpHostId: string;
  loginCommands: string;
}

const NO_JUMP = "__none__";

const EMPTY: FormState = {
  name: "",
  hostname: "",
  port: "22",
  username: "",
  authKind: "key",
  password: "",
  keyPath: "~/.ssh/id_ed25519",
  passphrase: "",
  tags: "",
  group: "",
  jumpHostId: NO_JUMP,
  loginCommands: "",
};

function toForm(host: Host): FormState {
  return {
    name: host.name,
    hostname: host.hostname,
    port: String(host.port),
    username: host.username,
    authKind: host.auth.kind,
    password: host.auth.kind === "password" ? host.auth.password : "",
    keyPath: host.auth.kind === "key" ? host.auth.key_path : "~/.ssh/id_ed25519",
    passphrase: host.auth.kind === "key" ? (host.auth.passphrase ?? "") : "",
    tags: host.tags.join(", "),
    group: host.group ?? "",
    jumpHostId: host.jump_host_id ?? NO_JUMP,
    loginCommands: host.login_commands.join("\n"),
  };
}

export function HostForm({ open, onOpenChange, host }: HostFormProps) {
  const save = useHosts((s) => s.save);
  const allHosts = useHosts((s) => s.hosts);
  const keys = useLibrary((s) => s.keys);
  const loadKeys = useLibrary((s) => s.loadKeys);
  // un host no puede ser su propio bastión
  const jumpCandidates = allHosts.filter((h) => h.id !== host?.id);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [customKey, setCustomKey] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(host ? toForm(host) : EMPTY);
      setError(null);
      void loadKeys();
      // si el host ya tiene datos avanzados, muéstralos desplegados
      const hasAdvanced =
        !!host &&
        (host.tags.length > 0 ||
          host.jump_host_id !== null ||
          host.login_commands.length > 0);
      setShowAdvanced(hasAdvanced);
    }
  }, [open, host, loadKeys]);

  // si la ruta guardada no está entre las claves detectadas, es personalizada
  useEffect(() => {
    if (!open) return;
    const path = host?.auth.kind === "key" ? host.auth.key_path : EMPTY.keyPath;
    setCustomKey(keys.length > 0 && !keys.some((k) => k.path === path));
  }, [open, host, keys]);

  const patch = (partial: Partial<FormState>) =>
    setForm((f) => ({ ...f, ...partial }));

  const submit = async () => {
    if (!form.hostname.trim() || !form.username.trim()) {
      setError("Hostname y usuario son obligatorios.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await save({
        id: host?.id ?? "",
        name: form.name.trim() || form.hostname.trim(),
        hostname: form.hostname.trim(),
        port: Number(form.port) || 22,
        username: form.username.trim(),
        auth:
          form.authKind === "password"
            ? { kind: "password", password: form.password }
            : {
                kind: "key",
                key_path: form.keyPath.trim(),
                passphrase: form.passphrase || null,
              },
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        group: form.group.trim() || null,
        jump_host_id: form.jumpHostId === NO_JUMP ? null : form.jumpHostId,
        login_commands: form.loginCommands
          .split("\n")
          .map((c) => c.trim())
          .filter(Boolean),
      });
      onOpenChange(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{host ? "Editar host" : "Nuevo host"}</DialogTitle>
          <DialogDescription>
            {host
              ? "Los cambios se aplican a las próximas conexiones."
              : "La conexión quedará a un clic en la barra lateral."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[70vh] gap-4 overflow-x-hidden overflow-y-auto px-0.5">

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                placeholder="homelab"
                value={form.name}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="group">Grupo</Label>
              <Input
                id="group"
                placeholder="Trabajo"
                value={form.group}
                onChange={(e) => patch({ group: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-[1fr_5rem] gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="hostname">Hostname / IP</Label>
              <Input
                id="hostname"
                placeholder="192.168.1.10"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={form.hostname}
                onChange={(e) => patch({ hostname: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="port">Puerto</Label>
              <Input
                id="port"
                inputMode="numeric"
                value={form.port}
                onChange={(e) => patch({ port: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="username">Usuario</Label>
            <Input
              id="username"
              placeholder="root"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={form.username}
              onChange={(e) => patch({ username: e.target.value })}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Autenticación</Label>
            <Select
              value={form.authKind}
              onValueChange={(v) =>
                patch({ authKind: v as FormState["authKind"] })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="key">Clave privada</SelectItem>
                <SelectItem value="password">Password</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.authKind === "password" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => patch({ password: e.target.value })}
              />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Clave privada</Label>
                  <Select
                    value={customKey ? CUSTOM_KEY : form.keyPath}
                    onValueChange={(v) => {
                      if (v === CUSTOM_KEY) {
                        setCustomKey(true);
                      } else {
                        setCustomKey(false);
                        patch({ keyPath: v });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona una clave" />
                    </SelectTrigger>
                    <SelectContent>
                      {keys.map((key) => (
                        <SelectItem key={key.path} value={key.path}>
                          {key.name}
                        </SelectItem>
                      ))}
                      <SelectItem value={CUSTOM_KEY}>Otra ruta…</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="passphrase">Passphrase (opcional)</Label>
                  <Input
                    id="passphrase"
                    type="password"
                    value={form.passphrase}
                    onChange={(e) => patch({ passphrase: e.target.value })}
                  />
                </div>
              </div>
              {customKey && (
                <div className="grid gap-1.5">
                  <Label htmlFor="keyPath">Ruta de la clave</Label>
                  <Input
                    id="keyPath"
                    placeholder="~/.ssh/mi_clave"
                    value={form.keyPath}
                    onChange={(e) => patch({ keyPath: e.target.value })}
                  />
                </div>
              )}
            </>
          )}

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="-mx-1 flex items-center gap-1.5 rounded-md px-1 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRight
              className={cn(
                "size-3.5 transition-transform",
                showAdvanced && "rotate-90",
              )}
            />
            Opciones avanzadas
          </button>

          {showAdvanced && (
            <div className="grid gap-4 duration-200 animate-in fade-in slide-in-from-top-1">
              <div className="grid gap-1.5">
                <Label htmlFor="tags">Tags (separados por coma)</Label>
                <Input
                  id="tags"
                  placeholder="proxmox, homelab"
                  value={form.tags}
                  onChange={(e) => patch({ tags: e.target.value })}
                />
              </div>

              <div className="grid gap-1.5">
                <Label>Conectar a través de (bastión)</Label>
                <Select
                  value={form.jumpHostId}
                  onValueChange={(v) => patch({ jumpHostId: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_JUMP}>Conexión directa</SelectItem>
                    {jumpCandidates.map((h) => (
                      <SelectItem key={h.id} value={h.id}>
                        {h.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Salta primero por otro host (bastión) antes de llegar a este.
                </p>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="login-commands">Comandos al conectar</Label>
                <Textarea
                  id="login-commands"
                  placeholder={"cd /var/www\nsource .venv/bin/activate"}
                  className="min-h-16 font-mono text-xs"
                  value={form.loginCommands}
                  onChange={(e) => patch({ loginCommands: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground">
                  Uno por línea. Se ejecutan al abrir la sesión.
                </p>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
