use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::hosts::Host;
use crate::store::{read_collection, write_collection};

const FILE: &str = "history.json";
const MAX_ENTRIES: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub id: String,
    pub host_id: String,
    pub host_name: String,
    pub username: String,
    pub hostname: String,
    pub port: u16,
    /// milisegundos desde epoch
    pub timestamp: u64,
    pub ok: bool,
    pub error: Option<String>,
}

pub fn record(app: &AppHandle, host: &Host, ok: bool, error: Option<String>) {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let entry = HistoryEntry {
        id: uuid::Uuid::new_v4().to_string(),
        host_id: host.id.clone(),
        host_name: host.name.clone(),
        username: host.username.clone(),
        hostname: host.hostname.clone(),
        port: host.port,
        timestamp,
        ok,
        error,
    };
    // El historial es best-effort: nunca bloquea una conexión.
    let mut entries: Vec<HistoryEntry> = read_collection(app, FILE).unwrap_or_default();
    entries.insert(0, entry);
    entries.truncate(MAX_ENTRIES);
    let _ = write_collection(app, FILE, &entries);
}

#[tauri::command]
pub fn list_history(app: AppHandle) -> Result<Vec<HistoryEntry>, String> {
    read_collection(&app, FILE)
}

#[tauri::command]
pub fn clear_history(app: AppHandle) -> Result<(), String> {
    write_collection::<HistoryEntry>(&app, FILE, &[])
}
