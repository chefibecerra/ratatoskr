use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::vault::VaultManager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snippet {
    pub id: String,
    pub name: String,
    pub command: String,
}

#[tauri::command]
pub fn list_snippets(state: State<'_, VaultManager>) -> Result<Vec<Snippet>, String> {
    state.with_data(|d| d.snippets.clone())
}

#[tauri::command]
pub fn save_snippet(
    app: AppHandle,
    state: State<'_, VaultManager>,
    mut snippet: Snippet,
) -> Result<Snippet, String> {
    if snippet.id.is_empty() {
        snippet.id = uuid::Uuid::new_v4().to_string();
    }
    let saved = snippet.clone();
    state.mutate(&app, move |d| {
        match d.snippets.iter_mut().find(|s| s.id == snippet.id) {
            Some(existing) => *existing = snippet,
            None => d.snippets.push(snippet),
        }
    })?;
    Ok(saved)
}

#[tauri::command]
pub fn delete_snippet(
    app: AppHandle,
    state: State<'_, VaultManager>,
    id: String,
) -> Result<(), String> {
    state.mutate(&app, move |d| d.snippets.retain(|s| s.id != id))
}
