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
  /** ⌥ envía secuencias Meta (M-) en lugar de caracteres especiales */
  optionAsMeta: boolean;
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
      optionAsMeta: true,
      autoLockMinutes: 15,
      update: (partial) => set(partial),
    }),
    { name: "ratatoskr-settings" },
  ),
);
