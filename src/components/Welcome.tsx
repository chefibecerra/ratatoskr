import { Plus } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";

export function Welcome({
  hasHosts,
  onNew,
}: {
  hasHosts: boolean;
  onNew: () => void;
}) {
  return (
    <div className="grid h-full place-items-center p-8">
      <div className="flex max-w-xs flex-col items-center text-center">
        <BrandMark className="mb-6 size-16 text-fg/90" />
        <h1 className="font-display text-xl font-semibold tracking-tight text-fg">
          Ratatoskr
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Corre por el árbol.
        </p>
        <p className="mt-6 text-[13px] leading-relaxed text-muted-foreground">
          {hasHosts
            ? "Elige un host de la izquierda para abrir una terminal."
            : "Guarda tu primer servidor y conéctate por SSH con un solo clic."}
        </p>
        {!hasHosts && (
          <Button className="mt-6" onClick={onNew}>
            <Plus /> Agregar host
          </Button>
        )}
      </div>
    </div>
  );
}
