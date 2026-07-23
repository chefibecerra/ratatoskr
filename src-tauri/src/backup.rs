use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager, State};

use crate::history::HistoryEntry;
use crate::known_hosts::KnownHost;
use crate::store::{read_collection, write_collection};
use crate::vault::VaultManager;

/// Copia completa: el vault viaja tal cual está en disco (cifrado); ajustes,
/// servidores conocidos e historial no contienen credenciales.
#[derive(Serialize, Deserialize)]
struct BackupFile {
    version: u32,
    created_at: u64,
    vault: Option<Value>,
    known_hosts: Vec<KnownHost>,
    history: Vec<HistoryEntry>,
    settings: Value,
}

#[tauri::command]
pub fn backup_export(app: AppHandle, target: String, settings: Value) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let vault = fs::read_to_string(dir.join("vault.enc"))
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok());

    let backup = BackupFile {
        version: 1,
        created_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0),
        vault,
        known_hosts: read_collection(&app, "known_hosts.json").unwrap_or_default(),
        history: read_collection(&app, "history.json").unwrap_or_default(),
        settings,
    };

    let raw = serde_json::to_string_pretty(&backup).map_err(|e| e.to_string())?;
    fs::write(&target, raw).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&target, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

/// Restaura una copia completa y devuelve los ajustes para que el frontend
/// los aplique. El vault queda bloqueado: se abre con la contraseña de la
/// copia importada.
#[tauri::command]
pub fn backup_import(
    app: AppHandle,
    state: State<'_, VaultManager>,
    source: String,
) -> Result<Value, String> {
    let raw = fs::read_to_string(&source).map_err(|e| e.to_string())?;
    let backup: BackupFile = serde_json::from_str(&raw)
        .map_err(|_| "El archivo no es una copia de seguridad válida.".to_string())?;
    if backup.version != 1 {
        return Err("Versión de copia de seguridad no soportada.".into());
    }

    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    if let Some(vault) = &backup.vault {
        let valid = vault.get("salt").is_some()
            && vault.get("nonce").is_some()
            && vault.get("data").is_some();
        if !valid {
            return Err("La copia contiene un vault corrupto.".into());
        }
        let path = dir.join("vault.enc");
        if path.exists() {
            fs::copy(&path, path.with_extension("enc.bak")).map_err(|e| e.to_string())?;
        }
        fs::write(&path, serde_json::to_string(vault).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
        }
    }

    write_collection(&app, "known_hosts.json", &backup.known_hosts)?;
    write_collection(&app, "history.json", &backup.history)?;

    state.lock_now();
    Ok(backup.settings)
}
