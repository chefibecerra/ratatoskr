import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CursorStyle = "block" | "bar" | "underline";

export interface Settings {
  themeId: string;
  /** 50–100: por debajo de 100 la ventana deja ver el escritorio con blur */
  opacity: number;
  fontFamily: string;
  fontSize: number;
  cursorStyle: CursorStyle;
  cursorBlink: boolean;
  /** líneas de scrollback del terminal */
  scrollback: number;
  /** interlineado del terminal */
  lineHeight: number;
  /** copia automáticamente el texto al seleccionarlo */
  copyOnSelect: boolean;
  /** ⌥ envía secuencias Meta (M-) en lugar de caracteres especiales */
  optionAsMeta: boolean;
  /** reintenta una vez cuando la conexión se corta sin que el usuario la cierre */
  autoReconnect: boolean;
  /** segundos entre keepalives SSH; 0 = desactivado */
  keepaliveSecs: number;
  /** pide confirmación antes de cerrar una sesión conectada */
  confirmClose: boolean;
  /** registra las conexiones en el historial */
  saveHistory: boolean;
  /** graba la salida del terminal a un archivo de registro */
  recordSessionLog: boolean;
  /** minutos de inactividad antes de bloquear el vault; 0 = nunca */
  autoLockMinutes: number;
}

interface SettingsState extends Settings {
  update: (partial: Partial<Settings>) => void;
}

export const FONT_FAMILIES = [
  "SF Mono",
  "Menlo",
  "JetBrainsMono Nerd Font",
  "MesloLGS NF",
  "Fira Code",
  "Hack Nerd Font",
];

/** cadena final para xterm: la elegida + fallbacks seguros */
export function fontStack(family: string): string {
  return `'${family}', Menlo, ui-monospace, monospace`;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      themeId: "ratatoskr",
      opacity: 100,
      fontFamily: "SF Mono",
      fontSize: 13,
      cursorStyle: "block",
      cursorBlink: true,
      scrollback: 10_000,
      lineHeight: 1.25,
      copyOnSelect: false,
      optionAsMeta: true,
      autoReconnect: true,
      keepaliveSecs: 15,
      confirmClose: true,
      saveHistory: true,
      recordSessionLog: false,
      autoLockMinutes: 15,
      update: (partial) => set(partial),
    }),
    { name: "ratatoskr-settings" },
  ),
);
