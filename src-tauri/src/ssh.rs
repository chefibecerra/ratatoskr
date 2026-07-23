use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex as StdMutex},
    time::Duration,
};

use russh::keys::{load_secret_key, ssh_key, PrivateKeyWithHashAlg};
use russh::{client, ChannelMsg, Disconnect};
use serde::Serialize;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::{mpsc, Mutex};

use crate::hosts::{AuthMethod, Host};

#[derive(Default)]
pub struct SshState {
    sessions: Mutex<HashMap<String, mpsc::Sender<SshOp>>>,
}

enum SshOp {
    Data(Vec<u8>),
    Resize(u32, u32),
    Close,
}

#[derive(Clone, Serialize)]
struct SessionClosed {
    session_id: String,
    reason: String,
}

pub struct ClientHandler {
    app: AppHandle,
    /// "hostname:puerto" para buscar en known_hosts
    host_key: String,
    /// motivo del rechazo, para construir un error legible tras el fallo
    rejection: Arc<StdMutex<Option<String>>>,
}

impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        use crate::known_hosts::{verify_and_store, Verification};

        match verify_and_store(&self.app, &self.host_key, server_public_key) {
            Ok(Verification::Trusted) => Ok(true),
            Ok(Verification::Mismatch { stored, presented }) => {
                *self.rejection.lock().unwrap() = Some(format!(
                    "La clave del servidor cambió. Guardada: {stored} · Recibida: {presented}. \
                     Si el cambio es legítimo, olvida el servidor en la sección Servidores."
                ));
                Ok(false)
            }
            Err(e) => {
                *self.rejection.lock().unwrap() =
                    Some(format!("No se pudo verificar la clave del servidor: {e}"));
                Ok(false)
            }
        }
    }
}

async fn keyboard_interactive(
    handle: &mut client::Handle<ClientHandler>,
    username: &str,
    password: &str,
) -> Result<bool, String> {
    use russh::client::KeyboardInteractiveAuthResponse as Kia;

    let mut response = handle
        .authenticate_keyboard_interactive_start(username, None)
        .await
        .map_err(|e| e.to_string())?;
    loop {
        match response {
            Kia::Success => return Ok(true),
            Kia::Failure { .. } => return Ok(false),
            Kia::InfoRequest { prompts, .. } => {
                // A cada prompt se responde con la contraseña del host.
                let answers = prompts.iter().map(|_| password.to_string()).collect();
                response = handle
                    .authenticate_keyboard_interactive_respond(answers)
                    .await
                    .map_err(|e| e.to_string())?;
            }
        }
    }
}

fn expand_tilde(path: &str) -> PathBuf {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = std::env::var_os("HOME") {
            return PathBuf::from(home).join(rest);
        }
    }
    PathBuf::from(path)
}

/// Conexión autenticada. Guarda los handles de los bastiones intermedios:
/// si se soltaran, los túneles subyacentes se cerrarían.
pub struct Connection {
    pub handle: client::Handle<ClientHandler>,
    #[allow(dead_code)]
    jumps: Vec<client::Handle<ClientHandler>>,
}

/// Construye la cadena de bastiones de un host siguiendo jump_host_id, del más
/// externo (la conexión directa) al más interno. Detecta ciclos. Función pura:
/// recibe la lista de hosts, sin tocar disco ni Tauri.
fn resolve_jump_chain(all_hosts: &[Host], target: &Host) -> Result<Vec<Host>, String> {
    let mut hops: Vec<Host> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut cursor = target.clone();
    while let Some(jid) = cursor.jump_host_id.clone() {
        if !seen.insert(jid.clone()) {
            return Err("Ciclo de jump hosts detectado.".into());
        }
        let jump = all_hosts
            .iter()
            .find(|h| h.id == jid)
            .cloned()
            .ok_or_else(|| "El jump host configurado ya no existe.".to_string())?;
        hops.push(jump.clone());
        cursor = jump;
    }
    hops.reverse();
    Ok(hops)
}

async fn authenticate(
    handle: &mut client::Handle<ClientHandler>,
    host: &Host,
) -> Result<(), String> {
    let authenticated = match &host.auth {
        AuthMethod::Password { password } => {
            let direct = handle
                .authenticate_password(&host.username, password)
                .await
                .map_err(|e| e.to_string())?
                .success();
            if direct {
                true
            } else {
                keyboard_interactive(handle, &host.username, password).await?
            }
        }
        AuthMethod::Key {
            key_path,
            passphrase,
        } => {
            let key = load_secret_key(expand_tilde(key_path), passphrase.as_deref())
                .map_err(|e| format!("no se pudo cargar la clave: {e}"))?;
            let best_hash = handle
                .best_supported_rsa_hash()
                .await
                .map_err(|e| e.to_string())?
                .flatten();
            handle
                .authenticate_publickey(
                    &host.username,
                    PrivateKeyWithHashAlg::new(Arc::new(key), best_hash),
                )
                .await
                .map_err(|e| e.to_string())?
                .success()
        }
    };
    if !authenticated {
        return Err(format!(
            "autenticación rechazada en {}: revisa usuario y credenciales \
             (el usuario distingue mayúsculas: root ≠ Root)",
            host.name
        ));
    }
    Ok(())
}

