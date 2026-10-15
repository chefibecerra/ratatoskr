//! Vault de claves privadas SSH: persistencia en disco (keys.json en app data dir).
//!
//! NOTA de seguridad (Capa 1): el material privado se guarda en texto plano, igual
//! que las contraseñas de hosts. Cifrado real / llavero del sistema: capa posterior.

use std::fs;
use std::path::PathBuf;

use russh::keys::{HashAlg, PrivateKey};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone)]
pub struct SshKey {
    pub id: String,
    pub label: String,
    /// Clave privada en formato OpenSSH (texto). Vacío si se usa `path`.
    #[serde(default)]
    pub private_key: String,
    /// Ruta a un archivo de clave en disco (p. ej. ~/.ssh/id_ed25519). Si está
    /// presente, se lee de ahí al conectar en vez de guardar el contenido.
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub passphrase: Option<String>,
}

/// Resuelve el material de la clave: desde un archivo (si hay `path`) o desde el
/// contenido pegado. Devuelve `None` si no hay ninguno (→ se usará contraseña).
pub fn read_key_material(
    private_key: Option<String>,
    path: Option<String>,
) -> Result<Option<String>, String> {
    if let Some(p) = path.filter(|s| !s.trim().is_empty()) {
        let expanded = expand_tilde(p.trim());
        let content = std::fs::read_to_string(&expanded)
            .map_err(|e| format!("no se pudo leer la clave en «{expanded}»: {e}"))?;
        return Ok(Some(content));
    }
    Ok(private_key.filter(|s| !s.trim().is_empty()))
}

/// Expande `~` o `~/...` al directorio home del usuario.
fn expand_tilde(p: &str) -> String {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(|h| h.to_string_lossy().into_owned());
    match home {
        Some(home) if p == "~" => home,
        Some(home) if p.starts_with("~/") => format!("{home}/{}", &p[2..]),
        _ => p.to_string(),
    }
}

#[derive(Serialize)]
pub struct KeyInfo {
    pub algorithm: String,
    pub fingerprint: String,
    pub encrypted: bool,
}

fn keys_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("keys.json"))
}

fn read_keys(app: &AppHandle) -> Result<Vec<SshKey>, String> {
    let path = keys_file(app)?;
    match fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str(&s).map_err(|e| e.to_string()),
        Err(_) => Ok(Vec::new()),
    }
}

fn write_keys(app: &AppHandle, keys: &[SshKey]) -> Result<(), String> {
    let path = keys_file(app)?;
    let s = serde_json::to_string_pretty(keys).map_err(|e| e.to_string())?;
    fs::write(path, s).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn keys_list(app: AppHandle) -> Result<Vec<SshKey>, String> {
    read_keys(&app)
}

#[tauri::command]
pub fn key_upsert(app: AppHandle, key: SshKey) -> Result<Vec<SshKey>, String> {
    let mut keys = read_keys(&app)?;
    match keys.iter_mut().find(|k| k.id == key.id) {
        Some(existing) => *existing = key,
        None => keys.push(key),
    }
    write_keys(&app, &keys)?;
    Ok(keys)
}

#[tauri::command]
pub fn key_delete(app: AppHandle, id: String) -> Result<Vec<SshKey>, String> {
    let mut keys = read_keys(&app)?;
    keys.retain(|k| k.id != id);
    write_keys(&app, &keys)?;
    Ok(keys)
}

/// Parsea una clave y devuelve tipo + fingerprint + si está cifrada, para mostrar
/// en la UI al agregar o ver una clave.
#[tauri::command]
pub fn key_info(
    private_key: Option<String>,
    path: Option<String>,
) -> Result<KeyInfo, String> {
    let content = read_key_material(private_key, path)?.ok_or("no hay clave")?;
    let key = PrivateKey::from_openssh(content.trim())
        .map_err(|e| format!("no se pudo leer la clave (¿formato OpenSSH?): {e}"))?;
    Ok(KeyInfo {
        algorithm: key.algorithm().to_string(),
        fingerprint: key.fingerprint(HashAlg::Sha256).to_string(),
        encrypted: key.is_encrypted(),
    })
}
