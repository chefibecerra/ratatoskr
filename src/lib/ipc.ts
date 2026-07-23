import { Channel, invoke } from "@tauri-apps/api/core";

import type { HistoryEntry, Host, KnownHost, Snippet, SshKey } from "@/types";

export const listHosts = () => invoke<Host[]>("list_hosts");

export const updateTrayMenu = (hosts: { id: string; name: string }[]) =>
  invoke<void>("update_tray_menu", { hosts });

export const saveHost = (host: Host) => invoke<Host>("save_host", { host });

export const deleteHost = (id: string) => invoke<void>("delete_host", { id });

export const listSshKeys = () => invoke<SshKey[]>("list_ssh_keys");

export interface SshConfigHost {
  alias: string;
  hostname: string;
  user: string | null;
  port: number;
  identity_file: string | null;
}

export const readSshConfig = () => invoke<SshConfigHost[]>("read_ssh_config");

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

export const backupExport = (target: string, settings: unknown) =>
  invoke<void>("backup_export", { target, settings });

/** devuelve los ajustes guardados en la copia para aplicarlos */
export const backupImport = (source: string) =>
  invoke<Record<string, unknown>>("backup_import", { source });

export const hostsExport = (target: string) =>
  invoke<number>("hosts_export", { target });

export const hostsImport = (source: string) =>
  invoke<Host[]>("hosts_import", { source });

export const settingsExport = (target: string, settings: unknown) =>
  invoke<void>("settings_export", { target, settings });

export const settingsImport = (source: string) =>
  invoke<Record<string, unknown>>("settings_import", { source });

export interface SftpEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified: number | null;
}

export const sftpConnect = (sftpId: string, host: Host) =>
  invoke<string>("sftp_connect", { sftpId, host });

export const sftpList = (sftpId: string, path: string) =>
  invoke<SftpEntry[]>("sftp_list", { sftpId, path });

export const sftpDownload = (
  sftpId: string,
  remotePath: string,
  localPath: string,
) => invoke<void>("sftp_download", { sftpId, remotePath, localPath });

export const sftpUpload = (
  sftpId: string,
  localPath: string,
  remotePath: string,
) => invoke<void>("sftp_upload", { sftpId, localPath, remotePath });

export const sftpReadText = (sftpId: string, path: string) =>
  invoke<string>("sftp_read_text", { sftpId, path });

export const sftpWriteText = (sftpId: string, path: string, content: string) =>
  invoke<void>("sftp_write_text", { sftpId, path, content });

export const sftpMkdir = (sftpId: string, path: string) =>
  invoke<void>("sftp_mkdir", { sftpId, path });

export const sftpRemove = (sftpId: string, path: string, isDir: boolean) =>
  invoke<void>("sftp_remove", { sftpId, path, isDir });

export const sftpRename = (sftpId: string, from: string, to: string) =>
  invoke<void>("sftp_rename", { sftpId, from, to });

export const sftpDisconnect = (sftpId: string) =>
  invoke<void>("sftp_disconnect", { sftpId });

export const tunnelOpen = (
  tunnelId: string,
  host: Host,
  localPort: number,
  remoteHost: string,
  remotePort: number,
) =>
  invoke<void>("tunnel_open", {
    tunnelId,
    host,
    localPort,
    remoteHost,
    remotePort,
  });

export const tunnelClose = (tunnelId: string) =>
  invoke<void>("tunnel_close", { tunnelId });

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
  keepaliveSecs: number,
  recordHistory: boolean,
  recordLog: boolean,
  onData: Channel<ArrayBuffer>,
) =>
  invoke<void>("ssh_connect", {
    sessionId,
    host,
    cols,
    rows,
    keepaliveSecs,
    recordHistory,
    recordLog,
    onData,
  });

export const openLogsDir = () => invoke<string>("open_logs_dir");

export const sshWrite = (sessionId: string, data: string) =>
  invoke<void>("ssh_write", { sessionId, data });

export const sshResize = (sessionId: string, cols: number, rows: number) =>
  invoke<void>("ssh_resize", { sessionId, cols, rows });

export const sshDisconnect = (sessionId: string) =>
  invoke<void>("ssh_disconnect", { sessionId });
