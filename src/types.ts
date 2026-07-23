export type AuthMethod =
  | { kind: "password"; password: string }
  | { kind: "key"; key_path: string; passphrase: string | null };

export interface Host {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  auth: AuthMethod;
  tags: string[];
  group: string | null;
  jump_host_id: string | null;
  login_commands: string[];
  agent_forward: boolean;
}

export type SessionStatus = "connecting" | "connected" | "closed" | "error";

export interface SshKey {
  name: string;
  path: string;
}

export interface Snippet {
  id: string;
  name: string;
  command: string;
}

export interface KnownHost {
  host: string;
  key: string;
  fingerprint: string;
  added_at: number;
}

export interface HistoryEntry {
  id: string;
  host_id: string;
  host_name: string;
  username: string;
  hostname: string;
  port: number;
  timestamp: number;
  ok: boolean;
  error: string | null;
}
