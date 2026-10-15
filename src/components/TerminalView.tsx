import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSettings } from "@/lib/settings";
import { TERMINAL_THEMES } from "@/lib/terminal-themes";

type DataPayload = { id: string; data: number[] };
type ClosedPayload = { id: string };

function fontStack(family: string) {
  return `'${family}', ui-monospace, 'SF Mono', Menlo, monospace`;
}

export function TerminalView({
  sessionId,
  active,
}: {
  sessionId: string;
  active: boolean;
}) {
  const { settings } = useSettings();
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  // Crear la terminal (solo depende de la sesión; los ajustes se aplican aparte).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const theme = TERMINAL_THEMES[settings.theme] ?? TERMINAL_THEMES.Ratatoskr;
    const term = new Terminal({
      fontFamily: fontStack(settings.fontFamily),
      fontSize: settings.fontSize,
      lineHeight: settings.lineHeight,
      cursorBlink: settings.cursorBlink,
      cursorStyle: settings.cursorStyle,
      allowProposedApi: true,
      theme,
      scrollback: settings.scrollback,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    termRef.current = term;
    fitRef.current = fit;

    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {
      /* sin WebGL: renderer por defecto */
    }

    fit.fit();

    const onData = term.onData((data) => {
      void invoke("ssh_write", { id: sessionId, data });
    });
    const unlistenData = listen<DataPayload>("ssh:data", (e) => {
      if (e.payload.id !== sessionId) return;
      term.write(new Uint8Array(e.payload.data));
    });
    const unlistenClosed = listen<ClosedPayload>("ssh:closed", (e) => {
      if (e.payload.id !== sessionId) return;
      term.write("\r\n\x1b[38;2;255;107;107m· conexión cerrada ·\x1b[0m\r\n");
    });

    const applySize = () => {
      fit.fit();
      void invoke("ssh_resize", {
        id: sessionId,
        cols: term.cols,
        rows: term.rows,
      });
    };
    const ro = new ResizeObserver(applySize);
    ro.observe(container);
    applySize();

    return () => {
      onData.dispose();
      ro.disconnect();
      void unlistenData.then((f) => f());
      void unlistenClosed.then((f) => f());
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Aplicar ajustes en vivo sin recrear la terminal.
  useEffect(() => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    const theme = TERMINAL_THEMES[settings.theme] ?? TERMINAL_THEMES.Ratatoskr;
    term.options.theme = theme;
    term.options.fontFamily = fontStack(settings.fontFamily);
    term.options.fontSize = settings.fontSize;
    term.options.lineHeight = settings.lineHeight;
    term.options.scrollback = settings.scrollback;
    term.options.cursorStyle = settings.cursorStyle;
    term.options.cursorBlink = settings.cursorBlink;
    requestAnimationFrame(() => {
      fit.fit();
      void invoke("ssh_resize", {
        id: sessionId,
        cols: term.cols,
        rows: term.rows,
      });
    });
  }, [settings, sessionId]);

  // Al activarse: refit + foco.
  useEffect(() => {
    if (!active) return;
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    requestAnimationFrame(() => {
      fit.fit();
      term.focus();
    });
  }, [active]);

  const bg =
    (TERMINAL_THEMES[settings.theme] ?? TERMINAL_THEMES.Ratatoskr).background;

  return (
    <div
      ref={containerRef}
      className="h-full w-full select-text"
      style={{ padding: settings.padding, backgroundColor: bg }}
    />
  );
}
