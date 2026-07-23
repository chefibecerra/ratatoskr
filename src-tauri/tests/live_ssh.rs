//! Test de integración contra un sshd REAL (Docker), no solo compilación.
//!
//! Ejercita las MISMAS llamadas de russh que usa la app: auth por contraseña,
//! exec, direct-tcpip (túnel -L / -D) y tcpip_forward + forwarded-tcpip (-R).
//!
//! Requiere el contenedor de pruebas escuchando en 127.0.0.1:2222:
//!   docker run -d --name ratatoskr-sshd -p 2222:22 ratatoskr-sshd
//! Se ejecuta a propósito (ignorado por defecto para no exigir Docker en CI):
//!   cargo test --test live_ssh -- --ignored --nocapture

use std::sync::Arc;

use russh::client;
use russh_sftp::client::SftpSession;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const ADDR: (&str, u16) = ("127.0.0.1", 2222);
const BASTION: (&str, u16) = ("127.0.0.1", 2223);
const USER: &str = "tester";
const PASS: &str = "testpass123";

/// Handler permisivo: acepta cualquier clave de servidor (es un test local).
struct Trusting;

impl client::Handler for Trusting {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _key: &russh::keys::ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

/// Handler que responde a los canales entrantes de un túnel remoto (-R) con una
/// respuesta HTTP fija. Igual que hace la app, pero con un cuerpo de marcador.
struct RemoteForward;

impl client::Handler for RemoteForward {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _key: &russh::keys::ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }

    async fn server_channel_open_forwarded_tcpip(
        &mut self,
        channel: russh::Channel<client::Msg>,
        _connected_address: &str,
        _connected_port: u32,
        _originator_address: &str,
        _originator_port: u32,
        reply: client::ChannelOpenHandle,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        reply.accept().await;
        tokio::spawn(async move {
            let mut stream = channel.into_stream();
            // consumir la petición del cliente (curl) y responder
            let mut scratch = [0u8; 512];
            let _ = stream.read(&mut scratch).await;
            let body = "rat-forward-ok";
            let resp = format!(
                "HTTP/1.0 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = stream.write_all(resp.as_bytes()).await;
            let _ = stream.flush().await;
        });
        Ok(())
    }
}

/// Handler que captura la huella SHA256 de la clave del servidor, como hace el
/// TOFU de la app (known_hosts::verify_and_store).
struct CaptureKey(Arc<std::sync::Mutex<Option<String>>>);

impl client::Handler for CaptureKey {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        key: &russh::keys::ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        let fp = key
            .fingerprint(russh::keys::ssh_key::HashAlg::Sha256)
            .to_string();
        *self.0.lock().unwrap() = Some(fp);
        Ok(true)
    }
}

/// Handler que puentea los canales de reenvío de agente (-A) al ssh-agent
/// local. Igual que hace la app en producción.
struct AgentBridge;

impl client::Handler for AgentBridge {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _key: &russh::keys::ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }

    async fn server_channel_open_agent_forward(
        &mut self,
        channel: russh::Channel<client::Msg>,
        reply: client::ChannelOpenHandle,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        reply.accept().await;
        if let Some(sock) = std::env::var_os("SSH_AUTH_SOCK") {
            tokio::spawn(async move {
                let mut stream = channel.into_stream();
                if let Ok(mut agent) = tokio::net::UnixStream::connect(&sock).await {
                    let _ = tokio::io::copy_bidirectional(&mut stream, &mut agent).await;
                }
            });
        }
        Ok(())
    }
}

async fn connect<H: client::Handler + 'static>(handler: H) -> client::Handle<H> {
    let config = Arc::new(client::Config::default());
    let mut handle = client::connect(config, ADDR, handler)
        .await
        .expect("conectar al contenedor sshd (¿está corriendo en :2222?)");
    let ok = handle
        .authenticate_password(USER, PASS)
        .await
        .expect("llamada de auth")
        .success();
    assert!(ok, "la autenticación por contraseña debería funcionar");
    handle
}

/// Escribe un archivo remoto igual que sftp.rs: create (CREATE|TRUNCATE|WRITE)
/// + write_all + cierre limpio.
async fn write_remote(sftp: &SftpSession, path: &str, data: &[u8]) {
    let mut file = sftp.create(path).await.unwrap();
    file.write_all(data).await.unwrap();
    file.flush().await.unwrap();
    file.shutdown().await.unwrap();
}

