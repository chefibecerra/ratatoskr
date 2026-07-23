import { useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { vaultExport, vaultImport, vaultInfo, type VaultInfo } from "@/lib/ipc";
import { TERMINAL_THEMES } from "@/lib/terminal-themes";
import {
  FONT_FAMILIES,
  useSettings,
  type CursorStyle,
} from "@/stores/settings";
import { useVault } from "@/stores/vault";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-2.5">
      <div className="min-w-0">
        <Label className="text-[13px] font-normal">{label}</Label>
        {hint && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2.5">{children}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="pt-1 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">
      {children}
    </p>
  );
}

function VaultSection({ onImported }: { onImported: () => void }) {
  const [info, setInfo] = useState<VaultInfo | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    void vaultInfo()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  const doExport = async () => {
    setFeedback(null);
    const target = await save({
      defaultPath: "ratatoskr-vault.enc",
      filters: [{ name: "Vault", extensions: ["enc"] }],
    });
    if (!target) return;
    try {
      await vaultExport(target);
      setFeedback("Vault exportado.");
    } catch (e) {
      setFeedback(String(e));
    }
  };

  const doImport = async () => {
    setFeedback(null);
    const source = await open({
      multiple: false,
      filters: [{ name: "Vault", extensions: ["enc"] }],
    });
    if (typeof source !== "string") return;
    try {
      await vaultImport(source);
      onImported();
    } catch (e) {
      setFeedback(String(e));
    }
  };

  return (
    <>
      <Separator className="my-2" />
      <SectionTitle>Vault</SectionTitle>

      <Row
        label="Copia de seguridad"
        hint={
          info
            ? `Revisión ${info.revision} · el archivo exportado se abre con tu contraseña maestra.`
            : "El archivo exportado se abre con tu contraseña maestra."
        }
      >
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => void doExport()}
        >
          Exportar…
        </Button>
      </Row>

      <Row
        label="Restaurar"
        hint="Reemplaza el vault actual (se guarda una copia .bak) y pide la contraseña del importado."
      >
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => void doImport()}
        >
          Importar…
        </Button>
      </Row>

      {feedback && (
        <p className="pt-1 text-[11px] text-muted-foreground">{feedback}</p>
      )}
    </>
  );
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const settings = useSettings();
  const checkVault = useVault((s) => s.check);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-105">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Preferencias</DialogTitle>
          <DialogDescription className="text-xs">
            Los cambios se aplican al instante y quedan guardados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <SectionTitle>Apariencia</SectionTitle>

          <Row label="Tema del terminal">
            <Select
              value={settings.themeId}
              onValueChange={(v) => settings.update({ themeId: v })}
            >
              <SelectTrigger className="h-8 w-44 text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TERMINAL_THEMES.map((theme) => (
                  <SelectItem key={theme.id} value={theme.id}>
                    <span
                      className="mr-1 inline-block size-2.5 rounded-full border border-white/20"
                      style={{ backgroundColor: theme.colors.background }}
                    />
                    {theme.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>

          <Row
            label="Opacidad"
            hint="Por debajo de 100 % la ventana deja ver el escritorio con blur."
          >
            <Slider
              className="w-32"
              min={50}
              max={100}
              step={5}
              value={[settings.opacity]}
              onValueChange={([v]) => settings.update({ opacity: v })}
            />
            <span className="w-9 text-right font-mono text-[11px] text-muted-foreground">
              {settings.opacity}%
            </span>
          </Row>

          <Separator className="my-2" />
          <SectionTitle>Terminal</SectionTitle>

          <Row label="Fuente">
            <Select
              value={settings.fontFamily}
              onValueChange={(v) => settings.update({ fontFamily: v })}
            >
              <SelectTrigger className="h-8 w-44 text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_FAMILIES.map((font) => (
                  <SelectItem key={font} value={font}>
                    <span style={{ fontFamily: `'${font}', monospace` }}>
                      {font}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>

          <Row label="Tamaño">
            <Slider
              className="w-32"
              min={10}
              max={20}
              step={1}
              value={[settings.fontSize]}
              onValueChange={([v]) => settings.update({ fontSize: v })}
            />
            <span className="w-9 text-right font-mono text-[11px] text-muted-foreground">
              {settings.fontSize}px
            </span>
          </Row>

          <Row label="Cursor">
            <Select
              value={settings.cursorStyle}
              onValueChange={(v) =>
                settings.update({ cursorStyle: v as CursorStyle })
              }
            >
              <SelectTrigger className="h-8 w-44 text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="block">Bloque</SelectItem>
                <SelectItem value="bar">Barra</SelectItem>
                <SelectItem value="underline">Subrayado</SelectItem>
              </SelectContent>
            </Select>
          </Row>

          <Row label="Parpadeo del cursor">
            <Switch
              checked={settings.cursorBlink}
              onCheckedChange={(v) => settings.update({ cursorBlink: v })}
            />
          </Row>

          <Row
            label="Opción (⌥) como Meta"
            hint="Necesario para atajos M- en tmux, vim y Emacs."
          >
            <Switch
              checked={settings.optionAsMeta}
              onCheckedChange={(v) => settings.update({ optionAsMeta: v })}
            />
          </Row>

          <Separator className="my-2" />
          <SectionTitle>Seguridad</SectionTitle>

          <Row
            label="Bloqueo automático"
            hint="Bloquea el vault tras un período sin actividad. ⌘L bloquea al instante."
          >
            <Select
              value={String(settings.autoLockMinutes)}
              onValueChange={(v) =>
                settings.update({ autoLockMinutes: Number(v) })
              }
            >
              <SelectTrigger className="h-8 w-44 text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">A los 5 minutos</SelectItem>
                <SelectItem value="15">A los 15 minutos</SelectItem>
                <SelectItem value="30">A los 30 minutos</SelectItem>
                <SelectItem value="0">Nunca</SelectItem>
              </SelectContent>
            </Select>
          </Row>

          <VaultSection
            onImported={() => {
              onOpenChange(false);
              void checkVault();
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
