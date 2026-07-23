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

struct ClientHandler {
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

#[tauri::command]
pub async fn ssh_connect(
    app: AppHandle,
    state: State<'_, SshState>,
    session_id: String,
    host: Host,
    cols: u32,
    rows: u32,
    on_data: Channel<InvokeResponseBody>,
) -> Result<(), String> {
    let config = Arc::new(client::Config {
        keepalive_interval: Some(Duration::from_secs(15)),
        ..Default::default()
    });

    let rejection = Arc::new(StdMutex::new(None::<String>));
    let handler = ClientHandler {
        app: app.clone(),
        host_key: format!("{}:{}", host.hostname, host.port),
        rejection: rejection.clone(),
    };

    let mut handle = match client::connect(
        config,
        (host.hostname.as_str(), host.port),
        handler,
    )
    .await
    {
        Ok(handle) => handle,
        Err(e) => {
            // si el handler rechazó la clave, ese es el error real
            let msg = rejection
                .lock()
                .unwrap()
                .take()
                .unwrap_or_else(|| format!("conexión fallida: {e}"));
            crate::history::record(&app, &host, false, Some(msg.clone()));
            return Err(msg);
        }
    };

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
                // Muchos servidores (PAM) solo aceptan keyboard-interactive.
                keyboard_interactive(&mut handle, &host.username, password).await?
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
        let msg = "autenticación rechazada: revisa usuario y credenciales \
                   (el usuario distingue mayúsculas: root ≠ Root)"
            .to_string();
        crate::history::record(&app, &host, false, Some(msg.clone()));
        return Err(msg);
    }

    let mut channel = handle
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

    crate::history::record(&app, &host, true, None);

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
                        let _ = handle.disconnect(Disconnect::ByApplication, "", "").await;
                        break "cerrada por el usuario".to_string();
                    }
                },
                msg = channel.wait() => match msg {
                    Some(ChannelMsg::Data { data }) => {
                        let _ = on_data.send(InvokeResponseBody::Raw(data.to_vec()));
                    }
                    Some(ChannelMsg::ExtendedData { data, .. }) => {
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
