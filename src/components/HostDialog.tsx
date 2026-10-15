import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HOST_COLORS, type Host, type SshKey } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  host: Host | null;
  hosts: Host[];
  keys: SshKey[];
  onSaved: (hosts: Host[]) => void;
};

const empty = (): Host => ({
  id: crypto.randomUUID(),
  label: "",
  host: "",
  port: 22,
  username: "",
  password: "",
  auth_type: "password",
  key_id: null,
  jump_host_id: null,
  group: null,
  color: HOST_COLORS[0],
});

export function HostDialog({ open, onOpenChange, host, hosts, keys, onSaved }: Props) {
  const [draft, setDraft] = useState<Host>(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(
        host
          ? {
              ...host,
              password: host.password ?? "",
              auth_type: host.auth_type ?? "password",
            }
          : empty(),
      );
      setError(null);
    }
  }, [open, host]);

  const set = <K extends keyof Host>(k: K, v: Host[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const authType = draft.auth_type ?? "password";

  const existingGroups = Array.from(
    new Set(hosts.map((h) => h.group?.trim()).filter(Boolean)),
  ) as string[];

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: Host = {
        ...draft,
        label: draft.label.trim() || draft.host.trim(),
        host: draft.host.trim(),
        username: draft.username.trim(),
        port: Number(draft.port) || 22,
        key_id: authType === "key" ? draft.key_id ?? null : null,
        group: draft.group?.trim() || null,
      };
      const hosts = await invoke<Host[]>("host_upsert", { host: payload });
      onSaved(hosts);
      onOpenChange(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{host ? "Editar host" : "Nuevo host"}</DialogTitle>
          <DialogDescription>
            Guarda los datos de conexión y conéctate con un clic.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={save} className="space-y-4">
          <Field label="Nombre">
            <Input
              autoFocus
              placeholder="Servidor de producción"
              value={draft.label}
              onChange={(e) => set("label", e.target.value)}
            />
          </Field>

          <Field label="Grupo">
            <Input
              placeholder="Sin grupo"
              list="host-groups"
              value={draft.group ?? ""}
              onChange={(e) => set("group", e.target.value || null)}
            />
            <datalist id="host-groups">
              {existingGroups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </Field>

          <div className="flex gap-3">
            <Field label="Host" className="flex-1">
              <Input
                placeholder="192.168.1.10"
                value={draft.host}
                onChange={(e) => set("host", e.target.value)}
                required
              />
            </Field>
            <Field label="Puerto" className="w-24">
              <Input
                inputMode="numeric"
                value={String(draft.port)}
                onChange={(e) => set("port", Number(e.target.value) || 0)}
              />
            </Field>
          </div>

          <Field label="Usuario">
            <Input
              placeholder="root"
              value={draft.username}
              onChange={(e) => set("username", e.target.value)}
              required
            />
          </Field>

          {/* Método de autenticación */}
          <Field label="Autenticación">
            <div className="flex gap-1 rounded-lg bg-surface-2/60 p-1">
              <Seg active={authType === "password"} onClick={() => set("auth_type", "password")}>
                Contraseña
              </Seg>
              <Seg active={authType === "key"} onClick={() => set("auth_type", "key")}>
                Clave
              </Seg>
            </div>
          </Field>

          {authType === "password" ? (
            <Field label="Contraseña">
              <Input
                type="password"
                placeholder="••••••••"
                value={draft.password ?? ""}
                onChange={(e) => set("password", e.target.value)}
              />
            </Field>
          ) : (
            <Field label="Clave privada">
              {keys.length === 0 ? (
                <p className="rounded-lg border border-border bg-surface-2/40 px-3 py-2 text-xs text-muted-foreground">
                  No tienes claves guardadas. Crea una en la sección «Claves».
                </p>
              ) : (
                <select
                  value={draft.key_id ?? ""}
                  onChange={(e) => set("key_id", e.target.value || null)}
                  className="h-10 w-full rounded-lg border border-input bg-surface-2/60 px-3 text-sm text-fg outline-none focus-visible:border-amber/50 focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <option value="">Elige una clave…</option>
                  {keys.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}

          <Field label="Salto (jump host)">
            <select
              value={draft.jump_host_id ?? ""}
              onChange={(e) => set("jump_host_id", e.target.value || null)}
              className="h-10 w-full rounded-lg border border-input bg-surface-2/60 px-3 text-sm text-fg outline-none focus-visible:border-amber/50 focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <option value="">Directo (sin salto)</option>
              {hosts
                .filter((h) => h.id !== draft.id)
                .map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.label || h.host}
                  </option>
                ))}
            </select>
          </Field>

          <Field label="Color">
            <div className="flex flex-wrap gap-2 pt-1">
              {HOST_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set("color", c)}
                  className={cn(
                    "size-7 rounded-full transition-transform",
                    draft.color === c
                      ? "ring-2 ring-offset-2 ring-offset-surface ring-white/80 scale-110"
                      : "hover:scale-110",
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`color ${c}`}
                />
              ))}
            </div>
          </Field>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                saving ||
                !draft.host ||
                !draft.username ||
                (authType === "key" && !draft.key_id)
              }
            >
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("block space-y-1.5", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Seg({
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
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
        active ? "bg-elevated text-fg shadow-sm" : "text-muted-foreground hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
