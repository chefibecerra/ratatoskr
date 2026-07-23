import { useEffect, useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { useLibrary } from "@/stores/library";
import { useUi } from "@/stores/ui";

export function SnippetForm() {
  const open = useUi((s) => s.snippetFormOpen);
  const setOpen = useUi((s) => s.setSnippetFormOpen);
  const editing = useUi((s) => s.editingSnippet);
  const save = useLibrary((s) => s.saveSnippet);

  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setCommand(editing?.command ?? "");
      setError(null);
    }
  }, [open, editing]);

  const submit = async () => {
    if (!name.trim() || !command.trim()) {
      setError("El nombre y el comando son obligatorios.");
      return;
    }
    try {
      await save({
        id: editing?.id ?? "",
        name: name.trim(),
        command: command.trim(),
      });
      setOpen(false);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Editar fragmento" : "Nuevo fragmento"}
          </DialogTitle>
          <DialogDescription>
            Se ejecuta en la sesión activa con un clic.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="snippet-name">Nombre</Label>
            <Input
              id="snippet-name"
              placeholder="Reiniciar nginx"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="snippet-command">Comando</Label>
            <Textarea
              id="snippet-command"
              placeholder="sudo systemctl restart nginx"
              className="min-h-20 font-mono text-xs"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
