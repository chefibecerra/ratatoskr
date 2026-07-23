import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";

import { BroadcastBar } from "@/components/BroadcastBar";
import { CommandPalette } from "@/components/CommandPalette";
import { ConfirmCloseDialog } from "@/components/ConfirmCloseDialog";
import { HostForm } from "@/components/HostForm";
import { LockScreen } from "@/components/LockScreen";
import { SessionTabs } from "@/components/SessionTabs";
import { SettingsDialog } from "@/components/SettingsDialog";
import { SftpBrowser } from "@/components/SftpBrowser";
import { ShortcutsDialog } from "@/components/ShortcutsDialog";
import { TerminalArea } from "@/components/TerminalArea";
import { SnippetForm } from "@/components/SnippetForm";
import { Sidebar } from "@/components/Sidebar";
import { Toaster } from "@/components/ui/sonner";
import { UpdateBanner } from "@/components/UpdateBanner";
import { useAutolock } from "@/hooks/use-autolock";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { updateTrayMenu } from "@/lib/ipc";
import { getTheme } from "@/lib/terminal-themes";
import { useHosts } from "@/stores/hosts";
import { useSessions } from "@/stores/sessions";
import { useSettings } from "@/stores/settings";
import { useUi } from "@/stores/ui";
import { useUpdater } from "@/stores/updater";
import { useVault } from "@/stores/vault";

function App() {
  const themeId = useSettings((s) => s.themeId);
  const opacity = useSettings((s) => s.opacity);
  const vaultStatus = useVault((s) => s.status);
  const checkVault = useVault((s) => s.check);
  const hosts = useHosts((s) => s.hosts);
  const ui = useUi();

  useShortcuts();
  useAutolock();

  // los datos se cargan al desbloquear el vault, no acá
  useEffect(() => {
    void checkVault();
    void useUpdater.getState().checkOnStartup();
  }, [checkVault]);

  // "Preferencias…" del menú nativo de macOS
  useEffect(() => {
    const unlisten = listen("open-settings", () =>
      useUi.getState().setSettingsOpen(true),
    );
    return () => void unlisten.then((fn) => fn());
  }, []);

  // conexión rápida desde el tray: sincroniza el menú y escucha los clics
  useEffect(() => {
    void updateTrayMenu(hosts.map((h) => ({ id: h.id, name: h.name })));
  }, [hosts]);

  useEffect(() => {
    const unlisten = listen<string>("tray-connect", ({ payload }) => {
      const host = useHosts.getState().hosts.find((h) => h.id === payload);
      if (host) useSessions.getState().connect(host);
    });
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
        <BroadcastBar />
        <TerminalArea />
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
      <SftpBrowser />
      <ShortcutsDialog />
      <CommandPalette />
      <ConfirmCloseDialog />
      <Toaster position="bottom-right" />

      {vaultStatus !== "unlocked" && <LockScreen />}
      <UpdateBanner />
    </div>
  );
}

export default App;
