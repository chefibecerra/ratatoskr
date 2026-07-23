# Ratatoskr

> La ardilla que corre por Yggdrasil llevando mensajes entre los reinos.

Cliente SSH propio, rápido y bonito. Alternativa personal a Termius: gestionar múltiples conexiones SSH con sync cifrado en la nube para usarlo desde cualquier dispositivo.

## Por qué

- No pagar Termius.
- PuTTY es feo y arcaico.
- Las claves SSH del trabajo no pueden vivir en la nube de un tercero en texto plano.

## Stack

| Capa | Tecnología | Razón |
|------|------------|-------|
| Shell app | Tauri 2 | Liviano, auto-update probado en yggdrasil-launcher, compila a móvil si hace falta |
| Frontend | React 19 + TypeScript + Vite 7 | Stack ya validado |
| UI | Tailwind + shadcn/ui, tema oscuro | "Bonito" barato y consistente |
| Terminal | xterm.js | Lo usan VS Code y Termius. No se reinventa |
| SSH | `russh` (Rust) | SSH puro en Rust, sin libssh2/OpenSSL, cross-compila limpio en CI |
| Vault | Argon2id (KDF) + ChaCha20-Poly1305 | Zero-knowledge: el servidor solo ve un blob cifrado |
| Persistencia local | SQLite (o el propio vault como archivo único) | Simple, portable |

## Arquitectura (concepto)

```
┌─ Webview (React) ─────────────┐      ┌─ Rust (Tauri) ────────────┐
│ Lista hosts / grupos / tags   │ IPC  │ russh: conexión, auth,    │
│ xterm.js  ◄──────────────────►│◄────►│ canales, resize, keepalive│
│ UI vault (master password)    │      │ crypto vault (Argon2 +    │
└───────────────────────────────┘      │ ChaCha20-Poly1305)        │
                                       └───────────┬───────────────┘
                                                   │ blob cifrado
                                       ┌───────────▼───────────────┐
                                       │ Sync API (LXC en Proxmox) │
                                       │ subir/bajar blob + versión│
                                       └───────────────────────────┘
```

**Regla de oro**: la master password y las claves privadas NUNCA salen del dispositivo sin cifrar. El backend de sync es tonto a propósito: guarda blobs, compara versiones, nada más.

**Punto crítico de rendimiento**: la latencia tecla→Rust→SSH→pantalla. Eventos binarios de Tauri + buffering de salida. Si el MVP se siente "gomoso", el problema está acá.

## Fases

### Fase 1 — MVP local (el 70% del valor)
- [x] Scaffold Tauri 2 + React + Tailwind/shadcn
- [x] CRUD de hosts en local (nombre, host, puerto, usuario, auth por clave o password, grupos/tags)
- [x] Conexión SSH con `russh` + terminal xterm.js funcional
- [x] Múltiples sesiones en pestañas
- [x] Resize del PTY, keepalives, reconexión

### Fase 2 — Vault cifrado
- [x] Vault = un único archivo cifrado (Argon2id + ChaCha20-Poly1305)
- [x] Master password al abrir la app, auto-lock por inactividad
- [x] Migrar el CRUD de hosts a leer/escribir el vault

### Fase 3 — Sync (pendiente de definir)
- [x] Base local: vault versionado (revisión monótona) + exportar/importar el blob cifrado
- [ ] Decidir el transporte para uso en empresa: carpeta compartida/drive con el blob cifrado, o servicio propio
- [ ] El backend (si lo hay) sigue siendo tonto: guarda blobs, compara revisiones, nada más

### Después (NO MVP)
- SFTP / transferencia de archivos
- Snippets / comandos guardados
- Port forwarding desde la UI
- Móvil (Tauri 2 iOS/Android)

## Decisiones abiertas

- **¿Móvil en el alcance?** Tauri 2 compila a iOS/Android, pero duplica el trabajo de UI. Pendiente de decidir — no bloquea las fases 1-2.
- **Transporte del sync**: el uso es en empresa. El blob cifrado ya viaja por archivo (export/import); falta decidir si alcanza con una carpeta compartida o hace falta un servicio.
