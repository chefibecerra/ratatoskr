use std::fs;

use serde_json::Value;
use tauri::State;

use crate::hosts::{AuthMethod, Host};
use crate::vault::VaultManager;

/// Quita los secretos de un host para compartirlo: contraseña vacía,
/// passphrase fuera. La ruta de clave se conserva (no es un secreto).
fn strip_secrets(host: &Host) -> Host {
    let mut clean = host.clone();
    clean.auth = match &host.auth {
        AuthMethod::Password { .. } => AuthMethod::Password {
            password: String::new(),
        },
        AuthMethod::Key { key_path, .. } => AuthMethod::Key {
            key_path: key_path.clone(),
            passphrase: None,
        },
    };
    clean
}

/// Exportación legible de hosts, pensada para compartir. Las contraseñas y
/// passphrases se omiten a propósito: un archivo compartible no debe llevar
/// secretos en texto plano. Las rutas de clave sí se conservan (no son
/// secretas, son rutas locales).
#[tauri::command]
pub fn hosts_export(state: State<'_, VaultManager>, target: String) -> Result<usize, String> {
    let hosts: Vec<Host> = state.with_data(|d| d.hosts.iter().map(strip_secrets).collect())?;
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

#[cfg(test)]
mod tests {
    use super::*;

    fn base(auth: AuthMethod) -> Host {
        Host {
            id: "1".into(),
            name: "srv".into(),
            hostname: "10.0.0.1".into(),
            port: 22,
            username: "root".into(),
            auth,
            tags: vec![],
            group: None,
            jump_host_id: None,
            login_commands: vec![],
        }
    }

    #[test]
    fn el_export_borra_la_contrasena() {
        let host = base(AuthMethod::Password {
            password: "super-secreta".into(),
        });
        let clean = strip_secrets(&host);
        match clean.auth {
            AuthMethod::Password { password } => assert!(
                password.is_empty(),
                "la contraseña NUNCA debe salir en un archivo compartible"
            ),
            _ => panic!("no debe cambiar el tipo de auth"),
        }
    }

    #[test]
    fn el_export_borra_la_passphrase_pero_conserva_la_ruta() {
        let host = base(AuthMethod::Key {
            key_path: "~/.ssh/id_ed25519".into(),
            passphrase: Some("frase-secreta".into()),
        });
        let clean = strip_secrets(&host);
        match clean.auth {
            AuthMethod::Key {
                key_path,
                passphrase,
            } => {
                assert_eq!(key_path, "~/.ssh/id_ed25519", "la ruta no es secreta");
                assert!(passphrase.is_none(), "la passphrase es secreta y se omite");
            }
            _ => panic!("no debe cambiar el tipo de auth"),
        }
    }

    #[test]
    fn el_json_exportado_no_contiene_el_secreto() {
        let host = base(AuthMethod::Password {
            password: "fuga-de-datos".into(),
        });
        let json = serde_json::to_string(&strip_secrets(&host)).unwrap();
        assert!(!json.contains("fuga-de-datos"));
    }
}
