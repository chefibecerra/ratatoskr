import { chromium } from "playwright";

// Backend simulado: se inyecta antes de que cargue la app para que las
// llamadas invoke() devuelvan datos de demo (IPs TEST-NET, sin datos reales).
const MOCK = () => {
  const HOSTS = [
    { id: "1", name: "web-prod", hostname: "192.0.2.10", port: 22, username: "deploy", auth: { kind: "key", key_path: "~/.ssh/id_ed25519", passphrase: null }, tags: ["nginx"], group: "Producción", jump_host_id: null, login_commands: [] },
    { id: "2", name: "db-prod", hostname: "192.0.2.11", port: 22, username: "postgres", auth: { kind: "key", key_path: "~/.ssh/id_ed25519", passphrase: null }, tags: ["postgres"], group: "Producción", jump_host_id: "3", login_commands: [] },
    { id: "3", name: "bastion", hostname: "192.0.2.1", port: 22, username: "jump", auth: { kind: "key", key_path: "~/.ssh/id_ed25519", passphrase: null }, tags: [], group: "Producción", jump_host_id: null, login_commands: [] },
    { id: "4", name: "staging", hostname: "198.51.100.5", port: 22, username: "deploy", auth: { kind: "key", key_path: "~/.ssh/id_ed25519", passphrase: null }, tags: [], group: "Staging", jump_host_id: null, login_commands: [] },
  ];

  const GREEN = "\x1b[32m", BLUE = "\x1b[34m", DIM = "\x1b[90m", RST = "\x1b[0m", BOLD = "\x1b[1m";
  const SESSION =
    `${GREEN}deploy@web-prod${RST}:${BLUE}~${RST}$ docker ps\r\n` +
    `${DIM}CONTAINER   IMAGE          STATUS${RST}\r\n` +
    `a1b2c3d4    ${BLUE}nginx:latest${RST}   ${GREEN}Up 3 days${RST}\r\n` +
    `e5f6a7b8    ${BLUE}redis:7${RST}        ${GREEN}Up 3 days${RST}\r\n` +
    `9c0d1e2f    ${BLUE}app:2.4.1${RST}      ${GREEN}Up 6 hours${RST}\r\n` +
    `${GREEN}deploy@web-prod${RST}:${BLUE}~${RST}$ ls -la /var/www\r\n` +
    `${BOLD}${BLUE}drwxr-xr-x${RST}  4 deploy deploy 4096 site\r\n` +
    `-rw-r--r--  1 deploy deploy  812 ${GREEN}deploy.sh${RST}\r\n` +
    `${GREEN}deploy@web-prod${RST}:${BLUE}~${RST}$ `;

  window.__TAURI_INTERNALS__ = {
    callbacks: new Map(),
    nextId: 0,
    transformCallback(cb) { const id = ++this.nextId; this.callbacks.set(id, cb); return id; },
    unregisterCallback(id) { this.callbacks.delete(id); },
    convertFileSrc(p) { return p; },
    async invoke(cmd, args) {
      switch (cmd) {
        case "vault_status": return "unlocked";
        case "list_hosts": return HOSTS;
        case "list_snippets": return [{ id: "s1", name: "Reiniciar nginx", command: "sudo systemctl restart nginx" }];
        case "ssh_connect": {
          // alimenta el terminal con salida de demo (varias veces por si el
          // terminal aún no montó su sink)
          // el SessionStream bufferea si el terminal aún no se enganchó
          const enc = new TextEncoder();
          setTimeout(() => { try { args.onData.onmessage(enc.encode(SESSION).buffer); } catch {} }, 300);
          return;
        }
        default:
          if (cmd.startsWith("plugin:updater")) return null; // sin actualización
          if (cmd.startsWith("plugin:event")) return 0;
          return [];
      }
    },
  };
  window.__TAURI_OS_PLUGIN_INTERNALS__ = { platform: "macos" };
};

const url = "http://localhost:1420";
const out = process.argv[2] || "docs/screenshot.png";

// --disable-3d-apis desactiva WebGL: la app cae al renderer DOM de xterm,
// que sí pinta texto en headless (WebGL sale en negro sin GPU real).
const browser = await chromium.launch({ args: ["--disable-3d-apis"] });
const page = await browser.newPage({
  viewport: { width: 1200, height: 780 },
  deviceScaleFactor: 2,
});
await page.addInitScript(MOCK);
await page.goto(url, { waitUntil: "networkidle" });

// semáforos de macOS falsos (en la app los pone el sistema)
await page.addStyleTag({
  content: `.__tl{position:fixed;top:16px;left:14px;z-index:99;display:flex;gap:8px}
    .__tl span{width:12px;height:12px;border-radius:50%}
    .__r{background:#ff5f57}.__y{background:#febc2e}.__g{background:#28c840}`,
});
await page.evaluate(() => {
  const d = document.createElement("div");
  d.className = "__tl";
  d.innerHTML = '<span class="__r"></span><span class="__y"></span><span class="__g"></span>';
  document.body.appendChild(d);
});

// conecta al primer host para poblar el terminal
await page.getByText("web-prod").first().click();
await page.waitForTimeout(1400);

await page.screenshot({ path: out });
await browser.close();
console.log("captura guardada en", out);
