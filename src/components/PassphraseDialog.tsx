import { useEffect, useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PassphraseDialog({
  open,
  hostLabel,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  hostLabel: string;
  error?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (passphrase: string, remember: boolean) => void;
}) {
  const [value, setValue] = useState("");
  const [remember, setRemember] = useState(false);

  useEffect(() => {
    if (open) {
      setValue("");
      setRemember(false);
    }
  }, [open]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (value) onSubmit(value, remember);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-amber" /> Passphrase de la clave
          </DialogTitle>
          <DialogDescription>
            La clave de «{hostLabel}» está cifrada. Introduce su passphrase para
            conectar (no se guarda).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <Input
            autoFocus
            type="password"
            placeholder="Passphrase"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-4 accent-amber"
            />
            Guardar la passphrase para este host
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!value}>
              Conectar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
