use std::{fs, path::PathBuf, sync::Mutex};

use argon2::Argon2;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use chacha20poly1305::{
    aead::{rand_core::RngCore, Aead, KeyInit, OsRng},
    ChaCha20Poly1305,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::hosts::Host;
use crate::snippets::Snippet;

const FILE: &str = "vault.enc";

/// Todo lo sensible vive acá: cifrado en disco, en claro solo en memoria
/// mientras el vault está desbloqueado. Regla de oro del README: la master
/// password y las claves nunca salen del dispositivo sin cifrar.
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct VaultData {
    #[serde(default)]
    pub hosts: Vec<Host>,
    #[serde(default)]
    pub snippets: Vec<Snippet>,
}

#[derive(Serialize, Deserialize)]
struct VaultFile {
    version: u32,
    /// contador monótono: cada escritura lo incrementa; es la base del sync
    #[serde(default)]
    revision: u64,
    #[serde(default)]
    updated_at: u64,
    salt: String,
    nonce: String,
    data: String,
}

/// Metadatos legibles sin contraseña (para mostrar y para el sync futuro).
#[derive(Serialize)]
pub struct VaultInfo {
    pub revision: u64,
    pub updated_at: u64,
}

struct Unlocked {
    key: [u8; 32],
    salt: [u8; 16],
    revision: u64,
    data: VaultData,
}

impl Drop for Unlocked {
    fn drop(&mut self) {
        // al bloquear, la clave no queda flotando en memoria liberada
        use zeroize::Zeroize;
        self.key.zeroize();
    }
}

fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[derive(Default)]
pub struct VaultManager(Mutex<Option<Unlocked>>);

impl VaultManager {
    /// Descarta la clave y los datos en claro de memoria.
    pub fn lock_now(&self) {
        *self.0.lock().unwrap() = None;
    }

    pub fn with_data<R>(&self, f: impl FnOnce(&VaultData) -> R) -> Result<R, String> {
        match self.0.lock().unwrap().as_ref() {
            Some(u) => Ok(f(&u.data)),
            None => Err("El vault está bloqueado.".into()),
        }
    }

    /// Aplica el cambio y persiste cifrado con la revisión incrementada.
    /// Si la escritura falla, el cambio queda solo en memoria y se devuelve
    /// el error.
    pub fn mutate<R>(
        &self,
        app: &AppHandle,
        f: impl FnOnce(&mut VaultData) -> R,
    ) -> Result<R, String> {
        let mut guard = self.0.lock().unwrap();
        let Some(unlocked) = guard.as_mut() else {
            return Err("El vault está bloqueado.".into());
        };
        let result = f(&mut unlocked.data);
        unlocked.revision += 1;
        write_encrypted(app, unlocked)?;
        Ok(result)
    }
}

fn vault_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(FILE))
}

fn derive_key(password: &str, salt: &[u8; 16]) -> Result<[u8; 32], String> {
    let mut key = [0u8; 32];
    Argon2::default()
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| e.to_string())?;
    Ok(key)
}

/// Cifra con ChaCha20-Poly1305 y un nonce aleatorio. Función pura: sin disco
/// ni Tauri, para poder testearla de forma aislada.
fn encrypt_bytes(key: &[u8; 32], plaintext: &[u8]) -> Result<([u8; 12], Vec<u8>), String> {
    let cipher = ChaCha20Poly1305::new(key.into());
    let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut nonce);
    let ciphertext = cipher
        .encrypt((&nonce).into(), plaintext)
        .map_err(|_| "No se pudo cifrar el vault.".to_string())?;
    Ok((nonce, ciphertext))
}

/// Descifra y verifica el tag AEAD. Un tag inválido (clave incorrecta o datos
/// manipulados) es un error, no un pánico.
fn decrypt_bytes(key: &[u8; 32], nonce: &[u8; 12], ciphertext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = ChaCha20Poly1305::new(key.into());
    cipher
        .decrypt(nonce.into(), ciphertext)
        .map_err(|_| "Contraseña incorrecta.".to_string())
}

