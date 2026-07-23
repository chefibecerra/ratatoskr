import { useState } from "react";
import { LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useVault } from "@/stores/vault";

export function LockScreen() {
  const status = useVault((s) => s.status);
  const create = useVault((s) => s.create);
  const unlock = useVault((s) => s.unlock);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const creating = status === "uninitialized";

  const submit = async () => {
    if (busy) return;
    setError(null);
    if (creating && password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      await (creating ? create(password) : unlock(password));
    } catch (e) {
      setError(String(e));
      setPassword("");
      setConfirm("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-terminal">
      {/* toda la pantalla de bloqueo permite arrastrar la ventana */}
      <div data-tauri-drag-region className="absolute inset-x-0 top-0 h-12" />

      {status === "loading" ? null : (
        <div className="flex flex-col items-center gap-6 duration-300 animate-in fade-in zoom-in-95">
          <div className="flex flex-col items-center gap-3">
            <LockKeyhole className="size-5 text-muted-foreground" />
            <div className="text-center">
              <h1 className="text-xl font-light tracking-tight">Ratatoskr</h1>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {creating
                  ? "Crea una contraseña maestra para cifrar tus datos."
                  : "Introduce tu contraseña maestra."}
              </p>
            </div>
          </div>

          <form
            className="flex w-64 flex-col gap-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <Input
              type="password"
              autoFocus
              placeholder="Contraseña maestra"
              className="h-9 text-center"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {creating && (
              <Input
                type="password"
                placeholder="Repite la contraseña"
                className="h-9 text-center"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            )}
            {error && (
              <p className="text-center text-xs text-destructive">{error}</p>
            )}
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              className="h-8 rounded-full"
              disabled={busy || password.length === 0}
            >
              {busy ? "Un momento…" : creating ? "Crear vault" : "Desbloquear"}
            </Button>
            {creating && (
              <p className="text-center text-[11px] leading-4 text-muted-foreground/70">
                Mínimo 8 caracteres. Sin esta contraseña no hay forma de
                recuperar los datos.
              </p>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
