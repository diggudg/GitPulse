mod commands;
mod copilot_sdk;
mod git;
mod github;
mod pr_review;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(copilot_sdk::CopilotSdk::default())
        .invoke_handler(tauri::generate_handler![
            commands::open_repo,
            commands::discover_repos,
            commands::commit_graph,
            commands::commit_detail,
            commands::file_diff,
            commands::working_file_diff,
            commands::repo_status,
            commands::repo_refs,
            commands::workspace_summary,
            commands::stage,
            commands::unstage,
            commands::commit,
            commands::fetch_repo,
            commands::pull_repo,
            commands::pr_review_environment,
            commands::list_copilot_models,
            commands::list_pull_requests,
            commands::resolved_review_threads,
            commands::review_pull_request,
            commands::get_github_auth_status,
            commands::save_github_token,
            commands::clear_github_token,
            commands::copilot_open_login,
            commands::github_open_login,
            commands::open_system_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
