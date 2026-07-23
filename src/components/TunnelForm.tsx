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
import { useHosts } from "@/stores/hosts";
import { useTunnels } from "@/stores/tunnels";

interface TunnelFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TunnelForm({ open, onOpenChange }: TunnelFormProps) {
  const hosts = useHosts((s) => s.hosts);
  const add = useTunnels((s) => s.add);

  const [hostId, setHostId] = useState("");
  const [label, setLabel] = useState("");
  const [localPort, setLocalPort] = useState("");
  const [remoteHost, setRemoteHost] = useState("127.0.0.1");
  const [remotePort, setRemotePort] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setHostId(hosts[0]?.id ?? "");
      setLabel("");
      setLocalPort("");
      setRemoteHost("127.0.0.1");
      setRemotePort("");
      setError(null);
    }
  }, [open, hosts]);

  const submit = () => {
    const lp = Number(localPort);
    const rp = Number(remotePort);
    if (!hostId) return setError("Elige un host por el que tunelizar.");
    if (!lp || lp < 1 || lp > 65535) return setError("Puerto local inválido.");
    if (!rp || rp < 1 || rp > 65535) return setError("Puerto remoto inválido.");
    if (!remoteHost.trim()) return setError("Indica el destino remoto.");

    add({
      hostId,
      label: label.trim() || `${remoteHost}:${rp}`,
      localPort: lp,
      remoteHost: remoteHost.trim(),
      remotePort: rp,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo túnel</DialogTitle>
          <DialogDescription>
            El puerto local se conecta al destino remoto a través del host SSH.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
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

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="local-port">Puerto local</Label>
              <Input
                id="local-port"
                inputMode="numeric"
                placeholder="5432"
                value={localPort}
                onChange={(e) => setLocalPort(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="remote-port">Puerto remoto</Label>
              <Input
                id="remote-port"
                inputMode="numeric"
                placeholder="5432"
                value={remotePort}
                onChange={(e) => setRemotePort(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="remote-host">Destino remoto</Label>
            <Input
              id="remote-host"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={remoteHost}
              onChange={(e) => setRemoteHost(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Visto desde el servidor. 127.0.0.1 = un servicio en el propio host.
            </p>
          </div>

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
