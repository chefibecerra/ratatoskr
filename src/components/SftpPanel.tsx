import { useCallback, useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import {
  ArrowUp,
  Check,
  Download,
  File as FileIcon,
  Folder,
  FolderPlus,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { FileEditorDialog } from "@/components/FileEditorDialog";
import { cn } from "@/lib/utils";

type Entry = { name: string; path: string; is_dir: boolean; size: number };

function parentOf(p: string): string {
  if (p === "/" || p === "") return "/";
  const t = p.replace(/\/+$/, "");
  const i = t.lastIndexOf("/");
  return i <= 0 ? "/" : t.slice(0, i);
}

function human(n: number): string {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${u[i]}`;
}

export function SftpPanel({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const [path, setPath] = useState<string>("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [renaming, setRenaming] = useState<{ path: string; value: string } | null>(
    null,
  );

  const list = useCallback(
    async (p: string) => {
      setLoading(true);
      setError(null);
      try {
        const items = await invoke<Entry[]>("sftp_list", { id: sessionId, path: p });
        setEntries(items);
        setPath(p);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    },
    [sessionId],
  );

  // Arranca en el home del usuario.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const home = await invoke<string>("sftp_home", { id: sessionId });
        if (!cancelled) await list(home);
      } catch (err) {
        if (!cancelled) setError(String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, list]);

  async function upload() {
    const local = await openDialog({ multiple: false, title: "Subir archivo" });
    if (typeof local !== "string") return;
    setBusy(true);
    try {
      await invoke("sftp_upload", { id: sessionId, local, remoteDir: path });
      await list(path);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function download(entry: Entry) {
    const local = await saveDialog({ defaultPath: entry.name });
    if (typeof local !== "string") return;
    setBusy(true);
    try {
      await invoke("sftp_download", { id: sessionId, remote: entry.path, local });
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function createFolder() {
    const name = (newFolder ?? "").trim();
    if (!name) {
      setNewFolder(null);
      return;
    }
    setBusy(true);
    try {
      await invoke("sftp_mkdir", {
        id: sessionId,
        path: path.endsWith("/") ? `${path}${name}` : `${path}/${name}`,
      });
      setNewFolder(null);
      await list(path);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(entry: Entry) {
    setBusy(true);
    try {
      await invoke("sftp_remove", {
        id: sessionId,
        path: entry.path,
        isDir: entry.is_dir,
      });
      setConfirmDel(null);
      await list(path);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function doRename() {
    if (!renaming) return;
    const name = renaming.value.trim();
    if (!name) {
      setRenaming(null);
      return;
    }
    const to = path.endsWith("/") ? `${path}${name}` : `${path}/${name}`;
    setBusy(true);
    try {
      await invoke("sftp_rename", { id: sessionId, from: renaming.path, to });
      setRenaming(null);
      await list(path);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full w-[420px] shrink-0 flex-col border-l border-border bg-surface/80">
      {/* Cabecera */}
      <div className="flex h-11 items-center justify-between border-b border-border px-3">
        <span className="flex items-center gap-2 text-sm font-medium text-fg">
          <Folder className="size-4 text-amber" /> Archivos
        </span>
        <div className="flex items-center gap-1">
          <IconBtn title="Recargar" onClick={() => list(path)}>
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          </IconBtn>
          <IconBtn title="Cerrar" onClick={onClose}>
            <X className="size-4" />
          </IconBtn>
        </div>
      </div>

      {/* Barra de ruta + acciones */}
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <IconBtn title="Subir un nivel" onClick={() => list(parentOf(path))}>
          <ArrowUp className="size-4" />
        </IconBtn>
        <span className="min-w-0 flex-1 truncate px-1 font-mono text-xs text-muted-foreground">
          {path || "—"}
        </span>
        <IconBtn title="Nueva carpeta" onClick={() => setNewFolder("")}>
          <FolderPlus className="size-4" />
        </IconBtn>
        <IconBtn title="Subir archivo" onClick={upload}>
          <Upload className="size-4" />
        </IconBtn>
      </div>

      {/* Nueva carpeta (input en línea) */}
      {newFolder !== null && (
        <div className="flex items-center gap-2 border-b border-border bg-surface-2/40 px-3 py-2">
          <FolderPlus className="size-4 text-muted-foreground" />
          <input
            autoFocus
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createFolder();
              if (e.key === "Escape") setNewFolder(null);
            }}
            placeholder="Nombre de la carpeta"
            className="h-7 flex-1 rounded-md border border-input bg-surface-2 px-2 text-sm text-fg outline-none select-text focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          <IconBtn title="Crear" onClick={createFolder}>
            <Check className="size-4" />
          </IconBtn>
        </div>
      )}

      {/* Lista */}
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {error ? (
          <p className="px-3 py-6 text-center text-xs text-destructive">{error}</p>
        ) : entries.length === 0 && !loading ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            Carpeta vacía.
          </p>
        ) : (
          entries.map((e) => (
            <div
              key={e.path}
              className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2/70"
            >
              {renaming?.path === e.path ? (
                <>
                  {e.is_dir ? (
                    <Folder className="size-4 shrink-0 text-amber" />
                  ) : (
                    <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <input
                    autoFocus
                    value={renaming.value}
                    onChange={(ev) =>
                      setRenaming({ path: e.path, value: ev.target.value })
                    }
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter") void doRename();
                      if (ev.key === "Escape") setRenaming(null);
                    }}
                    className="h-7 min-w-0 flex-1 rounded-md border border-input bg-surface-2 px-2 text-sm text-fg outline-none select-text focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                  <IconBtn title="Renombrar" onClick={doRename}>
                    <Check className="size-3.5" />
                  </IconBtn>
                  <IconBtn title="Cancelar" onClick={() => setRenaming(null)}>
                    <X className="size-3.5" />
                  </IconBtn>
                </>
              ) : (
                <>
                  <button
                    onClick={() => (e.is_dir ? list(e.path) : setEditing(e))}
                    title={e.is_dir ? "Abrir carpeta" : "Editar archivo"}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
                  >
                    {e.is_dir ? (
                      <Folder className="size-4 shrink-0 text-amber" />
                    ) : (
                      <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm text-fg">
                      {e.name}
                    </span>
                    {!e.is_dir && (
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {human(e.size)}
                      </span>
                    )}
                  </button>

                  {confirmDel === e.path ? (
                    <div className="flex items-center gap-1">
                      <IconBtn title="Confirmar" onClick={() => remove(e)} tone="danger">
                        <Check className="size-3.5" />
                      </IconBtn>
                      <IconBtn title="Cancelar" onClick={() => setConfirmDel(null)}>
                        <X className="size-3.5" />
                      </IconBtn>
                    </div>
                  ) : (
                    <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      {!e.is_dir && (
                        <IconBtn title="Descargar" onClick={() => download(e)}>
                          <Download className="size-3.5" />
                        </IconBtn>
                      )}
                      <IconBtn
                        title="Renombrar"
                        onClick={() => setRenaming({ path: e.path, value: e.name })}
                      >
                        <Pencil className="size-3.5" />
                      </IconBtn>
                      <IconBtn
                        title="Eliminar"
                        onClick={() => setConfirmDel(e.path)}
                        tone="danger"
                      >
                        <Trash2 className="size-3.5" />
                      </IconBtn>
                    </div>
                  )}
                </>
              )}
            </div>
          ))
        )}
      </div>

      {busy && (
        <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Transfiriendo…
        </div>
      )}

      {editing && (
        <FileEditorDialog
          open
          sessionId={sessionId}
          path={editing.path}
          name={editing.name}
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  tone,
}: {
  children: ReactNode;
  title: string;
  onClick: () => void;
  tone?: "danger";
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        "grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2",
        tone === "danger" ? "hover:text-destructive" : "hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
