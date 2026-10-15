//! Comandos SFTP sobre una sesión SSH viva. Cada comando abre un subsistema
//! SFTP fresco, hace la operación y lo cierra. Simple y robusto para la v1;
//! el cacheo de la sesión SFTP queda para una optimización posterior.

use std::fs;

use serde::Serialize;
use tauri::State;

use crate::ssh::{open_sftp, SshState};

/// Límite para editar en la app (archivos más grandes: mejor descargar).
const MAX_EDIT_BYTES: usize = 2 * 1024 * 1024;

#[derive(Serialize)]
pub struct SftpEntry {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
}

fn join(dir: &str, name: &str) -> String {
    if dir.ends_with('/') {
        format!("{dir}{name}")
    } else {
        format!("{dir}/{name}")
    }
}

/// Ruta absoluta del home del usuario (punto de partida del explorador).
#[tauri::command]
pub async fn sftp_home(state: State<'_, SshState>, id: String) -> Result<String, String> {
    let sftp = open_sftp(&state, &id).await?;
    let home = sftp
        .canonicalize(".")
        .await
        .unwrap_or_else(|_| "/".to_string());
    let _ = sftp.close().await;
    Ok(home)
}

#[tauri::command]
pub async fn sftp_list(
    state: State<'_, SshState>,
    id: String,
    path: String,
) -> Result<Vec<SftpEntry>, String> {
    let sftp = open_sftp(&state, &id).await?;
    let dir = sftp
        .read_dir(path.clone())
        .await
        .map_err(|e| format!("no se pudo listar «{path}»: {e}"))?;

    let mut entries: Vec<SftpEntry> = Vec::new();
    for entry in dir {
        let name = entry.file_name();
        if name == "." || name == ".." {
            continue;
        }
        let md = entry.metadata();
        entries.push(SftpEntry {
            path: join(&path, &name),
            name,
            is_dir: md.is_dir(),
            size: md.size.unwrap_or(0),
        });
    }
    let _ = sftp.close().await;

    // Carpetas primero, luego por nombre (insensible a mayúsculas).
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

/// Descarga un archivo remoto a una ruta local.
#[tauri::command]
pub async fn sftp_download(
    state: State<'_, SshState>,
    id: String,
    remote: String,
    local: String,
) -> Result<(), String> {
    let sftp = open_sftp(&state, &id).await?;
    let data = sftp
        .read(remote.clone())
        .await
        .map_err(|e| format!("no se pudo leer «{remote}»: {e}"))?;
    let _ = sftp.close().await;
    fs::write(&local, data).map_err(|e| format!("no se pudo guardar en disco: {e}"))
}

/// Sube un archivo local a un directorio remoto.
#[tauri::command]
pub async fn sftp_upload(
    state: State<'_, SshState>,
    id: String,
    local: String,
    remote_dir: String,
) -> Result<(), String> {
    let data = fs::read(&local).map_err(|e| format!("no se pudo leer el archivo local: {e}"))?;
    let name = std::path::Path::new(&local)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("nombre de archivo inválido")?;
    let remote = join(&remote_dir, name);

    let sftp = open_sftp(&state, &id).await?;
    sftp.write(remote.clone(), &data)
        .await
        .map_err(|e| format!("no se pudo subir a «{remote}»: {e}"))?;
    let _ = sftp.close().await;
    Ok(())
}

#[tauri::command]
pub async fn sftp_mkdir(
    state: State<'_, SshState>,
    id: String,
    path: String,
) -> Result<(), String> {
    let sftp = open_sftp(&state, &id).await?;
    let r = sftp.create_dir(path.clone()).await;
    let _ = sftp.close().await;
    r.map_err(|e| format!("no se pudo crear la carpeta: {e}"))
}

#[tauri::command]
pub async fn sftp_remove(
    state: State<'_, SshState>,
    id: String,
    path: String,
    is_dir: bool,
) -> Result<(), String> {
    let sftp = open_sftp(&state, &id).await?;
    let r = if is_dir {
        sftp.remove_dir(path.clone()).await
    } else {
        sftp.remove_file(path.clone()).await
    };
    let _ = sftp.close().await;
    r.map_err(|e| format!("no se pudo eliminar: {e}"))
}

#[tauri::command]
pub async fn sftp_rename(
    state: State<'_, SshState>,
    id: String,
    from: String,
    to: String,
) -> Result<(), String> {
    let sftp = open_sftp(&state, &id).await?;
    let r = sftp.rename(from, to).await;
    let _ = sftp.close().await;
    r.map_err(|e| format!("no se pudo renombrar: {e}"))
}

/// Lee un archivo remoto como texto (con tope de tamaño) para editarlo.
#[tauri::command]
pub async fn sftp_read_text(
    state: State<'_, SshState>,
    id: String,
    path: String,
) -> Result<String, String> {
    let sftp = open_sftp(&state, &id).await?;
    let data = sftp
        .read(path.clone())
        .await
        .map_err(|e| format!("no se pudo leer «{path}»: {e}"));
    let _ = sftp.close().await;
    let data = data?;
    if data.len() > MAX_EDIT_BYTES {
        return Err("el archivo es demasiado grande para editar aquí".into());
    }
    String::from_utf8(data).map_err(|_| "el archivo no parece ser texto (binario)".to_string())
}

/// Guarda texto en un archivo remoto. Usa WRITE|CREATE|TRUNCATE para crear si no
/// existe y truncar el contenido anterior (el `write()` de la librería no lo hace).
#[tauri::command]
pub async fn sftp_write_text(
    state: State<'_, SshState>,
    id: String,
    path: String,
    content: String,
) -> Result<(), String> {
    use russh_sftp::protocol::OpenFlags;
    use tokio::io::AsyncWriteExt;

    let sftp = open_sftp(&state, &id).await?;
    let flags = OpenFlags::WRITE | OpenFlags::CREATE | OpenFlags::TRUNCATE;
    let result: Result<(), String> = async {
        let mut file = sftp
            .open_with_flags(path.clone(), flags)
            .await
            .map_err(|e| format!("no se pudo abrir «{path}» para escribir: {e}"))?;
        file.write_all(content.as_bytes())
            .await
            .map_err(|e| format!("error al escribir: {e}"))?;
        file.close()
            .await
            .map_err(|e| format!("error al cerrar el archivo: {e}"))?;
        Ok(())
    }
    .await;
    let _ = sftp.close().await;
    result
}