/// Conecta a un salto: directo si `via` es None, o tunelizado a través del
/// handle anterior (bastión) abriendo un canal direct-tcpip.
async fn connect_hop(
    app: &AppHandle,
    config: Arc<client::Config>,
    host: &Host,
    via: Option<&client::Handle<ClientHandler>>,
) -> Result<client::Handle<ClientHandler>, String> {
    let rejection = Arc::new(StdMutex::new(None::<String>));
    let handler = ClientHandler {
        app: app.clone(),
        host_key: format!("{}:{}", host.hostname, host.port),
        rejection: rejection.clone(),
    };

    let mut handle = match via {
        Some(prev) => {
            let channel = prev
                .channel_open_direct_tcpip(
                    host.hostname.clone(),
                    host.port as u32,
                    "127.0.0.1",
                    0,
                )
                .await
                .map_err(|e| format!("no se pudo tunelizar hasta {}: {e}", host.name))?;
            match client::connect_stream(config, channel.into_stream(), handler).await {
                Ok(h) => h,
                Err(e) => {
                    return Err(rejection
                        .lock()
                        .unwrap()
                        .take()
                        .unwrap_or_else(|| format!("conexión fallida a {}: {e}", host.name)))
                }
            }
        }
        None => match client::connect(config, (host.hostname.as_str(), host.port), handler).await {
            Ok(h) => h,
            Err(e) => {
                return Err(rejection
                    .lock()
                    .unwrap()
                    .take()
                    .unwrap_or_else(|| format!("conexión fallida a {}: {e}", host.name)))
            }
        },
    };

    authenticate(&mut handle, host).await?;
    Ok(handle)
}

/// Conexión + autenticación + verificación TOFU, con soporte de bastiones
/// (ProxyJump) en cadena. Compartida por el terminal, SFTP y los túneles.
pub async fn connect_authenticated(
    app: &AppHandle,
    host: &Host,
    keepalive_secs: u32,
) -> Result<Connection, String> {
    let config = Arc::new(client::Config {
        keepalive_interval: (keepalive_secs > 0)
            .then(|| Duration::from_secs(keepalive_secs as u64)),
        ..Default::default()
    });

    // Cadena de bastiones, del más externo (conexión directa) al más interno.
    let all_hosts = app
        .state::<crate::vault::VaultManager>()
        .with_data(|d| d.hosts.clone())
        .unwrap_or_default();
    let hops = resolve_jump_chain(&all_hosts, host)?;

    let mut jumps: Vec<client::Handle<ClientHandler>> = Vec::new();
    for hop in &hops {
        let handle = connect_hop(app, config.clone(), hop, jumps.last()).await?;
        jumps.push(handle);
    }

    let handle = connect_hop(app, config.clone(), host, jumps.last()).await?;
    Ok(Connection { handle, jumps })
}

