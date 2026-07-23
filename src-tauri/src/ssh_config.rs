use std::fs;
use std::path::PathBuf;

use serde::Serialize;

/// Entrada utilizable de ~/.ssh/config (se ignoran patrones con comodines).
#[derive(Debug, Clone, Serialize)]
pub struct SshConfigHost {
    pub alias: String,
    pub hostname: String,
    pub user: Option<String>,
    pub port: u16,
    pub identity_file: Option<String>,
}

#[derive(Default)]
struct Block {
    aliases: Vec<String>,
    hostname: Option<String>,
    user: Option<String>,
    port: Option<u16>,
    identity_file: Option<String>,
}

fn flush(block: Block, out: &mut Vec<SshConfigHost>) {
    for alias in block.aliases {
        out.push(SshConfigHost {
            hostname: block.hostname.clone().unwrap_or_else(|| alias.clone()),
            user: block.user.clone(),
            port: block.port.unwrap_or(22),
            identity_file: block.identity_file.clone(),
            alias,
        });
    }
}

#[tauri::command]
pub fn read_ssh_config() -> Result<Vec<SshConfigHost>, String> {
    let Some(home) = std::env::var_os("HOME") else {
        return Ok(Vec::new());
    };
    let path = PathBuf::from(home).join(".ssh/config");
    let Ok(raw) = fs::read_to_string(&path) else {
        return Ok(Vec::new());
    };

    let mut out = Vec::new();
    let mut current = Block::default();

    for line in raw.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let mut parts = line.split_whitespace();
        let Some(keyword) = parts.next() else { continue };
        let value: Vec<&str> = parts.collect();
        if value.is_empty() {
            continue;
        }

        match keyword.to_ascii_lowercase().as_str() {
            "host" => {
                flush(std::mem::take(&mut current), &mut out);
                // los patrones con comodines no son hosts concretos
                current.aliases = value
                    .iter()
                    .filter(|a| !a.contains('*') && !a.contains('?') && !a.starts_with('!'))
                    .map(|a| a.to_string())
                    .collect();
            }
            "hostname" => current.hostname = Some(value[0].to_string()),
            "user" => current.user = Some(value[0].to_string()),
            "port" => current.port = value[0].parse().ok(),
            "identityfile" => current.identity_file = Some(value[0].to_string()),
            _ => {}
        }
    }
    flush(current, &mut out);
    Ok(out)
}
