import { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal, type ITheme } from "@xterm/xterm";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Loader2 } from "lucide-react";
import "@xterm/xterm/css/xterm.css";

import { FindBar } from "@/components/FindBar";
import { Button } from "@/components/ui/button";
import { sshResize, sshWrite } from "@/lib/ipc";
import { getTheme } from "@/lib/terminal-themes";
import { useSessions, type Session } from "@/stores/sessions";
import { fontStack, useSettings } from "@/stores/settings";
import { useUi } from "@/stores/ui";

function xtermTheme(themeId: string, transparent: boolean): ITheme {
  const colors = getTheme(themeId).colors;
  // con opacidad activa el fondo lo pinta el contenedor (deja pasar el blur)
  return transparent ? { ...colors, background: "#00000000" } : { ...colors };
}

interface TerminalViewProps {
  session: Session;
  active: boolean;
}

export function TerminalView({ session, active }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const establish = useSessions((s) => s.establish);
  const reconnect = useSessions((s) => s.reconnect);
  const findOpen = useUi((s) => s.findOpen);
  const setFindOpen = useUi((s) => s.setFindOpen);
  const settings = useSettings();
  const transparent = settings.opacity < 100;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Lee los settings al momento de crear; los cambios se aplican en vivo
    // en el efecto de abajo sin recrear la instancia.
    const current = useSettings.getState();
    const term = new Terminal({
      cursorBlink: current.cursorBlink,
      cursorStyle: current.cursorStyle,
      fontSize: current.fontSize,
      lineHeight: current.lineHeight,
      fontFamily: fontStack(current.fontFamily),
      theme: xtermTheme(current.themeId, transparent),
      scrollback: current.scrollback,
      allowTransparency: transparent,
      macOptionIsMeta: current.optionAsMeta,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    const search = new SearchAddon();
    term.loadAddon(search);
    searchRef.current = search;
    term.loadAddon(new WebLinksAddon((_e, uri) => void openUrl(uri)));
    term.open(el);
    if (!transparent) {
      // el renderer WebGL no soporta fondo transparente
      try {
        term.loadAddon(new WebglAddon());
      } catch {
        // sin WebGL se usa el renderer DOM; más lento pero funcional
      }
    }
    termRef.current = term;
    fitRef.current = fit;

    const safeFit = () => {
      if (el.clientWidth === 0 || el.clientHeight === 0) return;
      fit.fit();
      void sshResize(session.id, term.cols, term.rows).catch(() => {});
    };

    if (el.clientWidth > 0) fit.fit();
    const dataSub = term.onData((data) => {
      void sshWrite(session.id, data).catch(() => {});
    });
    const selectionSub = term.onSelectionChange(() => {
      if (!useSettings.getState().copyOnSelect) return;
      const selection = term.getSelection();
      if (selection) void navigator.clipboard.writeText(selection);
    });
    const observer = new ResizeObserver(safeFit);
    observer.observe(el);

    return () => {
      observer.disconnect();
      dataSub.dispose();
      selectionSub.dispose();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
    };
  }, [session.id, transparent]);

  // Settings en vivo: xterm permite mutar options sin recrear.
  useEffect(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    const el = containerRef.current;
    if (!term || !fit) return;
    term.options.fontFamily = fontStack(settings.fontFamily);
    term.options.fontSize = settings.fontSize;
    term.options.lineHeight = settings.lineHeight;
    term.options.scrollback = settings.scrollback;
    term.options.cursorStyle = settings.cursorStyle;
    term.options.cursorBlink = settings.cursorBlink;
    term.options.macOptionIsMeta = settings.optionAsMeta;
    term.options.theme = xtermTheme(settings.themeId, transparent);
    if (el && el.clientWidth > 0) {
      fit.fit();
      void sshResize(session.id, term.cols, term.rows).catch(() => {});
    }
  }, [
    settings.fontFamily,
    settings.fontSize,
    settings.lineHeight,
    settings.scrollback,
    settings.cursorStyle,
    settings.cursorBlink,
    settings.optionAsMeta,
    settings.themeId,
    transparent,
    session.id,
  ]);

  // La conexión parte del tamaño real del terminal: el PTY nace con las
  // columnas correctas y el prompt no llega mal envuelto.
  useEffect(() => {
    if (session.status !== "connecting") return;
    const term = termRef.current;
    const fit = fitRef.current;
    const el = containerRef.current;
    if (!term || !fit || !el) return;
    if (el.clientWidth > 0) fit.fit();
    void establish(session.id, term.cols, term.rows);
  }, [session.status, session.id, establish]);

  // El stream cambia en cada reconexión: se re-engancha sin recrear el terminal.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    session.stream.attach((bytes) => term.write(bytes));
    return () => session.stream.detach();
  }, [session.id, session.stream, transparent]);

  useEffect(() => {
    if (!active) return;
    const el = containerRef.current;
    const fit = fitRef.current;
    const term = termRef.current;
    if (!el || !fit || !term || el.clientWidth === 0) return;
    fit.fit();
    void sshResize(session.id, term.cols, term.rows).catch(() => {});
    term.focus();
  }, [active, session.id, session.status]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full bg-terminal px-3 py-2" />

      {active && findOpen && searchRef.current && (
        <FindBar
          search={searchRef.current}
          onClose={() => {
            setFindOpen(false);
            termRef.current?.focus();
          }}
        />
      )}

      {(session.status === "closed" || session.status === "error") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-terminal/90 duration-200 animate-in fade-in">
          <div className="max-w-sm text-center">
            <p className="text-sm text-foreground">
              {session.status === "error"
                ? "No se pudo conectar"
                : "Sesión finalizada"}
            </p>
            {session.reason && (
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                {session.reason}
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 rounded-full px-4 text-xs"
            onClick={() => reconnect(session.id)}
          >
            Reconectar
          </Button>
        </div>
      )}

      {session.status === "connecting" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-terminal/90 duration-200 animate-in fade-in">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            {session.host.username}@{session.host.hostname}
          </p>
        </div>
      )}
    </div>
  );
}
