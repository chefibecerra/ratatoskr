import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TunnelKind } from "@/lib/ipc";
import { useHosts } from "@/stores/hosts";
import { useTunnels } from "@/stores/tunnels";

interface TunnelFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const KIND_INFO: Record<
  TunnelKind,
  {
    title: string;
    desc: string;
    portLabel: string;
    remoteLabel: string;
    destLabel: string;
  }
> = {
  local: {
    title: "Local (-L)",
    desc: "Un puerto de tu máquina se conecta a un destino remoto a través del host SSH.",
    portLabel: "Puerto local",
    remoteLabel: "Puerto remoto",
    destLabel: "Destino remoto",
  },
  remote: {
    title: "Remoto (-R)",
    desc: "El servidor abre un puerto y reenvía sus conexiones a un destino en TU máquina.",
    portLabel: "Puerto local (destino)",
    remoteLabel: "Puerto en el servidor",
    destLabel: "Destino local",
  },
  dynamic: {
    title: "Dinámico (-D, SOCKS)",
    desc: "Levanta un proxy SOCKS5 local; cada conexión elige su destino a través del host.",
    portLabel: "Puerto local (SOCKS)",
    remoteLabel: "",
    destLabel: "",
  },
};

export function TunnelForm({ open, onOpenChange }: TunnelFormProps) {
  const hosts = useHosts((s) => s.hosts);
  const add = useTunnels((s) => s.add);

  const [kind, setKind] = useState<TunnelKind>("local");
  const [hostId, setHostId] = useState("");
  const [label, setLabel] = useState("");
  const [localPort, setLocalPort] = useState("");
  const [remoteHost, setRemoteHost] = useState("127.0.0.1");
  const [remotePort, setRemotePort] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setKind("local");
      setHostId(hosts[0]?.id ?? "");
      setLabel("");
      setLocalPort("");
      setRemoteHost("127.0.0.1");
      setRemotePort("");
      setError(null);
    }
  }, [open, hosts]);

  const info = KIND_INFO[kind];
  const dynamic = kind === "dynamic";

  const submit = () => {
    const lp = Number(localPort);
    const rp = Number(remotePort);
    if (!hostId) return setError("Elige un host por el que tunelizar.");
    if (!lp || lp < 1 || lp > 65535) return setError("Puerto local inválido.");
    if (!dynamic) {
      if (!rp || rp < 1 || rp > 65535) return setError("Puerto remoto inválido.");
      if (!remoteHost.trim()) return setError("Indica el destino.");
    }

    const autoLabel = dynamic
      ? `SOCKS :${lp}`
      : kind === "remote"
        ? `:${rp} → ${remoteHost}:${lp}`
        : `${remoteHost}:${rp}`;

    add({
      hostId,
      kind,
      label: label.trim() || autoLabel,
      localPort: lp,
      remoteHost: dynamic ? "" : remoteHost.trim(),
      remotePort: dynamic ? 0 : rp,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo túnel</DialogTitle>
          <DialogDescription>{info.desc}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Tipo</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as TunnelKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">{KIND_INFO.local.title}</SelectItem>
                <SelectItem value="remote">{KIND_INFO.remote.title}</SelectItem>
                <SelectItem value="dynamic">
                  {KIND_INFO.dynamic.title}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Host SSH</Label>
            <Select value={hostId} onValueChange={setHostId}>
              <SelectTrigger>
                <SelectValue placeholder="Elige un host" />
              </SelectTrigger>
              <SelectContent>
                {hosts.map((h) => (
                  <SelectItem key={h.id} value={h.id}>
                    {h.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="tunnel-label">Nombre (opcional)</Label>
            <Input
              id="tunnel-label"
              placeholder="Base de datos de producción"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className={dynamic ? "grid gap-1.5" : "grid grid-cols-2 gap-3"}>
            <div className="grid gap-1.5">
              <Label htmlFor="local-port">{info.portLabel}</Label>
              <Input
                id="local-port"
                inputMode="numeric"
                placeholder="5432"
                value={localPort}
                onChange={(e) => setLocalPort(e.target.value)}
              />
            </div>
            {!dynamic && (
              <div className="grid gap-1.5">
                <Label htmlFor="remote-port">{info.remoteLabel}</Label>
                <Input
                  id="remote-port"
                  inputMode="numeric"
                  placeholder="5432"
                  value={remotePort}
                  onChange={(e) => setRemotePort(e.target.value)}
                />
              </div>
            )}
          </div>

          {!dynamic && (
            <div className="grid gap-1.5">
              <Label htmlFor="remote-host">{info.destLabel}</Label>
              <Input
                id="remote-host"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={remoteHost}
                onChange={(e) => setRemoteHost(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                {kind === "remote"
                  ? "En tu máquina. 127.0.0.1 = un servicio de tu propio equipo."
                  : "Visto desde el servidor. 127.0.0.1 = un servicio en el propio host."}
              </p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
