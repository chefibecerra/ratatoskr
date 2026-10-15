//! Conexión SSH con PTY interactivo, autenticación por contraseña o clave, y
//! cadena de jump hosts (bastiones).
//!
//! Concurrencia: tras abrir el canal y pedir PTY + shell, lo partimos con
//! `split()`. El `ChannelWriteHalf` es `Send + Sync` con métodos `&self`, así que
//! lo guardamos en un `Arc` para escribir/redimensionar; el `ChannelReadHalf` va a
//! una task que hace `wait()` en bucle y reenvía la salida al front.
//!
//! Jump hosts: se conecta al primer bastión, se abre un canal `direct-tcpip` hacia
//! el siguiente salto y se levanta una nueva sesión SSH con `connect_stream` sobre
//! ese túnel. Todos los handles intermedios se guardan vivos en la sesión.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use russh::client::{self, Handle, Msg};
use russh::keys::{HashAlg, PrivateKey, PrivateKeyWithHashAlg, PublicKeyOrCertificate};
use russh::{ChannelMsg, ChannelWriteHalf};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

/// Handler del cliente SSH.
///
/// NOTA: `check_server_key` acepta cualquier clave (sin verificación). La
/// confianza de host (TOFU / known_hosts) es de un incremento posterior.
struct Client;

impl client::Handler for Client {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &PublicKeyOrCertificate,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

/// Datos de un salto (bastión) resueltos por el front.
#[derive(Deserialize)]
pub struct JumpSpec {
    host: String,
    port: u16,
    user: String,
    #[serde(default)]
    password: Option<String>,
    #[serde(default)]
    private_key: Option<String>,
    #[serde(default)]
    private_key_path: Option<String>,
    #[serde(default)]
    passphrase: Option<String>,
}

/// Una sesión viva: el extremo de escritura compartido, los bastiones de la
/// cadena (mantenerlos vivos evita que se cierre el túnel) y el handle del destino
/// (compartido en `Arc` para poder abrir subsistemas como SFTP).
struct Session {
    writer: Arc<ChannelWriteHalf<Msg>>,
    _bastions: Vec<Handle<Client>>,
    target: Arc<Handle<Client>>,
}

#[derive(Default)]
pub struct SshState {
    sessions: Mutex<HashMap<String, Session>>,
    counter: AtomicU64,
}

#[derive(Clone, Serialize)]
struct DataPayload {
    id: String,
    data: Vec<u8>,
}

#[derive(Clone, Serialize)]
struct ClosedPayload {
    id: String,
}

/// Autentica un handle por clave privada (si viene) o por contraseña.
async fn authenticate(
    handle: &mut Handle<Client>,
    user: &str,
    password: Option<String>,
    private_key: Option<String>,
    private_key_path: Option<String>,
    passphrase: Option<String>,
) -> Result<(), String> {
    let material = crate::keys::read_key_material(private_key, private_key_path)?;
    let auth = if let Some(pk) = material {
        let mut key = PrivateKey::from_openssh(pk.trim())
            .map_err(|e| format!("no se pudo leer la clave (¿formato OpenSSH?): {e}"))?;
        if key.is_encrypted() {
            let pass = passphrase
                .filter(|p| !p.is_empty())
                .ok_or("la clave está cifrada: falta la passphrase")?;
            key = key
                .decrypt(pass)
                .map_err(|_| "passphrase incorrecta para la clave")?;
        }
        let hash = if key.algorithm().is_rsa() {
            handle.best_supported_rsa_hash().await.ok().flatten().flatten()
        } else {
            None::<HashAlg>
        };
        handle
            .authenticate_publickey(
                user.to_string(),
                PrivateKeyWithHashAlg::new(Arc::new(key), hash),
            )
            .await
            .map_err(|e| format!("error de autenticación por clave: {e}"))?
    } else {
        handle
            .authenticate_password(user.to_string(), password.unwrap_or_default())
            .await
            .map_err(|e| format!("error de autenticación: {e}"))?
    };
    if !auth.success() {
        return Err("autenticación rechazada (credenciales inválidas)".into());
    }
    Ok(())
}

/// Abre un túnel `direct-tcpip` desde `handle` hacia (host, port) y levanta una
/// nueva sesión SSH sobre él.
async fn hop_through(
    config: Arc<client::Config>,
    handle: &Handle<Client>,
    host: &str,
    port: u16,
) -> Result<Handle<Client>, String> {
    let channel = handle
        .channel_open_direct_tcpip(host.to_string(), port as u32, "127.0.0.1", 0)
        .await
        .map_err(|e| format!("no se pudo abrir el túnel al salto: {e}"))?;
    client::connect_stream(config, channel.into_stream(), Client)
        .await
        .map_err(|e| format!("no se pudo establecer SSH a través del salto: {e}"))
}

/// Conecta (con cadena de jump hosts opcional), abre un shell con PTY y empieza a
/// bombear salida. Devuelve el id de sesión.
#[tauri::command]
pub async fn ssh_connect(
    app: AppHandle,
    state: State<'_, SshState>,
    host: String,
    port: u16,
    user: String,
    password: Option<String>,
    private_key: Option<String>,
    private_key_path: Option<String>,
    passphrase: Option<String>,
    jumps: Option<Vec<JumpSpec>>,
    cols: u32,
    rows: u32,
) -> Result<String, String> {
    let config = Arc::new(client::Config::default());
    let hops = jumps.unwrap_or_default();

    // Toda la cadena de conexión, con un límite de tiempo para no colgarnos
    // indefinidamente contra hosts inalcanzables.
    let build = async move {
        let mut chain: Vec<Handle<Client>> = Vec::new();
        let current = if hops.is_empty() {
            let mut h = client::connect(config.clone(), (host.as_str(), port), Client)
                .await
                .map_err(|e| format!("no se pudo conectar: {e}"))?;
            authenticate(&mut h, &user, password, private_key, private_key_path, passphrase)
                .await?;
            h
        } else {
            let first = &hops[0];
            let mut h = client::connect(config.clone(), (first.host.as_str(), first.port), Client)
                .await
                .map_err(|e| format!("no se pudo conectar al bastión: {e}"))?;
            authenticate(
                &mut h,
                &first.user,
                first.password.clone(),
                first.private_key.clone(),
                first.private_key_path.clone(),
                first.passphrase.clone(),
            )
            .await?;

            // Saltos intermedios: cada uno a través del anterior.
            for next in &hops[1..] {
                let mut nh = hop_through(config.clone(), &h, &next.host, next.port).await?;
                authenticate(
                    &mut nh,
                    &next.user,
                    next.password.clone(),
                    next.private_key.clone(),
                    next.private_key_path.clone(),
                    next.passphrase.clone(),
                )
                .await?;
                chain.push(h);
                h = nh;
            }

            // Último salto: del bastión final al destino real.
            let mut target = hop_through(config.clone(), &h, &host, port).await?;
            authenticate(&mut target, &user, password, private_key, private_key_path, passphrase)
                .await?;
            chain.push(h);
            target
        };
        Ok::<(Handle<Client>, Vec<Handle<Client>>), String>((current, chain))
    };

    let (current, chain) = tokio::time::timeout(std::time::Duration::from_secs(20), build)
        .await
        .map_err(|_| "tiempo de conexión agotado (20 s): el host no responde".to_string())??;

    let channel = current
        .channel_open_session()
        .await
        .map_err(|e| format!("no se pudo abrir el canal: {e}"))?;
    channel
        .request_pty(false, "xterm-256color", cols, rows, 0, 0, &[])
        .await
        .map_err(|e| format!("falló la petición de PTY: {e}"))?;
    channel
        .request_shell(false)
        .await
        .map_err(|e| format!("falló la petición de shell: {e}"))?;

    let (mut read_half, write_half) = channel.split();
    let target = Arc::new(current);

    let id = format!("s{}", state.counter.fetch_add(1, Ordering::Relaxed));

    // Task lectora: bombea la salida del canal hacia el front.
    let app_reader = app.clone();
    let id_reader = id.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            match read_half.wait().await {
                Some(ChannelMsg::Data { data }) => {
                    let _ = app_reader.emit(
                        "ssh:data",
                        DataPayload {
                            id: id_reader.clone(),
                            data: data.to_vec(),
                        },
                    );
                }
                Some(ChannelMsg::ExtendedData { data, .. }) => {
                    let _ = app_reader.emit(
                        "ssh:data",
                        DataPayload {
                            id: id_reader.clone(),
                            data: data.to_vec(),
                        },
                    );
                }
                Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => break,
                _ => {}
            }
        }
        let _ = app_reader.emit("ssh:closed", ClosedPayload { id: id_reader });
    });

    state.sessions.lock().unwrap().insert(
        id.clone(),
        Session {
            writer: Arc::new(write_half),
            _bastions: chain,
            target,
        },
    );

    Ok(id)
}

