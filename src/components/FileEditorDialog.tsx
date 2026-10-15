import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function FileEditorDialog({
  open,
  sessionId,
  path,
  name,
  onOpenChange,
}: {
  open: boolean;
  sessionId: string;
  path: string;
  name: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setContent("");
    invoke<string>("sftp_read_text", { id: sessionId, path })
      .then((text) => {
        setContent(text);
        setOriginal(text);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [open, sessionId, path]);

  const dirty = content !== original;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await invoke("sftp_write_text", { id: sessionId, path, content });
      setOriginal(content);
      onOpenChange(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[72vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle className="truncate font-mono text-sm">{name}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-destructive">
            {error}
          </div>
        ) : (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            className="min-h-0 flex-1 resize-none rounded-lg border border-border bg-[#0C0C0E] p-3 font-mono text-xs leading-relaxed text-fg outline-none select-text focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        )}

        <div className="flex items-center justify-between pt-3">
          <span className="text-xs text-muted-foreground">
            {dirty ? "Cambios sin guardar" : ""}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
            <Button onClick={save} disabled={saving || loading || !!error || !dirty}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
