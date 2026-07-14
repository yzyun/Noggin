mod cards;
mod db;
mod error;
mod index;
mod print;
mod vault;
mod watcher;

use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(vault::AppState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            vault::open_vault,
            vault::get_last_vault,
            vault::close_vault,
            vault::index_stats,
            vault::vault_read_file,
            vault::vault_write_file,
            vault::vault_write_binary,
            vault::vault_read_binary,
            vault::vault_remove_file,
            vault::vault_list,
            vault::vault_list_recursive,
            vault::vault_create_dir,
            vault::vault_rename,
            vault::vault_delete_folder,
            vault::vault_list_dirs,
            index::index_upsert_question,
            index::index_search,
            index::index_remove_question,
            index::index_list_questions,
            cards::cards_due,
            cards::card_update,
            cards::review_log_add,
            cards::review_stats,
            print::print_page,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