#[tauri::command]
pub async fn ssh_connect(
    app: AppHandle,
    state: State<'_, SshState>,
    session_id: String,
    host: Host,
    cols: u32,
    rows: u32,
    keepalive_secs: u32,
    record_history: bool,
    record_log: bool,
    on_data: Channel<InvokeResponseBody>,
) -> Result<(), String> {
    let conn = match connect_authenticated(&app, &host, keepalive_secs).await {
        Ok(conn) => conn,
        Err(msg) => {
            if record_history {
                crate::history::record(&app, &host, false, Some(msg.clone()));
            }
            return Err(msg);
        }
    };

    let mut channel = conn
        .handle
        .channel_open_session()
        .await
        .map_err(|e| e.to_string())?;

    // Como OpenSSH: locale y truecolor viajan con la sesión. Si el sshd no
    // los acepta en AcceptEnv, los ignora sin romper nada (want_reply=false).
    let lang = std::env::var("LANG").unwrap_or_else(|_| "en_US.UTF-8".into());
    let _ = channel.set_env(false, "LANG", lang).await;
    let _ = channel.set_env(false, "COLORTERM", "truecolor").await;

    channel
        .request_pty(false, "xterm-256color", cols, rows, 0, 0, &[])
        .await
        .map_err(|e| e.to_string())?;
    channel
        .request_shell(true)
        .await
        .map_err(|e| e.to_string())?;

    // Scripts de login: se envían como si el usuario los tecleara al abrir.
    for cmd in &host.login_commands {
        let _ = channel.data(format!("{cmd}\n").as_bytes()).await;
    }

    if record_history {
        crate::history::record(&app, &host, true, None);
    }

    let started_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let mut log = record_log
        .then(|| crate::session_log::SessionLog::create(&app, &host.name, started_ms))
        .flatten();

    let (tx, mut rx) = mpsc::channel::<SshOp>(64);
    state.sessions.lock().await.insert(session_id.clone(), tx);

    tauri::async_runtime::spawn(async move {
        let reason = loop {
            tokio::select! {
                op = rx.recv() => match op {
                    Some(SshOp::Data(bytes)) => {
                        if channel.data(&bytes[..]).await.is_err() {
                            break "error de escritura en el canal".to_string();
                        }
                    }
                    Some(SshOp::Resize(c, r)) => {
                        let _ = channel.window_change(c, r, 0, 0).await;
                    }
                    Some(SshOp::Close) | None => {
                        let _ = conn.handle.disconnect(Disconnect::ByApplication, "", "").await;
                        break "cerrada por el usuario".to_string();
                    }
                },
                msg = channel.wait() => match msg {
                    Some(ChannelMsg::Data { data }) => {
                        if let Some(log) = log.as_mut() {
                            log.write(&data);
                        }
                        let _ = on_data.send(InvokeResponseBody::Raw(data.to_vec()));
                    }
                    Some(ChannelMsg::ExtendedData { data, .. }) => {
                        if let Some(log) = log.as_mut() {
                            log.write(&data);
                        }
                        let _ = on_data.send(InvokeResponseBody::Raw(data.to_vec()));
                    }
                    Some(ChannelMsg::ExitStatus { exit_status }) => {
                        break format!("el shell terminó (código {exit_status})");
                    }
                    Some(_) => {}
                    None => break "conexión cerrada por el servidor".to_string(),
                },
            }
        };

        app.state::<SshState>()
            .sessions
            .lock()
            .await
            .remove(&session_id);
        let _ = app.emit("ssh-session-closed", SessionClosed { session_id, reason });
    });

    Ok(())
}

#[tauri::command]
pub async fn ssh_write(
    state: State<'_, SshState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let sessions = state.sessions.lock().await;
    let tx = sessions.get(&session_id).ok_or("sesión no encontrada")?;
    tx.send(SshOp::Data(data.into_bytes()))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ssh_resize(
    state: State<'_, SshState>,
    session_id: String,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    let sessions = state.sessions.lock().await;
    let tx = sessions.get(&session_id).ok_or("sesión no encontrada")?;
    tx.send(SshOp::Resize(cols, rows))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ssh_disconnect(state: State<'_, SshState>, session_id: String) -> Result<(), String> {
    let sessions = state.sessions.lock().await;
    let Some(tx) = sessions.get(&session_id) else {
        return Ok(());
    };
    tx.send(SshOp::Close).await.map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::hosts::AuthMethod;

    fn host(id: &str, jump: Option<&str>) -> Host {
        Host {
            id: id.into(),
            name: id.into(),
            hostname: format!("{id}.example"),
            port: 22,
            username: "root".into(),
            auth: AuthMethod::Password { password: String::new() },
            tags: vec![],
            group: None,
            jump_host_id: jump.map(|s| s.into()),
            login_commands: vec![],
        }
    }

    #[test]
    fn sin_bastion_la_cadena_esta_vacia() {
        let t = host("target", None);
        let chain = resolve_jump_chain(&[t.clone()], &t).unwrap();
        assert!(chain.is_empty());
    }

    #[test]
    fn un_bastion() {
        let b = host("bastion", None);
        let t = host("target", Some("bastion"));
        let chain = resolve_jump_chain(&[b.clone(), t.clone()], &t).unwrap();
        assert_eq!(chain.len(), 1);
        assert_eq!(chain[0].id, "bastion");
    }

    #[test]
    fn cadena_ordenada_de_fuera_hacia_dentro() {
        // target -> b1 -> b2 ; conectamos primero b2 (directo), luego b1, luego target
        let b2 = host("b2", None);
        let b1 = host("b1", Some("b2"));
        let t = host("target", Some("b1"));
        let chain = resolve_jump_chain(&[b2, b1, t.clone()], &t).unwrap();
        assert_eq!(chain.iter().map(|h| h.id.as_str()).collect::<Vec<_>>(), ["b2", "b1"]);
    }

    #[test]
    fn detecta_ciclo() {
        // a -> b -> a
        let a = host("a", Some("b"));
        let b = host("b", Some("a"));
        let err = resolve_jump_chain(&[a.clone(), b], &a).unwrap_err();
        assert!(err.contains("Ciclo"));
    }

    #[test]
    fn bastion_inexistente_es_error() {
        let t = host("target", Some("fantasma"));
        let err = resolve_jump_chain(&[t.clone()], &t).unwrap_err();
        assert!(err.contains("ya no existe"));
    }
}
