import { Channel, invoke } from "@tauri-apps/api/core";

import type { HistoryEntry, Host, KnownHost, Snippet, SshKey } from "@/types";

export const listHosts = () => invoke<Host[]>("list_hosts");

export const saveHost = (host: Host) => invoke<Host>("save_host", { host });

export const deleteHost = (id: string) => invoke<void>("delete_host", { id });

export const listSshKeys = () => invoke<SshKey[]>("list_ssh_keys");

export const listSnippets = () => invoke<Snippet[]>("list_snippets");

export const saveSnippet = (snippet: Snippet) =>
  invoke<Snippet>("save_snippet", { snippet });

export const deleteSnippet = (id: string) =>
  invoke<void>("delete_snippet", { id });

export interface VaultInfo {
  revision: number;
  updated_at: number;
}

export const vaultInfo = () => invoke<VaultInfo>("vault_info");

export const vaultExport = (target: string) =>
  invoke<void>("vault_export", { target });

export const vaultImport = (source: string) =>
  invoke<void>("vault_import", { source });

export const listKnownHosts = () => invoke<KnownHost[]>("list_known_hosts");

export const forgetKnownHost = (host: string) =>
  invoke<void>("forget_known_host", { host });

export const listHistory = () => invoke<HistoryEntry[]>("list_history");

export const clearHistory = () => invoke<void>("clear_history");

export const sshConnect = (
  sessionId: string,
  host: Host,
  cols: number,
  rows: number,
  onData: Channel<ArrayBuffer>,
) => invoke<void>("ssh_connect", { sessionId, host, cols, rows, onData });

export const sshWrite = (sessionId: string, data: string) =>
  invoke<void>("ssh_write", { sessionId, data });

export const sshResize = (sessionId: string, cols: number, rows: number) =>
  invoke<void>("ssh_resize", { sessionId, cols, rows });

export const sshDisconnect = (sessionId: string) =>
  invoke<void>("ssh_disconnect", { sessionId });
