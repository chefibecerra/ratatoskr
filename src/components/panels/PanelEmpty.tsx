import type { LucideIcon } from "lucide-react";

interface PanelEmptyProps {
  icon: LucideIcon;
  message: string;
  children?: React.ReactNode;
}

/** Estado vacío consistente en todos los paneles: icono tenue + texto + acción. */
export function PanelEmpty({ icon: Icon, message, children }: PanelEmptyProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center duration-300 animate-in fade-in">
      <div className="flex size-11 items-center justify-center rounded-2xl border border-border bg-white/[0.02]">
        <Icon className="size-5 text-muted-foreground/60" />
      </div>
      <p className="max-w-[200px] text-xs leading-5 text-muted-foreground">
        {message}
      </p>
      {children}
    </div>
  );
}
