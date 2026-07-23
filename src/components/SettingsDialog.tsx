import { useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  backupExport,
  backupImport,
  hostsExport,
  hostsImport,
  openLogsDir,
  settingsExport,
  settingsImport,
  vaultExport,
  vaultImport,
  vaultInfo,
  type VaultInfo,
} from "@/lib/ipc";
import { useHosts } from "@/stores/hosts";
import { TERMINAL_THEMES } from "@/lib/terminal-themes";
import {
  FONT_FAMILIES,
  useSettings,
  type CursorStyle,
} from "@/stores/settings";
import { useUpdater } from "@/stores/updater";
import { useVault } from "@/stores/vault";
import { toast } from "sonner";
import { getVersion } from "@tauri-apps/api/app";

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

function VaultTab({ onImported }: { onImported: () => void }) {
  const [info, setInfo] = useState<VaultInfo | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    void vaultInfo()
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  const doFullExport = async () => {
    setFeedback(null);
    const target = await save({
      defaultPath: "ratatoskr-backup.json",
      filters: [{ name: "Copia de Ratatoskr", extensions: ["json"] }],
    });
    if (!target) return;
    try {
      await backupExport(target, useSettings.getState());
      setFeedback("Copia completa exportada.");
    } catch (e) {
      setFeedback(String(e));
    }
  };

  const doFullImport = async () => {
    setFeedback(null);
    const source = await open({
      multiple: false,
      filters: [{ name: "Copia de Ratatoskr", extensions: ["json"] }],
    });
    if (typeof source !== "string") return;
    try {
      const settings = await backupImport(source);
      if (settings && typeof settings === "object") {
        useSettings.setState(settings);
      }
      onImported();
    } catch (e) {
      setFeedback(String(e));
    }
  };

  const doVaultExport = async () => {
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

  const doVaultImport = async () => {
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
      <Row
        label="Copia completa"
        hint="Vault cifrado + ajustes + servidores conocidos + historial, en un archivo. Para moverte de equipo o de cuenta."
      >
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => void doFullExport()}
        >
          Exportar…
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => void doFullImport()}
        >
          Restaurar…
        </Button>
      </Row>

      <Row
        label="Solo el vault"
        hint={
          info
            ? `Revisión ${info.revision} · únicamente el archivo cifrado, ideal para sync por carpeta compartida.`
            : "Únicamente el archivo cifrado."
        }
      >
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => void doVaultExport()}
        >
          Exportar…
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => void doVaultImport()}
        >
          Restaurar…
        </Button>
      </Row>

      <p className="pt-1 text-[11px] leading-4 text-muted-foreground/70">
        Toda restauración respalda lo actual (.bak) y vuelve a pedir la
        contraseña maestra de la copia.
      </p>

      {feedback && (
        <p className="pt-1 text-[11px] text-muted-foreground">{feedback}</p>
      )}
    </>
  );
}

function DataTab() {
  const [feedback, setFeedback] = useState<string | null>(null);

  const exportHosts = async () => {
    setFeedback(null);
    const target = await save({
      defaultPath: "ratatoskr-hosts.json",
      filters: [{ name: "Hosts", extensions: ["json"] }],
    });
    if (!target) return;
    try {
      const count = await hostsExport(target);
      setFeedback(`${count} host${count === 1 ? "" : "s"} exportados.`);
    } catch (e) {
      setFeedback(String(e));
    }
  };

  const importHosts = async () => {
    setFeedback(null);
    const source = await open({
      multiple: false,
      filters: [{ name: "Hosts", extensions: ["json"] }],
    });
    if (typeof source !== "string") return;
    try {
      const incoming = await hostsImport(source);
      const existing = useHosts.getState().hosts;
      const fresh = incoming.filter(
        (h) =>
          !existing.some(
            (e) =>
              e.name === h.name ||
              (e.hostname === h.hostname && e.port === h.port),
          ),
      );
      for (const host of fresh) {
        await useHosts.getState().save({ ...host, id: "" });
      }
      setFeedback(
        `${fresh.length} host${fresh.length === 1 ? "" : "s"} importados${
          incoming.length !== fresh.length ? " (se omitieron duplicados)" : ""
        }.`,
      );
    } catch (e) {
      setFeedback(String(e));
    }
  };

  const exportSettings = async () => {
    setFeedback(null);
    const target = await save({
      defaultPath: "ratatoskr-config.json",
      filters: [{ name: "Configuración", extensions: ["json"] }],
    });
    if (!target) return;
    try {
      await settingsExport(target, useSettings.getState());
      setFeedback("Configuración exportada.");
    } catch (e) {
      setFeedback(String(e));
    }
  };

  const importSettings = async () => {
    setFeedback(null);
    const source = await open({
      multiple: false,
      filters: [{ name: "Configuración", extensions: ["json"] }],
    });
    if (typeof source !== "string") return;
    try {
      const incoming = await settingsImport(source);
      if (incoming && typeof incoming === "object") {
        // conserva la función update del store, solo aplica los valores
        useSettings.setState(incoming);
        setFeedback("Configuración aplicada.");
      }
    } catch (e) {
      setFeedback(String(e));
    }
  };

  return (
    <>
      <Row
        label="Hosts"
        hint="Lista legible para compartir. Las contraseñas no se incluyen; se piden al conectar."
      >
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => void exportHosts()}
        >
          Exportar…
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => void importHosts()}
        >
          Importar…
        </Button>
      </Row>

      <Row label="Configuración" hint="Tus preferencias, sin datos sensibles.">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => void exportSettings()}
        >
          Exportar…
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => void importSettings()}
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

