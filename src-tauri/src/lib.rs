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
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, WindowEvent};

/// Muestra y enfoca la ventana principal (desde el tray).
fn show_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // recuerda tamaño y posición de la ventana entre sesiones
        .plugin(tauri_plugin_window_state::Builder::default().build())
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
        // Icono en la barra de menú (macOS) / bandeja (Windows, Linux).
        .setup(|app| {
            let show = MenuItemBuilder::with_id("tray_show", "Mostrar Ratatoskr").build(app)?;
            let quit = MenuItemBuilder::with_id("tray_quit", "Salir").build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .item(&show)
                .separator()
                .item(&quit)
                .build()?;

            let mut tray = TrayIconBuilder::with_id("main")
                .tooltip("Ratatoskr")
                .menu(&tray_menu)
                // clic izquierdo abre la ventana; el menú sale con clic derecho
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "tray_show" => show_main(app),
                    "tray_quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                });

            // macOS: icono monocromo "template" que se adapta a la barra clara/oscura
            #[cfg(target_os = "macos")]
            {
                let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;
                tray = tray.icon(icon).icon_as_template(true);
            }
            #[cfg(not(target_os = "macos"))]
            {
                if let Some(icon) = app.default_window_icon() {
                    tray = tray.icon(icon.clone());
                }
            }

            tray.build(app)?;
            Ok(())
        })
        // Cerrar la ventana la esconde a la bandeja; las sesiones SSH siguen vivas.
        // "Salir" del tray (o ⌘Q) cierra de verdad.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
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
            sftp::sftp_read_text,
            sftp::sftp_write_text,
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
