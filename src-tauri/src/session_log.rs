use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

/// Escribe la salida del terminal a un archivo, limpiando los códigos de
/// escape ANSI para que el registro sea legible y se pueda auditar con grep.
pub struct SessionLog {
    file: File,
}

impl SessionLog {
    pub fn create(app: &AppHandle, host_name: &str, started_ms: u64) -> Option<Self> {
        let dir = app.path().app_data_dir().ok()?.join("logs");
        std::fs::create_dir_all(&dir).ok()?;
        let safe: String = host_name
            .chars()
            .map(|c| if c.is_alphanumeric() { c } else { '_' })
            .collect();
        let path = dir.join(format!("{safe}-{started_ms}.log"));
        let file = OpenOptions::new().create(true).append(true).open(path).ok()?;
        Some(Self { file })
    }

    pub fn write(&mut self, data: &[u8]) {
        let clean = strip_ansi_escapes::strip(data);
        let _ = self.file.write_all(&clean);
    }
}

pub fn logs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("logs");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
pub fn open_logs_dir(app: AppHandle) -> Result<String, String> {
    Ok(logs_dir(&app)?.to_string_lossy().into_owned())
}
