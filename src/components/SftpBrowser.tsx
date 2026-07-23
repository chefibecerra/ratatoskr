import { useState } from "react";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import {
  ArrowUp,
  Download,
  File,
  FilePlus,
  Folder,
  FolderPlus,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SftpEditor } from "@/components/SftpEditor";
import {
  sftpDownload,
  sftpMkdir,
  sftpRemove,
  sftpRename,
  sftpUpload,
  sftpWriteText,
  type SftpEntry,
} from "@/lib/ipc";
import { useSftp } from "@/stores/sftp";
import { cn } from "@/lib/utils";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i += 1;
  }
  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[i]}`;
}

function parentPath(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx <= 0 ? "/" : trimmed.slice(0, idx);
}

function EntryRow({
  entry,
  sftpId,
  onNavigate,
  onEdit,
  onChanged,
}: {
  entry: SftpEntry;
  sftpId: string;
  onNavigate: (path: string) => void;
  onEdit: (path: string) => void;
  onChanged: () => void;
}) {
  const download = async () => {
    const target = await saveDialog({ defaultPath: entry.name });
    if (!target) return;
    try {
      await sftpDownload(sftpId, entry.path, target);
      toast.success(`Descargado ${entry.name}`);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const rename = async () => {
    const next = window.prompt("Nuevo nombre", entry.name);
    if (!next || next === entry.name) return;
    try {
      await sftpRename(sftpId, entry.path, `${parentPath(entry.path)}/${next}`);
      onChanged();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const remove = async () => {
    if (!window.confirm(`¿Eliminar ${entry.name}?`)) return;
    try {
      await sftpRemove(sftpId, entry.path, entry.is_dir);
      onChanged();
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <div className="group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 transition-colors hover:bg-accent/50">
      <button
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        onDoubleClick={() =>
          entry.is_dir ? onNavigate(entry.path) : onEdit(entry.path)
        }
        title={entry.is_dir ? "Abrir carpeta" : "Doble clic para editar"}
      >
        {entry.is_dir ? (
          <Folder className="size-4 shrink-0 text-blue-400/80" />
        ) : (
          <File className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate text-[13px]">{entry.name}</span>
      </button>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
        {entry.is_dir ? "" : formatSize(entry.size)}
      </span>
      <div className="flex shrink-0 items-center opacity-0 group-hover:opacity-100">
        {!entry.is_dir && (
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground"
            onClick={() => void download()}
            title="Descargar"
          >
            <Download className="size-3.5" />
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground"
            >
              <Pencil className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => void rename()}>
              <Pencil className="size-3.5" /> Renombrar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => void remove()}>
              <Trash2 className="size-3.5" /> Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function SftpBrowser() {
  const { open, sftpId, host, path, entries, loading, error } = useSftp();
  const navigate = useSftp((s) => s.navigate);
  const refresh = useSftp((s) => s.refresh);
  const close = useSftp((s) => s.close);
  const [busy, setBusy] = useState(false);
  const [editingPath, setEditingPath] = useState<string | null>(null);

  const upload = async () => {
    if (!sftpId) return;
    const source = await openDialog({ multiple: false });
    if (typeof source !== "string") return;
    setBusy(true);
    try {
      const name = source.split("/").pop() ?? "archivo";
      await sftpUpload(sftpId, source, `${path.replace(/\/+$/, "")}/${name}`);
      toast.success(`Subido ${name}`);
      await refresh();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  const mkdir = async () => {
    if (!sftpId) return;
    const name = window.prompt("Nombre de la carpeta");
    if (!name) return;
    try {
      await sftpMkdir(sftpId, `${path.replace(/\/+$/, "")}/${name}`);
      await refresh();
    } catch (e) {
      toast.error(String(e));
    }
  };

  const newFile = async () => {
    if (!sftpId) return;
    const name = window.prompt("Nombre del archivo");
    if (!name) return;
    const filePath = `${path.replace(/\/+$/, "")}/${name}`;
    try {
      await sftpWriteText(sftpId, filePath, "");
      await refresh();
      setEditingPath(filePath); // ábrelo en el editor
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && void close()}>
      <DialogContent className="flex h-[560px] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="text-[14px]">
            Archivos · {host?.name ?? ""}
          </DialogTitle>
        </DialogHeader>

        {/* barra de navegación */}
        <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={path === "/"}
            onClick={() => void navigate(parentPath(path))}
            title="Subir"
          >
            <ArrowUp className="size-4" />
          </Button>
          <div className="min-w-0 flex-1 truncate px-2 font-mono text-xs text-muted-foreground">
            {path}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => void refresh()}
            title="Actualizar"
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => void newFile()}
            title="Nuevo archivo"
          >
            <FilePlus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => void mkdir()}
            title="Nueva carpeta"
          >
            <FolderPlus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={busy}
            onClick={() => void upload()}
            title="Subir archivo"
          >
            <Upload className="size-4" />
          </Button>
        </div>

        {/* lista */}
        <ScrollArea className="min-h-0 flex-1 px-2 py-1.5">
          {error && (
            <div className="px-2 py-8 text-center text-xs text-destructive">
              {error}
            </div>
          )}
          {!error && loading && entries.length === 0 && (
            <div className="flex justify-center py-10">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!error && !loading && entries.length === 0 && (
            <div className="px-2 py-10 text-center text-xs text-muted-foreground">
              Carpeta vacía
            </div>
          )}
          {sftpId &&
            entries.map((entry) => (
              <EntryRow
                key={entry.path}
                entry={entry}
                sftpId={sftpId}
                onNavigate={(p) => void navigate(p)}
                onEdit={(p) => setEditingPath(p)}
                onChanged={() => void refresh()}
              />
            ))}
        </ScrollArea>

        <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground/70">
          Doble clic: carpeta para abrir, archivo para editar.
        </p>
      </DialogContent>

      {sftpId && editingPath && (
        <SftpEditor
          sftpId={sftpId}
          path={editingPath}
          onClose={() => setEditingPath(null)}
        />
      )}
    </Dialog>
  );
}
