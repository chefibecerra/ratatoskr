import { useEffect, useState, type FormEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Eye, EyeOff, Copy, Check, Fingerprint, FileKey } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { KeyInfo, SshKey } from "@/lib/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sshKey: SshKey | null;
  onSaved: (keys: SshKey[]) => void;
};

const empty = (): SshKey => ({
  id: crypto.randomUUID(),
  label: "",
  private_key: "",
  path: null,
  passphrase: "",
});

export function KeyDialog({ open, onOpenChange, sshKey, onSaved }: Props) {
  const [draft, setDraft] = useState<SshKey>(empty);
  const [info, setInfo] = useState<KeyInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usingPath = !!(draft.path && draft.path.trim());

  useEffect(() => {
    if (open) {
      setDraft(sshKey ? { ...sshKey, passphrase: sshKey.passphrase ?? "" } : empty());
      setInfo(null);
      setInfoError(null);
      setReveal(!sshKey);
      setError(null);
    }
  }, [open, sshKey]);

  // Analiza la clave (tipo + fingerprint) desde la ruta o el contenido.
  useEffect(() => {
    const path = draft.path?.trim();
    const pk = draft.private_key.trim();
    if (!path && !pk) {
      setInfo(null);
      setInfoError(null);
      return;
    }
    const t = setTimeout(() => {
      invoke<KeyInfo>("key_info", path ? { path } : { privateKey: pk })
        .then((i) => {
          setInfo(i);
          setInfoError(null);
        })
        .catch((e) => {
          setInfo(null);
          setInfoError(String(e));
        });
    }, 350);
    return () => clearTimeout(t);
  }, [draft.private_key, draft.path]);

  async function pickFile() {
    const file = await openDialog({ multiple: false, title: "Elegir clave privada" });
    if (typeof file === "string") {
      setDraft((d) => ({ ...d, path: file, private_key: "" }));
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: SshKey = {
        ...draft,
        label:
          draft.label.trim() ||
          draft.path?.split("/").pop() ||
          info?.algorithm ||
          "Clave SSH",
        private_key: usingPath ? "" : draft.private_key.trim(),
        path: usingPath ? draft.path : null,
      };
      const keys = await invoke<SshKey[]>("key_upsert", { key: payload });
      onSaved(keys);
      onOpenChange(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  async function copyKey() {
    await navigator.clipboard.writeText(draft.private_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{sshKey ? "Clave SSH" : "Nueva clave SSH"}</DialogTitle>
          <DialogDescription>
            Elige un archivo de clave (p. ej. ~/.ssh/id_ed25519) o pega el contenido.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={save} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Nombre</span>
            <Input
              autoFocus={!sshKey}
              placeholder="Clave personal"
              value={draft.label}
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            />
          </label>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Archivo de clave
            </span>
            <div className="flex gap-2">
              <Input
                placeholder="~/.ssh/id_ed25519"
                value={draft.path ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, path: e.target.value }))}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="secondary"
                className="shrink-0"
                onClick={pickFile}
              >
                <FileKey /> Examinar…
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground/70">
              Escribe la ruta (admite <span className="font-mono">~</span>). Las
              carpetas ocultas como <span className="font-mono">.ssh</span> no
              aparecen en el diálogo: escríbela a mano.
            </p>
          </div>

          {!usingPath && (
            <label className="block space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  o pega el contenido
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setReveal((r) => !r)}
                    className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-surface-2 hover:text-fg"
                  >
                    {reveal ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    {reveal ? "Ocultar" : "Mostrar"}
                  </button>
                  {draft.private_key && (
                    <button
                      type="button"
                      onClick={copyKey}
                      className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-surface-2 hover:text-fg"
                    >
                      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      {copied ? "Copiada" : "Copiar"}
                    </button>
                  )}
                </div>
              </div>
              <textarea
                value={draft.private_key}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, private_key: e.target.value }))
                }
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                spellCheck={false}
                rows={6}
                className="w-full resize-none rounded-lg border border-input bg-surface-2/60 px-3 py-2 font-mono text-xs leading-relaxed text-fg outline-none select-text placeholder:text-muted-foreground/60 focus-visible:border-amber/50 focus-visible:ring-2 focus-visible:ring-ring/40"
                style={reveal ? undefined : ({ WebkitTextSecurity: "disc" } as object)}
              />
            </label>
          )}

          {info && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2/40 px-3 py-2 text-xs">
              <Fingerprint className="size-4 shrink-0 text-leaf" />
              <span className="font-medium text-fg">{info.algorithm}</span>
              <span className="truncate font-mono text-muted-foreground">
                {info.fingerprint}
              </span>
              {info.encrypted && (
                <span className="ml-auto shrink-0 rounded-full bg-amber/15 px-2 py-0.5 text-[10px] font-medium text-amber">
                  cifrada
                </span>
              )}
            </div>
          )}
          {infoError && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {infoError}
            </p>
          )}

          {info?.encrypted && (
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Passphrase
              </span>
              <Input
                type="password"
                placeholder="Passphrase de la clave"
                value={draft.passphrase ?? ""}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, passphrase: e.target.value }))
                }
              />
            </label>
          )}

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
              disabled={saving || (!usingPath && !draft.private_key.trim())}
            >
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
