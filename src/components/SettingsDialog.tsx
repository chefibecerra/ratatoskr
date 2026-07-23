import { useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  ArrowLeftRight,
  Cable,
  Lock,
  Palette,
  ShieldCheck,
  SquareTerminal,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
import { useLibrary } from "@/stores/library";
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

import logo from "@/assets/ratatoskr.png?inline";

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

function ThemePreview({ themeId }: { themeId: string }) {
  const c = TERMINAL_THEMES.find((t) => t.id === themeId)?.colors;
  if (!c) return null;
  return (
    <div
      className="mt-1 rounded-lg border border-border p-3 font-mono text-[11px] leading-5"
      style={{ backgroundColor: c.background as string, color: c.foreground as string }}
    >
      <div>
        <span style={{ color: c.green as string }}>deploy@web-prod</span>
        <span style={{ color: c.foreground as string }}>:</span>
        <span style={{ color: c.blue as string }}>~</span>$ ls
      </div>
      <div>
        <span style={{ color: c.blue as string }}>backups</span>{"  "}
        <span style={{ color: c.green as string }}>deploy.sh</span>{"  "}
        <span style={{ color: c.red as string }}>error.log</span>{"  "}
        <span style={{ color: c.yellow as string }}>config.yml</span>
      </div>
      <div>
        <span style={{ color: c.green as string }}>deploy@web-prod</span>
        <span style={{ color: c.foreground as string }}>:</span>
        <span style={{ color: c.blue as string }}>~</span>${" "}
        <span
          className="inline-block h-3 w-1.5 align-text-bottom"
          style={{ backgroundColor: c.cursor as string }}
        />
      </div>
    </div>
  );
}

function KnownHostsManager() {
  const knownHosts = useLibrary((s) => s.knownHosts);
  const loadKnownHosts = useLibrary((s) => s.loadKnownHosts);
  const forget = useLibrary((s) => s.forgetKnownHost);

  useEffect(() => {
    void loadKnownHosts();
  }, [loadKnownHosts]);

  return (
    <div className="py-2.5">
      <Label className="text-[13px] font-normal">Servidores conocidos</Label>
      <p className="mt-0.5 mb-2 text-[11px] text-muted-foreground">
        Huellas verificadas. Olvida una si un servidor cambió de clave de forma
        legítima (reinstalación) para poder reconectar.
      </p>
      {knownHosts.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/70">
          Aún no hay servidores registrados.
        </p>
      ) : (
        <div className="max-h-36 space-y-0.5 overflow-y-auto">
          {knownHosts.map((entry) => (
            <div
              key={entry.host}
              className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50"
            >
              <div className="min-w-0 flex-1">
                <span className="block truncate text-xs">{entry.host}</span>
                <span
                  className="block truncate font-mono text-[10px] text-muted-foreground"
                  title={entry.fingerprint}
                >
                  {entry.fingerprint}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100"
                onClick={() => void forget(entry.host)}
                title="Olvidar este servidor"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
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
  const [appVersion, setAppVersion] = useState("");

  useEffect(() => {
    void getVersion().then(setAppVersion);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="text-[15px]">Preferencias</DialogTitle>
        </DialogHeader>

        {/* layout estilo Ajustes del Sistema: categorías a la izquierda */}
        <Tabs
          defaultValue="apariencia"
          orientation="vertical"
          className="flex flex-row gap-0"
        >
          <div className="flex h-[400px] w-44 flex-col border-r border-border">
            <TabsList className="flex flex-1 flex-col items-stretch justify-start gap-0.5 rounded-none border-0 bg-transparent p-2">
              {[
                { v: "apariencia", label: "Apariencia", Icon: Palette },
                { v: "terminal", label: "Terminal", Icon: SquareTerminal },
                { v: "conexion", label: "Conexión", Icon: Cable },
                { v: "datos", label: "Datos", Icon: ArrowLeftRight },
                { v: "seguridad", label: "Seguridad", Icon: ShieldCheck },
                { v: "vault", label: "Vault", Icon: Lock },
              ].map(({ v, label, Icon }) => (
                <TabsTrigger
                  key={v}
                  value={v}
                  className="justify-start gap-2 rounded-md px-2.5 py-1.5 text-[13px] data-[state=active]:bg-accent data-[state=active]:shadow-none"
                >
                  <Icon className="size-4 shrink-0" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
              <img
                src={logo}
                alt=""
                className="size-6 rounded-md"
                draggable={false}
              />
              <div className="min-w-0 leading-tight">
                <div className="text-[12px] font-medium">Ratatoskr</div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  v{appVersion || "…"}
                </div>
              </div>
            </div>
          </div>

          {/* altura fija: cambiar de categoría no redimensiona el diálogo */}
          <div className="h-[400px] flex-1 overflow-y-auto px-5 py-3">
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

              <ThemePreview themeId={settings.themeId} />

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

              <Separator className="my-2" />
              <KnownHostsManager />
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
