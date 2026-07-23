import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUi } from "@/stores/ui";

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "Conexión",
    items: [
      ["Buscar y conectar", "⌘T"],
      ["Paleta de comandos", "⌘K"],
      ["Nuevo host", "⌘N"],
    ],
  },
  {
    title: "Sesiones",
    items: [
      ["Ir a la pestaña 1–9", "⌘1–9"],
      ["Ciclar pestañas", "⌃Tab"],
      ["Dividir la vista", "⌘D"],
      ["Enviar a todas (broadcast)", "⌘⇧B"],
      ["Buscar en el terminal", "⌘F"],
      ["Cerrar sesión", "⌘W"],
    ],
  },
  {
    title: "App",
    items: [
      ["Preferencias", "⌘,"],
      ["Bloquear el vault", "⌘L"],
      ["Esta ayuda", "⌘/"],
    ],
  },
];

function Keys({ combo }: { combo: string }) {
  return (
    <span className="flex gap-1">
      {combo.split(/(?<=.)(?=[⌘⌃⇧⌥])/).map((k, i) => (
        <kbd
          key={i}
          className="min-w-6 rounded border border-border bg-white/[0.04] px-1.5 py-0.5 text-center font-mono text-[11px] text-muted-foreground"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

export function ShortcutsDialog() {
  const open = useUi((s) => s.shortcutsOpen);
  const setOpen = useUi((s) => s.setShortcutsOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Atajos de teclado</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground/60 uppercase">
                {group.title}
              </p>
              <div className="grid gap-1">
                {group.items.map(([label, combo]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between gap-4 py-1"
                  >
                    <span className="text-[13px]">{label}</span>
                    <Keys combo={combo} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
