use std::time::{SystemTime, UNIX_EPOCH};

use russh::keys::ssh_key::{HashAlg, PublicKey};
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::store::{read_collection, write_collection};

const FILE: &str = "known_hosts.json";

/// Igual que OpenSSH: las claves públicas de servidores no son secretas,
/// viven fuera del vault.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnownHost {
    /// "hostname:puerto"
    pub host: String,
    /// clave pública completa en formato OpenSSH
    pub key: String,
    /// huella SHA256, como la muestra ssh
    pub fingerprint: String,
    pub added_at: u64,
}

pub enum Verification {
    Trusted,
    Mismatch { stored: String, presented: String },
}

pub fn verify_and_store(
    app: &AppHandle,
    host: &str,
    key: &PublicKey,
) -> Result<Verification, String> {
    let presented_key = key.to_openssh().map_err(|e| e.to_string())?;
    let presented_fp = key.fingerprint(HashAlg::Sha256).to_string();

    let mut known: Vec<KnownHost> = read_collection(app, FILE)?;
    if let Some(entry) = known.iter().find(|k| k.host == host) {
        if entry.key == presented_key {
            return Ok(Verification::Trusted);
        }
        return Ok(Verification::Mismatch {
            stored: entry.fingerprint.clone(),
            presented: presented_fp,
        });
    }

    // Primera conexión: se confía y se registra (TOFU).
    known.push(KnownHost {
        host: host.to_string(),
        key: presented_key,
        fingerprint: presented_fp,
        added_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0),
    });
    write_collection(app, FILE, &known)?;
    Ok(Verification::Trusted)
}

#[tauri::command]
pub fn list_known_hosts(app: AppHandle) -> Result<Vec<KnownHost>, String> {
    read_collection(&app, FILE)
}

#[tauri::command]
pub fn forget_known_host(app: AppHandle, host: String) -> Result<(), String> {
    let mut known: Vec<KnownHost> = read_collection(&app, FILE)?;
    known.retain(|k| k.host != host);
    write_collection(&app, FILE, &known)
}
