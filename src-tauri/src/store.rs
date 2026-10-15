//! Vault de hosts: persistencia simple en disco (JSON en el app data dir).
//!
//! NOTA de seguridad (Capa 1): la contraseña se guarda en texto plano dentro de
//! `hosts.json`. Es un primer paso para "guardar hosts". El cifrado real / uso
//! del llavero del sistema es trabajo de una capa posterior.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone)]
pub struct Host {
    pub id: String,
    pub label: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    #[serde(default)]
    pub password: Option<String>,
    /// "password" | "key" (default: password)
    #[serde(default)]
    pub auth_type: Option<String>,
    /// id de la clave del vault cuando auth_type == "key"
    #[serde(default)]
    pub key_id: Option<String>,
    /// id del host bastión para jump
    #[serde(default)]
    pub jump_host_id: Option<String>,
    /// Grupo/carpeta al que pertenece el host (texto libre).
    #[serde(default)]
    pub group: Option<String>,
    /// Color de acento del host (hex), para el avatar en la lista.
    #[serde(default)]
    pub color: Option<String>,
}

fn hosts_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("hosts.json"))
}

fn read_hosts(app: &AppHandle) -> Result<Vec<Host>, String> {
    let path = hosts_file(app)?;
    match fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str(&s).map_err(|e| e.to_string()),
        Err(_) => Ok(Vec::new()),
    }
}

fn write_hosts(app: &AppHandle, hosts: &[Host]) -> Result<(), String> {
    let path = hosts_file(app)?;
    let s = serde_json::to_string_pretty(hosts).map_err(|e| e.to_string())?;
    fs::write(path, s).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn hosts_list(app: AppHandle) -> Result<Vec<Host>, String> {
    read_hosts(&app)
}

/// Crea o actualiza un host (busca por id). Devuelve la lista completa ya actualizada.
#[tauri::command]
pub fn host_upsert(app: AppHandle, host: Host) -> Result<Vec<Host>, String> {
    let mut hosts = read_hosts(&app)?;
    match hosts.iter_mut().find(|h| h.id == host.id) {
        Some(existing) => *existing = host,
        None => hosts.push(host),
    }
    write_hosts(&app, &hosts)?;
    Ok(hosts)
}

#[tauri::command]
pub fn host_delete(app: AppHandle, id: String) -> Result<Vec<Host>, String> {
    let mut hosts = read_hosts(&app)?;
    hosts.retain(|h| h.id != id);
    write_hosts(&app, &hosts)?;
    Ok(hosts)
}

/// Un host parseado desde ~/.ssh/config.
#[derive(Serialize)]
pub struct ConfigHost {
    alias: String,
    hostname: Option<String>,
    user: Option<String>,
    port: Option<u16>,
    identity_file: Option<String>,
}

/// Lee y parsea ~/.ssh/config, devolviendo los bloques Host (sin comodines).
#[tauri::command]
pub fn ssh_config_hosts() -> Result<Vec<ConfigHost>, String> {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(|h| h.to_string_lossy().into_owned())
        .ok_or("no se encontró el directorio home")?;
    let path = format!("{home}/.ssh/config");
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("no se pudo leer {path}: {e}"))?;

    let mut hosts: Vec<ConfigHost> = Vec::new();
    let mut current: Option<ConfigHost> = None;

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((key, value)) = line.split_once(|c: char| c.is_whitespace() || c == '=')
        else {
            continue;
        };
        let key = key.trim().to_lowercase();
        let value = value.trim().trim_start_matches('=').trim().to_string();

        match key.as_str() {
            "host" => {
                if let Some(h) = current.take() {
                    hosts.push(h);
                }
                // Puede haber varios alias; tomamos el primero sin comodín.
                let alias = value
                    .split_whitespace()
                    .find(|a| !a.contains('*') && !a.contains('?'));
                current = alias.map(|a| ConfigHost {
                    alias: a.to_string(),
                    hostname: None,
                    user: None,
                    port: None,
                    identity_file: None,
                });
            }
            "hostname" => {
                if let Some(c) = current.as_mut() {
                    c.hostname = Some(value);
                }
            }
            "user" => {
                if let Some(c) = current.as_mut() {
                    c.user = Some(value);
                }
            }
            "port" => {
                if let Some(c) = current.as_mut() {
                    c.port = value.parse().ok();
                }
            }
            "identityfile" => {
                if let Some(c) = current.as_mut() {
                    c.identity_file = Some(value);
                }
            }
            _ => {}
        }
    }
    if let Some(h) = current.take() {
        hosts.push(h);
    }
    Ok(hosts)
}
