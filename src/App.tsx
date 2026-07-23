import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

import { CommandPalette } from "@/components/CommandPalette";
import { ConfirmCloseDialog } from "@/components/ConfirmCloseDialog";
import { EmptyState } from "@/components/EmptyState";
import { HostForm } from "@/components/HostForm";
import { LockScreen } from "@/components/LockScreen";
import { SessionTabs } from "@/components/SessionTabs";
import { SettingsDialog } from "@/components/SettingsDialog";
import { SnippetForm } from "@/components/SnippetForm";
import { Sidebar } from "@/components/Sidebar";
import { TerminalView } from "@/components/TerminalView";
import { useAutolock } from "@/hooks/use-autolock";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { getTheme } from "@/lib/terminal-themes";
import { useSessions } from "@/stores/sessions";
import { useSettings } from "@/stores/settings";
import { useUi } from "@/stores/ui";
import { useVault } from "@/stores/vault";

function App() {
  const sessions = useSessions((s) => s.sessions);
  const activeId = useSessions((s) => s.activeId);
  const themeId = useSettings((s) => s.themeId);
  const opacity = useSettings((s) => s.opacity);
  const vaultStatus = useVault((s) => s.status);
  const checkVault = useVault((s) => s.check);
  const ui = useUi();

  useShortcuts();
  useAutolock();

  // los datos se cargan al desbloquear el vault, no acá
  useEffect(() => {
    void checkVault();
  }, [checkVault]);

  // "Preferencias…" del menú nativo de macOS
  useEffect(() => {
    const unlisten = listen("open-settings", () =>
      useUi.getState().setSettingsOpen(true),
    );
    return () => void unlisten.then((fn) => fn());
  }, []);

  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--app-alpha", String(opacity / 100));
    root.setProperty("--terminal-rgb", getTheme(themeId).bgRgb);
  }, [themeId, opacity]);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <SessionTabs />
        <div className="relative flex-1 bg-terminal">
          {sessions.map((session) => (
            <TerminalView
              key={session.id}
              session={session}
              active={session.id === activeId}
            />
          ))}
          {sessions.length === 0 && <EmptyState />}
        </div>
      </main>

      <HostForm
        open={ui.hostFormOpen}
        onOpenChange={ui.setHostFormOpen}
        host={ui.editingHost}
      />
      <SettingsDialog
        open={ui.settingsOpen}
        onOpenChange={ui.setSettingsOpen}
      />
      <SnippetForm />
      <CommandPalette />
      <ConfirmCloseDialog />

      {vaultStatus !== "unlocked" && <LockScreen />}
    </div>
  );
}

export default App;
