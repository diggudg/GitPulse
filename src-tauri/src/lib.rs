mod commands;
mod git;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::open_repo,
            commands::discover_repos,
            commands::commit_graph,
            commands::commit_detail,
            commands::file_diff,
            commands::repo_status,
            commands::repo_refs,
            commands::workspace_summary,
            commands::stage,
            commands::unstage,
            commands::commit,
            commands::fetch_repo,
            commands::pull_repo,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
