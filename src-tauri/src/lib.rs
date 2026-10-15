mod keys;
mod sftp;
mod ssh;
mod store;

use ssh::SshState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SshState::default())
        .invoke_handler(tauri::generate_handler![
            ssh::ssh_connect,
            ssh::ssh_write,
            ssh::ssh_resize,
            ssh::ssh_disconnect,
            store::hosts_list,
            store::host_upsert,
            store::host_delete,
            store::ssh_config_hosts,
            keys::keys_list,
            keys::key_upsert,
            keys::key_delete,
            keys::key_info,
            sftp::sftp_home,
            sftp::sftp_list,
            sftp::sftp_download,
            sftp::sftp_upload,
            sftp::sftp_mkdir,
            sftp::sftp_remove,
            sftp::sftp_rename,
            sftp::sftp_read_text,
            sftp::sftp_write_text,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
