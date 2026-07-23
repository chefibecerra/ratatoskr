import { Button } from "@/components/ui/button";
import { useHosts } from "@/stores/hosts";
import { useUi } from "@/stores/ui";

export function EmptyState() {
  const hosts = useHosts((s) => s.hosts);
  const openHostForm = useUi((s) => s.openHostForm);
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 bg-terminal duration-300 animate-in fade-in">
      <div className="text-center">
        <h2 className="text-xl font-light tracking-tight text-foreground">
          Ratatoskr
        </h2>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          {hosts.length === 0
            ? "Crea tu primer host para conectarte."
            : "Elige un host o abre la paleta para conectar."}
        </p>
      </div>

      {hosts.length === 0 ? (
        <Button
          size="sm"
          variant="secondary"
          className="h-7 rounded-full px-4 text-xs"
          onClick={() => openHostForm(null)}
        >
          Nuevo host
        </Button>
      ) : (
        <button
          className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setPaletteOpen(true)}
        >
          Buscar host
          <kbd className="rounded border border-border bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px]">
            ⌘T
          </kbd>
        </button>
      )}
    </div>
  );
}