/// Abre un subsistema SFTP sobre el canal del destino de una sesión viva.
pub async fn open_sftp(
    state: &SshState,
    id: &str,
) -> Result<russh_sftp::client::SftpSession, String> {
    let target = {
        let sessions = state.sessions.lock().unwrap();
        sessions.get(id).map(|s| s.target.clone())
    };
    let target = target.ok_or("sesión inexistente")?;
    let channel = target
        .channel_open_session()
        .await
        .map_err(|e| format!("no se pudo abrir el canal SFTP: {e}"))?;
    channel
        .request_subsystem(true, "sftp")
        .await
        .map_err(|e| format!("no se pudo iniciar el subsistema SFTP: {e}"))?;
    russh_sftp::client::SftpSession::new(channel.into_stream())
        .await
        .map_err(|e| format!("error al iniciar SFTP: {e}"))
}

/// Envía tecleo del front al canal SSH.
#[tauri::command]
pub async fn ssh_write(
    state: State<'_, SshState>,
    id: String,
    data: String,
) -> Result<(), String> {
    let writer = state
        .sessions
        .lock()
        .unwrap()
        .get(&id)
        .map(|s| s.writer.clone());
    let writer = writer.ok_or("sesión inexistente")?;
    writer
        .data_bytes(data.into_bytes())
        .await
        .map_err(|e| format!("error al escribir: {e}"))
}

/// Informa al servidor del nuevo tamaño de la ventana del terminal.
#[tauri::command]
pub async fn ssh_resize(
    state: State<'_, SshState>,
    id: String,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    let writer = state
        .sessions
        .lock()
        .unwrap()
        .get(&id)
        .map(|s| s.writer.clone());
    let writer = writer.ok_or("sesión inexistente")?;
    writer
        .window_change(cols, rows, 0, 0)
        .await
        .map_err(|e| format!("error al redimensionar: {e}"))
}

/// Cierra la sesión: al quitarla del mapa se liberan writer y handles, la cadena
/// se cae y la task lectora termina sola.
#[tauri::command]
pub fn ssh_disconnect(state: State<'_, SshState>, id: String) -> Result<(), String> {
    state.sessions.lock().unwrap().remove(&id);
    Ok(())
}
