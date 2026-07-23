use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::vault::VaultManager;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AuthMethod {
    Password {
        password: String,
    },
    Key {
        key_path: String,
        passphrase: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Host {
    pub id: String,
    pub name: String,
    pub hostname: String,
    pub port: u16,
    pub username: String,
    pub auth: AuthMethod,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub group: Option<String>,
    /// id de otro host que actúa de bastión (ProxyJump); None = conexión directa
    #[serde(default)]
    pub jump_host_id: Option<String>,
    /// comandos ejecutados automáticamente al abrir la sesión
    #[serde(default)]
    pub login_commands: Vec<String>,
}

#[tauri::command]
pub fn list_hosts(state: State<'_, VaultManager>) -> Result<Vec<Host>, String> {
    state.with_data(|d| d.hosts.clone())
}

#[tauri::command]
pub fn save_host(
    app: AppHandle,
    state: State<'_, VaultManager>,
    mut host: Host,
) -> Result<Host, String> {
    if host.id.is_empty() {
        host.id = uuid::Uuid::new_v4().to_string();
    }
    let saved = host.clone();
    state.mutate(&app, move |d| {
        match d.hosts.iter_mut().find(|h| h.id == host.id) {
            Some(existing) => *existing = host,
            None => d.hosts.push(host),
        }
    })?;
    Ok(saved)
}

#[tauri::command]
pub fn delete_host(
    app: AppHandle,
    state: State<'_, VaultManager>,
    id: String,
) -> Result<(), String> {
    state.mutate(&app, move |d| d.hosts.retain(|h| h.id != id))
}
