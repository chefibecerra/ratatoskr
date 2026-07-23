use std::collections::HashMap;
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::hosts::Host;
use crate::ssh::connect_authenticated;

/// Reenvío de puertos, tres modos como OpenSSH:
/// - **local (-L)**: listener en 127.0.0.1:local_port → destino remoto:remote_port.
/// - **remote (-R)**: el servidor escucha en remote_port → destino local
///   remote_host:local_port (remote_host es aquí el destino EN NUESTRA máquina).
/// - **dynamic (-D)**: proxy SOCKS5 en 127.0.0.1:local_port; el destino lo elige
///   cada conexión.
#[derive(Default)]
pub struct TunnelState {
    tunnels: Mutex<HashMap<String, CancellationToken>>,
}

#[derive(Clone, Serialize)]
struct TunnelClosed {
    tunnel_id: String,
    reason: String,
}

fn io_err(msg: &str) -> std::io::Error {
    std::io::Error::new(std::io::ErrorKind::Other, msg.to_string())
}

/// Handshake SOCKS5 (sin autenticación, solo CONNECT). Devuelve el destino que
/// pide el cliente. Responde éxito de forma optimista antes de abrir el canal.
async fn socks5_target(inbound: &mut TcpStream) -> std::io::Result<(String, u16)> {
    // Saludo: [ver, nmethods, methods...]
    let mut head = [0u8; 2];
    inbound.read_exact(&mut head).await?;
    if head[0] != 0x05 {
        return Err(io_err("no es SOCKS5"));
    }
    let mut methods = vec![0u8; head[1] as usize];
    inbound.read_exact(&mut methods).await?;
    // "Sin autenticación requerida".
    inbound.write_all(&[0x05, 0x00]).await?;

    // Petición: [ver, cmd, rsv, atyp, addr..., port(2)]
    let mut req = [0u8; 4];
    inbound.read_exact(&mut req).await?;
    if req[1] != 0x01 {
        // Solo soportamos CONNECT.
        inbound
            .write_all(&[0x05, 0x07, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
            .await?;
        return Err(io_err("comando SOCKS no soportado"));
    }
    let host = match req[3] {
        0x01 => {
            let mut a = [0u8; 4];
            inbound.read_exact(&mut a).await?;
            std::net::Ipv4Addr::from(a).to_string()
        }
        0x03 => {
            let mut len = [0u8; 1];
            inbound.read_exact(&mut len).await?;
            let mut dom = vec![0u8; len[0] as usize];
            inbound.read_exact(&mut dom).await?;
            String::from_utf8_lossy(&dom).into_owned()
        }
        0x04 => {
            let mut a = [0u8; 16];
            inbound.read_exact(&mut a).await?;
            std::net::Ipv6Addr::from(a).to_string()
        }
        _ => {
            inbound
                .write_all(&[0x05, 0x08, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
                .await?;
            return Err(io_err("tipo de dirección SOCKS no soportado"));
        }
    };
    let mut port = [0u8; 2];
    inbound.read_exact(&mut port).await?;
    let port = u16::from_be_bytes(port);

    // Éxito (BND.ADDR 0.0.0.0:0).
    inbound
        .write_all(&[0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0])
        .await?;
    Ok((host, port))
}

#[tauri::command]
pub async fn tunnel_open(
    app: AppHandle,
    state: State<'_, TunnelState>,
    tunnel_id: String,
    kind: String,
    host: Host,
    local_port: u16,
    remote_host: String,
    remote_port: u16,
) -> Result<(), String> {
    match kind.as_str() {
        "remote" => open_remote(app, state, tunnel_id, host, local_port, remote_host, remote_port).await,
        "dynamic" => open_dynamic(app, state, tunnel_id, host, local_port).await,
        _ => open_local(app, state, tunnel_id, host, local_port, remote_host, remote_port).await,
    }
}

/// -L: listener local → canal direct-tcpip hacia el destino remoto.
async fn open_local(
    app: AppHandle,
    state: State<'_, TunnelState>,
    tunnel_id: String,
    host: Host,
    local_port: u16,
    remote_host: String,
    remote_port: u16,
) -> Result<(), String> {
    let listener = TcpListener::bind(("127.0.0.1", local_port))
        .await
        .map_err(|e| format!("no se pudo abrir el puerto {local_port}: {e}"))?;

    // La conexión SSH se establece una vez y se comparte entre todas las
    // conexiones que pasen por el túnel (incluye sus bastiones si los hay).
    let conn = Arc::new(connect_authenticated(&app, &host, 15).await?);

    let token = CancellationToken::new();
    state
        .tunnels
        .lock()
        .await
        .insert(tunnel_id.clone(), token.clone());

    tauri::async_runtime::spawn(async move {
        let reason = loop {
            tokio::select! {
                _ = token.cancelled() => break "cerrado por el usuario".to_string(),
                accepted = listener.accept() => {
                    let Ok((mut inbound, _)) = accepted else {
                        break "error al aceptar conexión local".to_string();
                    };
                    let conn = conn.clone();
                    let remote_host = remote_host.clone();
                    // Cada conexión local vive en su propia tarea.
                    tauri::async_runtime::spawn(async move {
                        let channel = match conn
                            .handle
                            .channel_open_direct_tcpip(remote_host, remote_port as u32, "127.0.0.1", 0)
                            .await
                        {
                            Ok(ch) => ch,
                            Err(_) => return,
                        };
                        let mut remote = channel.into_stream();
                        let _ = tokio::io::copy_bidirectional(&mut inbound, &mut remote).await;
                    });
                }
            }
        };

        emit_closed(&app, tunnel_id, reason).await;
    });

    Ok(())
}

/// -D: proxy SOCKS5 local; cada conexión abre un canal direct-tcpip al destino
/// que ella misma pide.
async fn open_dynamic(
    app: AppHandle,
    state: State<'_, TunnelState>,
    tunnel_id: String,
    host: Host,
    local_port: u16,
) -> Result<(), String> {
    let listener = TcpListener::bind(("127.0.0.1", local_port))
        .await
        .map_err(|e| format!("no se pudo abrir el puerto {local_port}: {e}"))?;

    let conn = Arc::new(connect_authenticated(&app, &host, 15).await?);

    let token = CancellationToken::new();
    state
        .tunnels
        .lock()
        .await
        .insert(tunnel_id.clone(), token.clone());

    tauri::async_runtime::spawn(async move {
        let reason = loop {
            tokio::select! {
                _ = token.cancelled() => break "cerrado por el usuario".to_string(),
                accepted = listener.accept() => {
                    let Ok((mut inbound, _)) = accepted else {
                        break "error al aceptar conexión local".to_string();
                    };
                    let conn = conn.clone();
                    tauri::async_runtime::spawn(async move {
                        let Ok((target_host, target_port)) = socks5_target(&mut inbound).await else {
                            return;
                        };
                        let channel = match conn
                            .handle
                            .channel_open_direct_tcpip(target_host, target_port as u32, "127.0.0.1", 0)
                            .await
                        {
                            Ok(ch) => ch,
                            Err(_) => return,
                        };
                        let mut remote = channel.into_stream();
                        let _ = tokio::io::copy_bidirectional(&mut inbound, &mut remote).await;
                    });
                }
            }
        };

        emit_closed(&app, tunnel_id, reason).await;
    });

    Ok(())
}

/// -R: el servidor escucha en remote_port y nos reenvía las conexiones; el
/// ClientHandler las puentea al destino local (remote_host:local_port).
async fn open_remote(
    app: AppHandle,
    state: State<'_, TunnelState>,
    tunnel_id: String,
    host: Host,
    local_port: u16,
    remote_host: String,
    remote_port: u16,
) -> Result<(), String> {
    let conn = connect_authenticated(&app, &host, 15).await?;

    // Destino local al que el handler puenteará los canales entrantes. Se fija
    // ANTES de pedir el reenvío para que ya esté listo cuando lleguen.
    *conn.forward_to.lock().unwrap() = Some((remote_host, local_port));

    conn.handle
        .tcpip_forward("127.0.0.1", remote_port as u32)
        .await
        .map_err(|e| format!("el servidor rechazó reenviar el puerto {remote_port}: {e}"))?;

    let token = CancellationToken::new();
    state
        .tunnels
        .lock()
        .await
        .insert(tunnel_id.clone(), token.clone());

    tauri::async_runtime::spawn(async move {
        // Mantener viva la conexión: su tarea interna recibe los canales del
        // servidor mientras el Handle exista.
        let conn = conn;
        token.cancelled().await;
        let _ = conn
            .handle
            .cancel_tcpip_forward("127.0.0.1", remote_port as u32)
            .await;
        emit_closed(&app, tunnel_id, "cerrado por el usuario".to_string()).await;
    });

    Ok(())
}

async fn emit_closed(app: &AppHandle, tunnel_id: String, reason: String) {
    app.state::<TunnelState>()
        .tunnels
        .lock()
        .await
        .remove(&tunnel_id);
    let _ = app.emit("tunnel-closed", TunnelClosed { tunnel_id, reason });
}

#[tauri::command]
pub async fn tunnel_close(state: State<'_, TunnelState>, tunnel_id: String) -> Result<(), String> {
    if let Some(token) = state.tunnels.lock().await.get(&tunnel_id) {
        token.cancel();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Valida el handshake SOCKS5 artesanal (-D) sobre un socket real de
    /// loopback: saludo sin-auth + CONNECT a un dominio, y comprueba que
    /// parseamos bien host y puerto y respondemos éxito.
    #[tokio::test]
    async fn socks5_parsea_connect_a_dominio() {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let addr = listener.local_addr().unwrap();

        let server = tokio::spawn(async move {
            let (mut sock, _) = listener.accept().await.unwrap();
            socks5_target(&mut sock).await.unwrap()
        });

        let mut client = TcpStream::connect(addr).await.unwrap();
        // Saludo: ver=5, 1 método, "sin autenticación" (0x00).
        client.write_all(&[0x05, 0x01, 0x00]).await.unwrap();
        let mut greet = [0u8; 2];
        client.read_exact(&mut greet).await.unwrap();
        assert_eq!(greet, [0x05, 0x00], "debe elegir 'sin autenticación'");

        // Petición CONNECT a "example.com":443 (atyp=dominio).
        let host = b"example.com";
        let mut req = vec![0x05, 0x01, 0x00, 0x03, host.len() as u8];
        req.extend_from_slice(host);
        req.extend_from_slice(&443u16.to_be_bytes());
        client.write_all(&req).await.unwrap();

        let mut reply = [0u8; 10];
        client.read_exact(&mut reply).await.unwrap();
        assert_eq!(reply[1], 0x00, "SOCKS debe responder éxito");

        let (h, p) = server.await.unwrap();
        assert_eq!(h, "example.com");
        assert_eq!(p, 443);
    }
}
