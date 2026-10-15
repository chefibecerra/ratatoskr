# 🐿️ Ratatoskr

Cliente SSH personal, estilo Termius. Rápido, bonito y propio — sin pagar licencias y sin la fealdad de PuTTY.

> Ratatoskr es la ardilla de la mitología nórdica que corre por el árbol Yggdrasil llevando mensajes entre el águila de arriba y la serpiente de abajo. Un mensajero veloz entre dos puntos: exactamente lo que hace un cliente SSH.

---

## 🎯 Qué es

Un cliente SSH de escritorio para uso propio en el trabajo. Gestiona hosts, abre sesiones en pestañas, guarda credenciales cifradas de forma zero-knowledge y (más adelante) sincroniza esa bóveda contra un servidor self-hosted en el homelab.

**Plataformas objetivo:** macOS y Windows (las dos máquinas que uso).

---

## 🏗️ Arquitectura y por qué

| Capa | Tecnología |
| --- | --- |
| Shell de escritorio | **Tauri 2** (webview nativo del SO, binarios de pocos MB) |
| Frontend | **React 19 + Vite + Tailwind + shadcn/ui** |
| Terminal | **xterm.js** con renderer **WebGL** (el mismo que usa VS Code) |
| Backend / SSH | **Rust** con **`russh`** (async, Tokio) |
| Cripto (vault) | **Argon2id** (derivación de clave) + **ChaCha20-Poly1305** (cifrado) |

### Decisiones de diseño (el *por qué*, no solo el *qué*)

- **¿Por qué Tauri y no Electron?** Tauri usa el webview nativo del SO (WKWebView en Mac, WebView2 en Windows) en vez de embeber Chromium. Binarios de pocos MB y menos RAM, misma comodidad de UI web.
- **¿Por qué no nativo puro (Rust + Iced/GPUI, estilo Zed/WezTerm)?** Se evaluó buscando máxima performance y se descartó por dos razones:
  1. **En SSH el cuello de botella es la red y el PTY remoto, no el render local.** La velocidad extra de un render GPU nativo es imperceptible en este tipo de app.
  2. **shadcn/Tailwind regala belleza de UI** que en un toolkit nativo habría que estilar a mano. Para una herramienta de uso diario, "bonito sin esfuerzo" pesa más que microsegundos de render.
- **¿Por qué `russh`?** Pila SSH pura en Rust, async sobre Tokio. El lado difícil del protocolo resuelto, linkeado directo al backend de Tauri.
- **¿Por qué xterm.js con WebGL?** Nos regala el 80% más difícil: el emulador de terminal (secuencias ANSI, Unicode, scrollback). El renderer WebGL rinde de sobra.

### Las partes difíciles de verdad
1. **La pila SSH** → la cubre `russh`.
2. **El emulador de terminal + su render** → lo cubre `xterm.js` + WebGL.

El framework de ventanas casi no mueve la aguja de la performance; estas dos capas sí.

---

## 🔐 Vault zero-knowledge

Las credenciales (claves privadas, passwords) se cifran **localmente**. El servidor de sync **nunca ve el plaintext** — solo recibe blobs opacos.

- Derivación de clave maestra: **Argon2id**
- Cifrado simétrico: **ChaCha20-Poly1305**
- La clave maestra nunca sale del dispositivo ni se sube al server.

---

## 🔄 Sync (self-hosted)

- API mínima corriendo en un LXC del Proxmox del homelab.
- Acceso remoto vía **Bifrost** (WireGuard VPN del homelab).
- Login simple al principio. **Supabase Auth** solo si el proyecto llega a venderse.
- Solo se replican blobs cifrados (ver vault zero-knowledge).

---

## 🗺️ Roadmap en capas

Cada capa funciona por sí sola antes de pasar a la siguiente. Nada de meter todo de una.

- [ ] **Capa 1 — MVP:** conectar a un host por SSH y ver la terminal viva. Prueba que `russh ↔ xterm.js ↔ PTY` funciona de punta a punta.
- [ ] **Capa 2 — Gestor de conexiones:** guardar hosts, perfiles, pestañas.
- [ ] **Capa 3 — Vault:** cifrado local zero-knowledge de credenciales.
- [ ] **Capa 4 — Sync:** replicar el vault cifrado contra el homelab vía Bifrost.

### Fuera del MVP (más adelante, si vale la pena)
- SFTP / transferencia de archivos
- Snippets de comandos
- Port-forwarding
- **Móvil** (Tauri 2 compila a iOS/Android, pero duplica la UI — decisión abierta)

---

## 📦 Distribución

El cliente decide cómo lo quiere; Tauri 2 emite ambos formatos (es config del bundler, no cambio de arquitectura).

| Modo | macOS | Windows |
| --- | --- | --- |
| **Instalable** | `.dmg` / `.app` (codesign + notarización para evitar Gatekeeper) | `.msi` (WiX) o instalador `.exe` (NSIS) |
| **Portable** | el `.app` ya es arrastrar-y-usar | `.exe` con **WebView2 en modo `fixedRuntime`** → corre desde USB sin instalar nada |

Gestor de paquetes del frontend: **Bun**.

---

## 📁 Estructura prevista

```
ratatoskr/
├── src-tauri/            # Rust: el "backend"
│   ├── src/
│   │   ├── ssh/          # conexión, sesiones, canales (russh)
│   │   ├── vault/        # capa 3: cifrado zero-knowledge (argon2 + chacha20poly1305)
│   │   └── sync/         # capa 4: cliente del server del homelab
│   └── Cargo.toml
├── src/                  # Frontend: React 19 + shadcn
│   ├── terminal/         # integración xterm.js + WebGL addon
│   └── connections/      # gestor de hosts, pestañas
├── package.json
└── README.md
```

---

## 🧬 Origen

Hereda el stack validado del launcher de **Yggdrasil** (Tauri 2 + React 19 + Vite).
Proyecto reiniciado el **2026-10-15** (la versión original fue borrada; este README reconstruye el brief completo).
