use std::collections::HashMap;
use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::hosts::Host;
use crate::ssh::connect_authenticated;

/// Reenvío de puertos local (-L): un listener en 127.0.0.1:local_port cuya
/// conexión entrante se tuneliza a remote_host:remote_port por el canal SSH.
#[derive(Default)]
pub struct TunnelState {
    tunnels: Mutex<HashMap<String, CancellationToken>>,
}

#[derive(Clone, Serialize)]
struct TunnelClosed {
    tunnel_id: String,
    reason: String,
}

#[tauri::command]
pub async fn tunnel_open(
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
                            .channel_open_direct_tcpip(
                                remote_host,
                                remote_port as u32,
                                "127.0.0.1",
                                0,
                            )
                            .await
                        {
                            Ok(ch) => ch,
                            Err(_) => return,
                        };
                        let mut remote = channel.into_stream();
                        // Puente bidireccional; termina cuando cualquier lado cierra.
                        let _ = tokio::io::copy_bidirectional(&mut inbound, &mut remote).await;
                    });
                }
            }
        };

        app.state::<TunnelState>()
            .tunnels
            .lock()
            .await
            .remove(&tunnel_id);
        let _ = app.emit("tunnel-closed", TunnelClosed { tunnel_id, reason });
    });

    Ok(())
}

#[tauri::command]
pub async fn tunnel_close(
    state: State<'_, TunnelState>,
    tunnel_id: String,
) -> Result<(), String> {
    if let Some(token) = state.tunnels.lock().await.get(&tunnel_id) {
        token.cancel();
    }
    Ok(())
}
