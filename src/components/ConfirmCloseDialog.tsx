import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSessions } from "@/stores/sessions";
import { useUi } from "@/stores/ui";

export function ConfirmCloseDialog() {
  const sessionId = useUi((s) => s.confirmCloseSessionId);
  const setSessionId = useUi((s) => s.setConfirmCloseSessionId);
  const session = useSessions((s) =>
    s.sessions.find((x) => x.id === sessionId),
  );
  const close = useSessions((s) => s.close);

  const confirm = () => {
    if (sessionId) void close(sessionId);
    setSessionId(null);
  };

  return (
    <Dialog
      open={sessionId !== null}
      onOpenChange={(open) => !open && setSessionId(null)}
    >
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-[15px]">¿Cerrar la sesión?</DialogTitle>
          <DialogDescription className="text-xs">
            La conexión con{" "}
            <span className="font-medium text-foreground">
              {session?.title ?? "el servidor"}
            </span>{" "}
            se cerrará.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSessionId(null)}
            autoFocus
          >
            Cancelar
          </Button>
          <Button variant="destructive" size="sm" onClick={confirm}>
            Cerrar sesión
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