fn write_encrypted(app: &AppHandle, unlocked: &Unlocked) -> Result<(), String> {
    let plaintext = serde_json::to_vec(&unlocked.data).map_err(|e| e.to_string())?;
    let (nonce, ciphertext) = encrypt_bytes(&unlocked.key, &plaintext)?;

    let file = VaultFile {
        version: 1,
        revision: unlocked.revision,
        updated_at: now_millis(),
        salt: B64.encode(unlocked.salt),
        nonce: B64.encode(nonce),
        data: B64.encode(ciphertext),
    };
    let path = vault_path(app)?;
    fs::write(&path, serde_json::to_string(&file).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn vault_status(app: AppHandle, state: State<'_, VaultManager>) -> Result<String, String> {
    if state.0.lock().unwrap().is_some() {
        return Ok("unlocked".into());
    }
    Ok(if vault_path(&app)?.exists() {
        "locked"
    } else {
        "uninitialized"
    }
    .into())
}

#[tauri::command]
pub fn vault_create(
    app: AppHandle,
    state: State<'_, VaultManager>,
    password: String,
) -> Result<(), String> {
    if password.chars().count() < 8 {
        return Err("La contraseña maestra debe tener al menos 8 caracteres.".into());
    }
    let path = vault_path(&app)?;
    if path.exists() {
        return Err("El vault ya existe.".into());
    }

    // Migración: importa los datos que hasta ahora vivían en texto plano.
    let hosts: Vec<Host> = crate::store::read_collection(&app, "hosts.json").unwrap_or_default();
    let snippets: Vec<Snippet> =
        crate::store::read_collection(&app, "snippets.json").unwrap_or_default();
    let data = VaultData { hosts, snippets };

    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);
    let key = derive_key(&password, &salt)?;
    let unlocked = Unlocked {
        key,
        salt,
        revision: 1,
        data,
    };
    write_encrypted(&app, &unlocked)?;

    // Con el vault escrito, los archivos en claro sobran.
    if let Ok(dir) = app.path().app_data_dir() {
        let _ = fs::remove_file(dir.join("hosts.json"));
        let _ = fs::remove_file(dir.join("snippets.json"));
    }

    *state.0.lock().unwrap() = Some(unlocked);
    Ok(())
}

#[tauri::command]
pub fn vault_unlock(
    app: AppHandle,
    state: State<'_, VaultManager>,
    password: String,
) -> Result<(), String> {
    let path = vault_path(&app)?;
    let raw = fs::read_to_string(&path).map_err(|_| "No existe el vault.".to_string())?;
    let file: VaultFile = serde_json::from_str(&raw).map_err(|e| e.to_string())?;

    let salt_bytes = B64.decode(&file.salt).map_err(|e| e.to_string())?;
    let salt: [u8; 16] = salt_bytes
        .try_into()
        .map_err(|_| "Vault corrupto (salt).".to_string())?;
    let nonce_bytes = B64.decode(&file.nonce).map_err(|e| e.to_string())?;
    // try_into valida la longitud: un vault corrupto no debe tumbar la app
    let nonce: [u8; 12] = nonce_bytes
        .try_into()
        .map_err(|_| "Vault corrupto (nonce).".to_string())?;
    let ciphertext = B64.decode(&file.data).map_err(|e| e.to_string())?;

    let key = derive_key(&password, &salt)?;
    let plaintext = decrypt_bytes(&key, &nonce, &ciphertext)?;
    let data: VaultData = serde_json::from_slice(&plaintext).map_err(|e| e.to_string())?;

    *state.0.lock().unwrap() = Some(Unlocked {
        key,
        salt,
        revision: file.revision,
        data,
    });
    Ok(())
}

#[tauri::command]
pub fn vault_lock(state: State<'_, VaultManager>) -> Result<(), String> {
    *state.0.lock().unwrap() = None;
    Ok(())
}

#[tauri::command]
pub fn vault_info(app: AppHandle) -> Result<VaultInfo, String> {
    let raw = fs::read_to_string(vault_path(&app)?)
        .map_err(|_| "No existe el vault.".to_string())?;
    let file: VaultFile = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    Ok(VaultInfo {
        revision: file.revision,
        updated_at: file.updated_at,
    })
}

/// Copia de seguridad: el blob cifrado sale tal cual está en disco.
#[tauri::command]
pub fn vault_export(app: AppHandle, target: String) -> Result<(), String> {
    let path = vault_path(&app)?;
    if !path.exists() {
        return Err("No existe el vault.".into());
    }
    fs::copy(&path, &target).map_err(|e| e.to_string())?;
    Ok(())
}

/// Restaura un vault desde archivo. Valida el formato, respalda el actual
/// como vault.enc.bak y deja el estado bloqueado: se abre con la contraseña
/// del vault importado.
#[tauri::command]
pub fn vault_import(
    app: AppHandle,
    state: State<'_, VaultManager>,
    source: String,
) -> Result<(), String> {
    let raw = fs::read_to_string(&source).map_err(|e| e.to_string())?;
    let file: VaultFile =
        serde_json::from_str(&raw).map_err(|_| "El archivo no es un vault válido.".to_string())?;
    B64.decode(&file.salt).map_err(|_| "El archivo no es un vault válido.".to_string())?;
    B64.decode(&file.data).map_err(|_| "El archivo no es un vault válido.".to_string())?;

    let path = vault_path(&app)?;
    if path.exists() {
        fs::copy(&path, path.with_extension("enc.bak")).map_err(|e| e.to_string())?;
    }
    fs::copy(&source, &path).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
    }

    *state.0.lock().unwrap() = None;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SALT: [u8; 16] = [7u8; 16];

    #[test]
    fn cifrar_y_descifrar_recupera_el_texto() {
        let key = derive_key("contraseña-fuerte", &SALT).unwrap();
        let secreto = b"root@prod password super secreta";
        let (nonce, ct) = encrypt_bytes(&key, secreto).unwrap();
        let recuperado = decrypt_bytes(&key, &nonce, &ct).unwrap();
        assert_eq!(recuperado, secreto);
    }

    #[test]
    fn contrasena_incorrecta_falla_no_devuelve_basura() {
        let buena = derive_key("la-correcta", &SALT).unwrap();
        let mala = derive_key("la-incorrecta", &SALT).unwrap();
        let (nonce, ct) = encrypt_bytes(&buena, b"datos del vault").unwrap();
        // el tag AEAD debe rechazar la clave equivocada
        assert!(decrypt_bytes(&mala, &nonce, &ct).is_err());
    }

    #[test]
    fn ciphertext_manipulado_es_rechazado() {
        let key = derive_key("clave", &SALT).unwrap();
        let (nonce, mut ct) = encrypt_bytes(&key, b"integridad").unwrap();
        ct[0] ^= 0xff; // un bit cambiado invalida el tag
        assert!(decrypt_bytes(&key, &nonce, &ct).is_err());
    }

    #[test]
    fn mismo_password_distinta_sal_da_distinta_clave() {
        let salt2: [u8; 16] = [9u8; 16];
        let k1 = derive_key("igual", &SALT).unwrap();
        let k2 = derive_key("igual", &salt2).unwrap();
        assert_ne!(k1, k2);
    }

    #[test]
    fn nonce_es_distinto_en_cada_cifrado() {
        let key = derive_key("clave", &SALT).unwrap();
        let (n1, _) = encrypt_bytes(&key, b"x").unwrap();
        let (n2, _) = encrypt_bytes(&key, b"x").unwrap();
        assert_ne!(n1, n2, "reutilizar el nonce rompe ChaCha20-Poly1305");
    }
}
