import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { sftpReadText, sftpWriteText } from "@/lib/ipc";

interface SftpEditorProps {
  sftpId: string;
  path: string;
  onClose: () => void;
}

export function SftpEditor({ sftpId, path, onClose }: SftpEditorProps) {
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = path.split("/").pop() ?? path;
  const dirty = content !== original;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    sftpReadText(sftpId, path)
      .then((text) => {
        if (!alive) return;
        setContent(text);
        setOriginal(text);
      })
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [sftpId, path]);

  const save = async () => {
    setSaving(true);
    try {
      await sftpWriteText(sftpId, path, content);
      setOriginal(content);
      toast.success(`Guardado ${name}`);
      onClose();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[600px] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="font-mono text-[13px]">
            {path}
            {dirty && <span className="ml-2 text-muted-foreground">•</span>}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center px-6 text-center text-xs text-destructive">
            {error}
          </div>
        ) : (
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            className="flex-1 resize-none rounded-none border-0 bg-terminal font-mono text-xs leading-5 focus-visible:ring-0"
            onKeyDown={(e) => {
              // ⌘S guarda
              if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                e.preventDefault();
                if (dirty) void save();
              }
            }}
          />
        )}

        <DialogFooter className="border-t border-border px-4 py-2.5">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cerrar
          </Button>
          <Button
            size="sm"
            disabled={loading || !!error || !dirty || saving}
            onClick={() => void save()}
          >
            {saving ? "Guardando…" : "Guardar (⌘S)"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