function UpdateRow() {
  const checkManual = useUpdater((s) => s.checkManual);
  const [version, setVersion] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    void getVersion().then(setVersion);
  }, []);

  const check = async () => {
    setChecking(true);
    try {
      const found = await checkManual();
      if (!found) toast.success("Ratatoskr está actualizado.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <Row label="Actualizaciones" hint={version ? `Versión ${version}` : undefined}>
      <Button
        variant="outline"
        size="sm"
        className="h-8 text-xs"
        disabled={checking}
        onClick={() => void check()}
      >
        {checking ? "Buscando…" : "Buscar actualizaciones"}
      </Button>
    </Row>
  );
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const settings = useSettings();
  const checkVault = useVault((s) => s.check);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-3 sm:max-w-110">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Preferencias</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="apariencia">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="apariencia" className="text-xs">
              Apariencia
            </TabsTrigger>
            <TabsTrigger value="terminal" className="text-xs">
              Terminal
            </TabsTrigger>
            <TabsTrigger value="conexion" className="text-xs">
              Conexión
            </TabsTrigger>
            <TabsTrigger value="datos" className="text-xs">
              Datos
            </TabsTrigger>
            <TabsTrigger value="seguridad" className="text-xs">
              Seguridad
            </TabsTrigger>
            <TabsTrigger value="vault" className="text-xs">
              Vault
            </TabsTrigger>
          </TabsList>

          {/* altura fija: cambiar de pestaña no redimensiona el diálogo */}
          <div className="h-72 overflow-y-auto pt-2">
            <TabsContent value="apariencia" className="mt-0">
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
            </TabsContent>

            <TabsContent value="terminal" className="mt-0">
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

              <Row label="Interlineado">
                <Slider
                  className="w-32"
                  min={1}
                  max={1.6}
                  step={0.05}
                  value={[settings.lineHeight]}
                  onValueChange={([v]) => settings.update({ lineHeight: v })}
                />
                <span className="w-9 text-right font-mono text-[11px] text-muted-foreground">
                  {settings.lineHeight.toFixed(2)}
                </span>
              </Row>

              <Row label="Scrollback" hint="Líneas de historial en pantalla.">
                <Slider
                  className="w-32"
                  min={1000}
                  max={50000}
                  step={1000}
                  value={[settings.scrollback]}
                  onValueChange={([v]) => settings.update({ scrollback: v })}
                />
                <span className="w-9 text-right font-mono text-[11px] text-muted-foreground">
                  {settings.scrollback / 1000}k
                </span>
              </Row>

              <Row label="Parpadeo del cursor">
                <Switch
                  checked={settings.cursorBlink}
                  onCheckedChange={(v) => settings.update({ cursorBlink: v })}
                />
              </Row>

              <Row
                label="Copiar al seleccionar"
                hint="El texto seleccionado va directo al portapapeles."
              >
                <Switch
                  checked={settings.copyOnSelect}
                  onCheckedChange={(v) => settings.update({ copyOnSelect: v })}
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
            </TabsContent>

            <TabsContent value="conexion" className="mt-0">
              <Row
                label="Reconexión automática"
                hint="Reintenta una vez si la conexión se corta sola."
              >
                <Switch
                  checked={settings.autoReconnect}
                  onCheckedChange={(v) => settings.update({ autoReconnect: v })}
                />
              </Row>

              <Row
                label="Keepalive"
                hint="Mantiene viva la conexión en redes con timeouts agresivos."
              >
                <Select
                  value={String(settings.keepaliveSecs)}
                  onValueChange={(v) =>
                    settings.update({ keepaliveSecs: Number(v) })
                  }
                >
                  <SelectTrigger className="h-8 w-44 text-[13px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">Cada 15 segundos</SelectItem>
                    <SelectItem value="30">Cada 30 segundos</SelectItem>
                    <SelectItem value="60">Cada 60 segundos</SelectItem>
                    <SelectItem value="0">Desactivado</SelectItem>
                  </SelectContent>
                </Select>
              </Row>

              <Row
                label="Confirmar al cerrar"
                hint="Pregunta antes de cerrar una sesión conectada."
              >
                <Switch
                  checked={settings.confirmClose}
                  onCheckedChange={(v) => settings.update({ confirmClose: v })}
                />
              </Row>

              <Row
                label="Guardar historial"
                hint="Si está apagado, las conexiones no dejan rastro."
              >
                <Switch
                  checked={settings.saveHistory}
                  onCheckedChange={(v) => settings.update({ saveHistory: v })}
                />
              </Row>

              <Row
                label="Registro de sesión"
                hint="Graba la salida del terminal a un archivo (sin códigos de color). Aplica a las próximas sesiones."
              >
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() =>
                      void openLogsDir().then((p) => void openPath(p))
                    }
                  >
                    Abrir carpeta
                  </Button>
                  <Switch
                    checked={settings.recordSessionLog}
                    onCheckedChange={(v) =>
                      settings.update({ recordSessionLog: v })
                    }
                  />
                </div>
              </Row>
            </TabsContent>

            <TabsContent value="datos" className="mt-0">
              <DataTab />
            </TabsContent>

            <TabsContent value="seguridad" className="mt-0">
              <UpdateRow />

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
            </TabsContent>

            <TabsContent value="vault" className="mt-0">
              <VaultTab
                onImported={() => {
                  onOpenChange(false);
                  void checkVault();
                }}
              />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
