use std::collections::HashMap;

use russh_sftp::client::SftpSession;
use serde::Serialize;
use tauri::{AppHandle, State};
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

use crate::hosts::Host;
use crate::ssh::{connect_authenticated, Connection};

/// Escribe (creando o truncando) un archivo remoto. IMPRESCINDIBLE usar
/// `create` (CREATE|TRUNCATE|WRITE): el atajo `SftpSession::write` abre solo
/// con WRITE, así que falla con NoSuchFile en archivos nuevos y deja basura al
/// final si el contenido nuevo es más corto que el anterior.
async fn write_remote(sftp: &SftpSession, path: &str, data: &[u8]) -> Result<(), String> {
    let mut file = sftp.create(path).await.map_err(|e| e.to_string())?;
    file.write_all(data).await.map_err(|e| e.to_string())?;
    file.flush().await.map_err(|e| e.to_string())?;
    file.shutdown().await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Mantiene vivas las sesiones SFTP. La conexión SSH se guarda junto a la
/// sesión: si se soltara, el canal subyacente (y sus bastiones) morirían.
#[derive(Default)]
pub struct SftpState {
    sessions: Mutex<HashMap<String, SftpConn>>,
}

struct SftpConn {
    _conn: Connection,
    sftp: SftpSession,
}

#[derive(Serialize)]
pub struct SftpEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    /// segundos desde epoch, si el servidor lo informa
    pub modified: Option<u32>,
}

#[tauri::command]
pub async fn sftp_connect(
    app: AppHandle,
    state: State<'_, SftpState>,
    sftp_id: String,
    host: Host,
) -> Result<String, String> {
    let conn = connect_authenticated(&app, &host, 15).await?;
    let channel = conn
        .handle
        .channel_open_session()
        .await
        .map_err(|e| e.to_string())?;
    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|e| format!("el servidor no ofrece SFTP: {e}"))?;
    let sftp = SftpSession::new(channel.into_stream())
        .await
        .map_err(|e| e.to_string())?;

    // el directorio inicial es el HOME del usuario remoto
    let home = sftp.canonicalize(".").await.unwrap_or_else(|_| "/".into());

    state
        .sessions
        .lock()
        .await
        .insert(sftp_id, SftpConn { _conn: conn, sftp });
    Ok(home)
}

#[tauri::command]
pub async fn sftp_list(
    state: State<'_, SftpState>,
    sftp_id: String,
    path: String,
) -> Result<Vec<SftpEntry>, String> {
    let sessions = state.sessions.lock().await;
    let conn = sessions.get(&sftp_id).ok_or("sesión SFTP no encontrada")?;

    let read = conn.sftp.read_dir(&path).await.map_err(|e| e.to_string())?;
    let base = path.trim_end_matches('/');

    let mut entries: Vec<SftpEntry> = read
        .map(|entry| {
            let name = entry.file_name();
            let meta = entry.metadata();
            SftpEntry {
                path: format!("{base}/{name}"),
                is_dir: entry.file_type().is_dir(),
                size: meta.size.unwrap_or(0),
                modified: meta.mtime,
                name,
            }
        })
        .filter(|e| e.name != "." && e.name != "..")
        .collect();

    // carpetas primero, luego por nombre
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

#[tauri::command]
pub async fn sftp_download(
    state: State<'_, SftpState>,
    sftp_id: String,
    remote_path: String,
    local_path: String,
) -> Result<(), String> {
    let sessions = state.sessions.lock().await;
    let conn = sessions.get(&sftp_id).ok_or("sesión SFTP no encontrada")?;
    let bytes = conn
        .sftp
        .read(&remote_path)
        .await
        .map_err(|e| e.to_string())?;
    tokio::fs::write(&local_path, bytes)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sftp_upload(
    state: State<'_, SftpState>,
    sftp_id: String,
    local_path: String,
    remote_path: String,
) -> Result<(), String> {
    let sessions = state.sessions.lock().await;
    let conn = sessions.get(&sftp_id).ok_or("sesión SFTP no encontrada")?;
    let bytes = tokio::fs::read(&local_path)
        .await
        .map_err(|e| e.to_string())?;
    write_remote(&conn.sftp, &remote_path, &bytes).await
}

/// Máximo para el editor integrado: 2 MB. Por encima, mejor descargar.
const MAX_EDIT_BYTES: usize = 2 * 1024 * 1024;

#[tauri::command]
pub async fn sftp_read_text(
    state: State<'_, SftpState>,
    sftp_id: String,
    path: String,
) -> Result<String, String> {
    let sessions = state.sessions.lock().await;
    let conn = sessions.get(&sftp_id).ok_or("sesión SFTP no encontrada")?;
    let bytes = conn.sftp.read(&path).await.map_err(|e| e.to_string())?;
    if bytes.len() > MAX_EDIT_BYTES {
        return Err("El archivo es demasiado grande para editarlo aquí.".into());
    }
    String::from_utf8(bytes)
        .map_err(|_| "No es un archivo de texto (contiene datos binarios).".to_string())
}

#[tauri::command]
pub async fn sftp_write_text(
    state: State<'_, SftpState>,
    sftp_id: String,
    path: String,
    content: String,
) -> Result<(), String> {
    let sessions = state.sessions.lock().await;
    let conn = sessions.get(&sftp_id).ok_or("sesión SFTP no encontrada")?;
    write_remote(&conn.sftp, &path, content.as_bytes()).await
}

#[tauri::command]
pub async fn sftp_mkdir(
    state: State<'_, SftpState>,
    sftp_id: String,
    path: String,
) -> Result<(), String> {
    let sessions = state.sessions.lock().await;
    let conn = sessions.get(&sftp_id).ok_or("sesión SFTP no encontrada")?;
    conn.sftp.create_dir(&path).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sftp_remove(
    state: State<'_, SftpState>,
    sftp_id: String,
    path: String,
    is_dir: bool,
) -> Result<(), String> {
    let sessions = state.sessions.lock().await;
    let conn = sessions.get(&sftp_id).ok_or("sesión SFTP no encontrada")?;
    if is_dir {
        conn.sftp.remove_dir(&path).await.map_err(|e| e.to_string())
    } else {
        conn.sftp
            .remove_file(&path)
            .await
            .map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub async fn sftp_rename(
    state: State<'_, SftpState>,
    sftp_id: String,
    from: String,
    to: String,
) -> Result<(), String> {
    let sessions = state.sessions.lock().await;
    let conn = sessions.get(&sftp_id).ok_or("sesión SFTP no encontrada")?;
    conn.sftp
        .rename(&from, &to)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sftp_disconnect(
    state: State<'_, SftpState>,
    sftp_id: String,
) -> Result<(), String> {
    // al quitarlo del mapa, se sueltan sesión SFTP y handle SSH
    state.sessions.lock().await.remove(&sftp_id);
    Ok(())
}
