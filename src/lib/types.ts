export type Host = {
  id: string;
  label: string;
  host: string;
  port: number;
  username: string;
  password?: string | null;
  /** "password" | "key" */
  auth_type?: string | null;
  key_id?: string | null;
  jump_host_id?: string | null;
  group?: string | null;
  color?: string | null;
};

export type SshKey = {
  id: string;
  label: string;
  /** clave privada en formato OpenSSH (vacío si se usa `path`) */
  private_key: string;
  /** ruta a un archivo de clave en disco (p. ej. ~/.ssh/id_ed25519) */
  path?: string | null;
  passphrase?: string | null;
};

export type KeyInfo = {
  algorithm: string;
  fingerprint: string;
  encrypted: boolean;
};

export type ConfigHost = {
  alias: string;
  hostname?: string | null;
  user?: string | null;
  port?: number | null;
  identity_file?: string | null;
};

export type Session = {
  /** id devuelto por el backend (ssh_connect) */
  id: string;
  host: Host;
};

/** Paleta de acentos para los avatares de host. */
export const HOST_COLORS = [
  "#E0A868",
  "#5FD39A",
  "#6FB3F5",
  "#C9A2F5",
  "#F2A1A1",
  "#C9743A",
  "#5FD0D0",
  "#E8C66B",
];

export function colorFor(host: Host): string {
  if (host.color) return host.color;
  let sum = 0;
  for (const ch of host.id || host.label) sum += ch.charCodeAt(0);
  return HOST_COLORS[sum % HOST_COLORS.length];
}
