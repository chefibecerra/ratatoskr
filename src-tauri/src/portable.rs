use std::fs;

use serde_json::Value;
use tauri::State;

use crate::hosts::{AuthMethod, Host};
use crate::vault::VaultManager;

/// Exportación legible de hosts, pensada para compartir. Las contraseñas y
/// passphrases se omiten a propósito: un archivo compartible no debe llevar
/// secretos en texto plano. Las rutas de clave sí se conservan (no son
/// secretas, son rutas locales).
#[tauri::command]
pub fn hosts_export(state: State<'_, VaultManager>, target: String) -> Result<usize, String> {
    let mut hosts = state.with_data(|d| d.hosts.clone())?;
    for host in &mut hosts {
        host.auth = match &host.auth {
            AuthMethod::Password { .. } => AuthMethod::Password {
                password: String::new(),
            },
            AuthMethod::Key { key_path, .. } => AuthMethod::Key {
                key_path: key_path.clone(),
                passphrase: None,
            },
        };
    }
    let count = hosts.len();
    let raw = serde_json::to_string_pretty(&hosts).map_err(|e| e.to_string())?;
    fs::write(&target, raw).map_err(|e| e.to_string())?;
    Ok(count)
}

/// Lee un archivo de hosts exportado y lo devuelve al frontend, que fusiona
/// con los existentes usando el flujo normal de guardado (hacia el vault).
#[tauri::command]
pub fn hosts_import(source: String) -> Result<Vec<Host>, String> {
    let raw = fs::read_to_string(&source).map_err(|e| e.to_string())?;
    serde_json::from_str::<Vec<Host>>(&raw)
        .map_err(|_| "El archivo no es una lista de hosts válida.".to_string())
}

#[tauri::command]
pub fn settings_export(target: String, settings: Value) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(&target, raw).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn settings_import(source: String) -> Result<Value, String> {
    let raw = fs::read_to_string(&source).map_err(|e| e.to_string())?;
    serde_json::from_str::<Value>(&raw)
        .map_err(|_| "El archivo no es una configuración válida.".to_string())
}
