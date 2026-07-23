import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { php } from "@codemirror/lang-php";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { sql } from "@codemirror/lang-sql";
import { yaml } from "@codemirror/lang-yaml";
import { StreamLanguage } from "@codemirror/language";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";
import { nginx } from "@codemirror/legacy-modes/mode/nginx";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import type { Extension } from "@codemirror/state";

const shellLang = () => StreamLanguage.define(shell);

/** Devuelve la extensión de lenguaje de CodeMirror según el nombre del archivo. */
export function languageFor(filename: string): Extension | null {
  const name = filename.toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop()! : "";

  // por nombre completo (archivos sin extensión típicos)
  if (name === "dockerfile" || name.startsWith("dockerfile"))
    return StreamLanguage.define(dockerFile);
  if (name === "nginx.conf" || name.includes("nginx"))
    return StreamLanguage.define(nginx);
  if (name.startsWith(".env") || name.endsWith(".env")) return shellLang();
  if (name.startsWith(".bashrc") || name.startsWith(".zshrc") || name === ".profile")
    return shellLang();

  switch (ext) {
    case "js":
    case "cjs":
    case "mjs":
    case "jsx":
      return javascript({ jsx: true });
    case "ts":
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "py":
      return python();
    case "json":
      return json();
    case "yml":
    case "yaml":
      return yaml();
    case "md":
    case "markdown":
      return markdown();
    case "sql":
      return sql();
    case "html":
    case "htm":
      return html();
    case "css":
    case "scss":
      return css();
    case "rs":
      return rust();
    case "php":
      return php();
    case "toml":
      return StreamLanguage.define(toml);
    case "sh":
    case "bash":
    case "zsh":
      return shellLang();
    case "conf":
    case "cnf":
      return StreamLanguage.define(nginx);
    default:
      return null; // texto plano, sin resaltado
  }
}
