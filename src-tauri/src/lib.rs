mod backup;
mod history;
mod hosts;
mod keys;
mod known_hosts;
mod portable;
mod session_log;
mod sftp;
mod snippets;
mod ssh;
mod ssh_config;
mod store;
mod tunnel;
mod vault;

use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(ssh::SshState::default())
        .manage(sftp::SftpState::default())
        .manage(tunnel::TunnelState::default())
        .manage(vault::VaultManager::default())
        .menu(|handle| {
            let app_menu = SubmenuBuilder::new(handle, "Ratatoskr")
                .about(None)
                .separator()
                .item(
                    &MenuItemBuilder::with_id("settings", "Preferencias…")
                        .accelerator("Cmd+,")
                        .build(handle)?,
                )
                .separator()
                .hide()
                .hide_others()
                .separator()
                .quit()
                .build()?;

            // El menú Edición es obligatorio en macOS: sin él, Cmd+C/V/X no
            // llegan al webview.
            let edit_menu = SubmenuBuilder::new(handle, "Edición")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;

            // Sin item "Cerrar ventana": Cmd+W queda libre para cerrar pestañas.
            let window_menu = SubmenuBuilder::new(handle, "Ventana")
                .minimize()
                .maximize()
                .separator()
                .fullscreen()
                .build()?;

            MenuBuilder::new(handle)
                .items(&[&app_menu, &edit_menu, &window_menu])
                .build()
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "settings" {
                let _ = app.emit("open-settings", ());
            }
        })
        .invoke_handler(tauri::generate_handler![
            vault::vault_status,
            vault::vault_create,
            vault::vault_unlock,
            vault::vault_lock,
            vault::vault_info,
            vault::vault_export,
            vault::vault_import,
            backup::backup_export,
            backup::backup_import,
            portable::hosts_export,
            portable::hosts_import,
            portable::settings_export,
            portable::settings_import,
            hosts::list_hosts,
            hosts::save_host,
            hosts::delete_host,
            keys::list_ssh_keys,
            ssh_config::read_ssh_config,
            known_hosts::list_known_hosts,
            known_hosts::forget_known_host,
            snippets::list_snippets,
            snippets::save_snippet,
            snippets::delete_snippet,
            history::list_history,
            history::clear_history,
            session_log::open_logs_dir,
            ssh::ssh_connect,
            ssh::ssh_write,
            ssh::ssh_resize,
            ssh::ssh_disconnect,
            sftp::sftp_connect,
            sftp::sftp_list,
            sftp::sftp_download,
            sftp::sftp_upload,
            sftp::sftp_mkdir,
            sftp::sftp_remove,
            sftp::sftp_rename,
            sftp::sftp_disconnect,
            tunnel::tunnel_open,
            tunnel::tunnel_close
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