/// Lee un canal (exec) hasta el cierre y devuelve su salida como texto.
async fn drain(channel: &mut russh::Channel<client::Msg>) -> String {
    let mut out = Vec::new();
    while let Some(msg) = channel.wait().await {
        match msg {
            russh::ChannelMsg::Data { data } => out.extend_from_slice(&data),
            russh::ChannelMsg::Close => break,
            _ => {}
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[tokio::test]
#[ignore = "requiere el contenedor sshd en :2222"]
async fn auth_password_y_exec() {
    let handle = connect(Trusting).await;
    let mut ch = handle.channel_open_session().await.unwrap();
    ch.exec(true, "echo ratatoskr-vive").await.unwrap();
    let out = drain(&mut ch).await;
    assert!(out.contains("ratatoskr-vive"), "salida de exec: {out:?}");
}

#[tokio::test]
#[ignore = "requiere el contenedor sshd en :2222"]
async fn tunel_local_direct_tcpip() {
    // Misma llamada que open_local / open_dynamic: un canal directo al servicio
    // HTTP interno del contenedor (127.0.0.1:8000).
    let handle = connect(Trusting).await;
    let channel = handle
        .channel_open_direct_tcpip("127.0.0.1", 8000, "127.0.0.1", 0)
        .await
        .unwrap();
    let mut stream = channel.into_stream();
    stream
        .write_all(b"GET / HTTP/1.0\r\nHost: localhost\r\n\r\n")
        .await
        .unwrap();
    let mut buf = vec![0u8; 1024];
    let n = stream.read(&mut buf).await.unwrap();
    let resp = String::from_utf8_lossy(&buf[..n]);
    assert!(resp.contains("200"), "respuesta HTTP por -L: {resp:?}");
}

#[tokio::test]
#[ignore = "requiere el contenedor sshd en :2222"]
async fn tunel_remoto_tcpip_forward() {
    // Conexión que pide el reenvío remoto y atiende los canales entrantes.
    let forwarder = connect(RemoteForward).await;
    forwarder
        .tcpip_forward("127.0.0.1", 9001)
        .await
        .expect("el servidor debería aceptar tcpip_forward");

    // Desde DENTRO del contenedor, curl al puerto reenviado: debe llegar a
    // nuestro handler y devolver el marcador.
    let driver = connect(Trusting).await;
    let mut ch = driver.channel_open_session().await.unwrap();
    ch.exec(true, "curl -s --max-time 5 http://127.0.0.1:9001/")
        .await
        .unwrap();
    let out = drain(&mut ch).await;
    assert!(out.contains("rat-forward-ok"), "cuerpo por -R: {out:?}");
}

#[tokio::test]
#[ignore = "requiere el contenedor sshd en :2222"]
async fn sftp_ciclo_completo() {
    // Mismo flujo que sftp.rs: abrir subsistema SFTP con russh-sftp y ejercitar
    // escribir, leer, listar, crear carpeta, renombrar y borrar.
    let handle = connect(Trusting).await;
    let channel = handle.channel_open_session().await.unwrap();
    channel.request_subsystem(true, "sftp").await.unwrap();
    let sftp = SftpSession::new(channel.into_stream()).await.unwrap();

    let dir = "/home/tester";
    let file = "/home/tester/rat_sftp.txt";
    let content = "contenido de prueba Ratatoskr SFTP, algo largo\n";

    // Crear archivo NUEVO + leer (como sftp_write_text / sftp_read_text). Debe
    // usar create (CREATE|TRUNCATE|WRITE); con el write() pelado daría NoSuchFile.
    write_remote(&sftp, file, content.as_bytes()).await;
    let back = sftp.read(file).await.unwrap();
    assert_eq!(
        String::from_utf8_lossy(&back),
        content,
        "leer tras crear debe devolver lo mismo"
    );

    // TRUNCATE: reescribir con menos contenido no debe dejar restos del anterior.
    let corto = "corto\n";
    write_remote(&sftp, file, corto.as_bytes()).await;
    let back_corto = sftp.read(file).await.unwrap();
    assert_eq!(
        String::from_utf8_lossy(&back_corto),
        corto,
        "reescribir más corto debe truncar, sin basura al final"
    );

    // read_dir lista el archivo (sftp_list)
    let listado: Vec<String> = sftp
        .read_dir(dir)
        .await
        .unwrap()
        .map(|e| e.file_name())
        .collect();
    assert!(
        listado.iter().any(|n| n == "rat_sftp.txt"),
        "read_dir debe listar el archivo: {listado:?}"
    );

    // create_dir (sftp_mkdir)
    let subdir = "/home/tester/rat_dir";
    sftp.create_dir(subdir).await.unwrap();

    // rename (sftp_rename)
    let renamed = "/home/tester/rat_sftp_renombrado.txt";
    sftp.rename(file, renamed).await.unwrap();
    let tras_rename: Vec<String> = sftp
        .read_dir(dir)
        .await
        .unwrap()
        .map(|e| e.file_name())
        .collect();
    assert!(
        tras_rename.iter().any(|n| n == "rat_sftp_renombrado.txt")
            && !tras_rename.iter().any(|n| n == "rat_sftp.txt"),
        "rename debe mover el archivo: {tras_rename:?}"
    );

    // remove_file + remove_dir (sftp_remove)
    sftp.remove_file(renamed).await.unwrap();
    sftp.remove_dir(subdir).await.unwrap();
    let final_list: Vec<String> = sftp
        .read_dir(dir)
        .await
        .unwrap()
        .map(|e| e.file_name())
        .collect();
    assert!(
        !final_list
            .iter()
            .any(|n| n == "rat_sftp_renombrado.txt" || n == "rat_dir"),
        "tras borrar no debe quedar rastro: {final_list:?}"
    );
}

#[tokio::test]
#[ignore = "requiere el contenedor sshd en :2222 y un ssh-agent con claves"]
async fn reenvio_de_agente() {
    // Pide reenvío del agente sobre la sesión y luego, dentro del contenedor,
    // `ssh-add -l` habla con nuestro agente local a través del puente.
    let handle = connect(AgentBridge).await;
    let mut ch = handle.channel_open_session().await.unwrap();
    ch.agent_forward(true).await.unwrap();
    ch.exec(true, "ssh-add -l 2>&1 || true").await.unwrap();
    let out = drain(&mut ch).await;
    assert!(
        out.contains("SHA256") || out.contains("ED25519") || out.contains("RSA"),
        "ssh-add -l a través del agente reenviado debería listar claves: {out:?}"
    );
}

#[tokio::test]
#[ignore = "requiere el contenedor sshd en :2222"]
async fn clave_del_servidor_estable_sha256() {
    // La clave que ve check_server_key debe ser real, con formato SHA256:… y
    // estable entre conexiones — es el cimiento sobre el que decide el TOFU.
    async fn huella() -> String {
        let capturada = Arc::new(std::sync::Mutex::new(None));
        let config = Arc::new(client::Config::default());
        // check_server_key se dispara durante el handshake, antes de auth.
        let _handle = client::connect(config, ADDR, CaptureKey(capturada.clone()))
            .await
            .expect("conectar al contenedor");
        let fp = capturada.lock().unwrap().clone();
        fp.expect("check_server_key debería haber capturado la huella")
    }

    let a = huella().await;
    let b = huella().await;
    assert!(a.starts_with("SHA256:"), "formato de huella inesperado: {a}");
    assert_eq!(
        a, b,
        "la clave del servidor debe ser idéntica entre conexiones (base del TOFU)"
    );
}

#[tokio::test]
#[ignore = "requiere rat-bastion (:2223) y rat-target en la red docker rattest"]
async fn jump_host_a_traves_de_bastion() {
    // Replica connect_hop(via=Some(bastión)): conectar al bastión, abrir un
    // canal directo a un destino SOLO alcanzable por la red interna, y hacer
    // SSH sobre ese canal.
    let config = Arc::new(client::Config::default());

    // 1) bastión
    let mut bastion = client::connect(config.clone(), BASTION, Trusting)
        .await
        .expect("conectar al bastión :2223");
    assert!(
        bastion
            .authenticate_password(USER, PASS)
            .await
            .unwrap()
            .success(),
        "auth en el bastión"
    );

    // 2) canal directo a través del bastión hacia el destino interno
    let channel = bastion
        .channel_open_direct_tcpip("rat-target", 22, "127.0.0.1", 0)
        .await
        .expect("abrir canal directo bastión → rat-target:22");

    // 3) SSH sobre el canal (client::connect_stream, como en la app)
    let mut target = client::connect_stream(config, channel.into_stream(), Trusting)
        .await
        .expect("handshake SSH con el destino a través del bastión");
    assert!(
        target
            .authenticate_password(USER, PASS)
            .await
            .unwrap()
            .success(),
        "auth en el destino a través del bastión"
    );

    // 4) exec en el destino: su hostname prueba que llegamos AL DESTINO, no al bastión
    let mut ch = target.channel_open_session().await.unwrap();
    ch.exec(true, "hostname").await.unwrap();
    let out = drain(&mut ch).await;
    assert!(
        out.contains("destino-tras-bastion"),
        "el hostname del destino vía bastión debería ser 'destino-tras-bastion': {out:?}"
    );
}
