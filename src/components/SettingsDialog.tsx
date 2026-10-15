import { type ReactNode } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSettings, type CursorStyle } from "@/lib/settings";
import {
  FONT_FAMILIES,
  TERMINAL_THEMES,
  THEME_NAMES,
} from "@/lib/terminal-themes";
import { cn } from "@/lib/utils";

const CURSORS: { value: CursorStyle; label: string }[] = [
  { value: "block", label: "Bloque" },
  { value: "bar", label: "Barra" },
  { value: "underline", label: "Subrayado" },
];

function fontStack(family: string) {
  return `'${family}', ui-monospace, 'SF Mono', Menlo, monospace`;
}

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { settings, update, reset } = useSettings();
  const theme = TERMINAL_THEMES[settings.theme] ?? TERMINAL_THEMES.Ratatoskr;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="mb-0 border-b border-border px-6 py-4">
          <DialogTitle>Ajustes de terminal</DialogTitle>
          <DialogDescription>
            Todo se aplica al instante a tus sesiones abiertas.
          </DialogDescription>
        </DialogHeader>

        {/* Vista previa en vivo */}
        <div className="border-b border-border px-6 py-4">
          <div
            className="overflow-hidden rounded-lg border border-border"
            style={{
              background: theme.background,
              color: theme.foreground,
              fontFamily: fontStack(settings.fontFamily),
              fontSize: settings.fontSize,
              lineHeight: settings.lineHeight,
              padding: settings.padding,
            }}
          >
            <div>
              <span style={{ color: theme.green }}>chef@ratatoskr</span>
              <span>:</span>
              <span style={{ color: theme.blue }}>~/dev</span>
              <span>$ </span>
              <span style={{ color: theme.yellow }}>ssh mimir</span>
            </div>
            <div style={{ color: theme.brightBlack }}>→ conectando por SSH…</div>
            <div>
              <span style={{ color: theme.magenta }}>✓</span> sesión lista{" "}
              <PreviewCursor
                style={settings.cursorStyle}
                color={theme.cursor ?? "#fff"}
                blink={settings.cursorBlink}
              />
            </div>
          </div>
        </div>

        {/* Controles */}
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <Section title="Tema">
            <div className="grid grid-cols-2 gap-2">
              {THEME_NAMES.map((name) => {
                const t = TERMINAL_THEMES[name];
                const active = settings.theme === name;
                return (
                  <button
                    key={name}
                    onClick={() => update({ theme: name })}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
                      active
                        ? "border-amber/70 bg-surface-2"
                        : "border-border hover:bg-surface-2/60",
                    )}
                  >
                    <span
                      className="flex size-8 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md"
                      style={{ background: t.background }}
                    >
                      <span className="flex gap-0.5">
                        <Dot c={t.red} />
                        <Dot c={t.green} />
                        <Dot c={t.yellow} />
                      </span>
                      <span className="flex gap-0.5">
                        <Dot c={t.blue} />
                        <Dot c={t.magenta} />
                        <Dot c={t.cyan} />
                      </span>
                    </span>
                    <span className="truncate text-xs font-medium text-fg">
                      {name}
                    </span>
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="Tipografía">
            <Row label="Fuente">
              <select
                value={settings.fontFamily}
                onChange={(e) => update({ fontFamily: e.target.value })}
                className="h-9 w-full rounded-lg border border-input bg-surface-2/60 px-3 text-sm text-fg outline-none focus-visible:border-amber/50 focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {FONT_FAMILIES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Tamaño">
              <Stepper
                value={settings.fontSize}
                min={9}
                max={24}
                suffix="px"
                onChange={(v) => update({ fontSize: v })}
              />
            </Row>
            <Row label="Interlineado">
              <Stepper
                value={settings.lineHeight}
                min={1}
                max={2}
                step={0.05}
                format={(v) => v.toFixed(2)}
                onChange={(v) => update({ lineHeight: v })}
              />
            </Row>
          </Section>

          <Section title="Cursor">
            <Row label="Estilo">
              <div className="flex gap-1 rounded-lg bg-surface-2/60 p-1">
                {CURSORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => update({ cursorStyle: c.value })}
                    className={cn(
                      "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                      settings.cursorStyle === c.value
                        ? "bg-elevated text-fg shadow-sm"
                        : "text-muted-foreground hover:text-fg",
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </Row>
            <Row label="Parpadeo">
              <Toggle
                on={settings.cursorBlink}
                onClick={() => update({ cursorBlink: !settings.cursorBlink })}
              />
            </Row>
          </Section>

          <Section title="Terminal">
            <Row label="Margen interior">
              <Stepper
                value={settings.padding}
                min={0}
                max={32}
                step={2}
                suffix="px"
                onChange={(v) => update({ padding: v })}
              />
            </Row>
            <Row label="Historial (scrollback)">
              <Stepper
                value={settings.scrollback}
                min={1000}
                max={50000}
                step={1000}
                format={(v) => `${(v / 1000).toFixed(0)}k líneas`}
                onChange={(v) => update({ scrollback: v })}
              />
            </Row>
          </Section>
        </div>

        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <Button variant="ghost" onClick={reset}>
            <RotateCcw /> Restablecer
          </Button>
          <Button onClick={() => onOpenChange(false)}>Listo</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewCursor({
  style,
  color,
  blink,
}: {
  style: CursorStyle;
  color: string;
  blink: boolean;
}) {
  const animation = blink ? "rata-blink 1s step-end infinite" : undefined;
  if (style === "underline") {
    return (
      <span
        style={{
          display: "inline-block",
          width: "0.6em",
          height: "2px",
          background: color,
          verticalAlign: "baseline",
          animation,
        }}
      />
    );
  }
  return (
    <span
      style={{
        display: "inline-block",
        width: style === "bar" ? "2px" : "0.55em",
        height: "1.05em",
        background: color,
        verticalAlign: "text-bottom",
        animation,
      }}
    />
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-fg">{label}</span>
      <div className="w-56 shrink-0">{children}</div>
    </div>
  );
}

function Dot({ c }: { c?: string }) {
  return <span className="size-1.5 rounded-full" style={{ background: c }} />;
}

function Stepper({
  value,
  min,
  max,
  step = 1,
  suffix,
  format,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const snap = (v: number) => {
    const r = Math.round(v / step) * step;
    return Number(Math.min(max, Math.max(min, r)).toFixed(4));
  };
  return (
    <div className="flex items-center justify-end gap-2">
      <button
        onClick={() => onChange(snap(value - step))}
        className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <Minus className="size-3.5" />
      </button>
      <span className="w-20 text-center text-sm tabular-nums text-fg">
        {format ? format(value) : `${value}${suffix ? ` ${suffix}` : ""}`}
      </span>
      <button
        onClick={() => onChange(snap(value + step))}
        className="grid size-8 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <div className="flex justify-end">
      <button
        onClick={onClick}
        className={cn(
          "relative h-6 w-10 rounded-full transition-colors",
          on ? "bg-amber" : "bg-surface-2",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white transition-transform",
            on ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}
