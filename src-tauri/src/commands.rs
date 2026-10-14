//! Tauri command handlers. These are intentionally thin: they offload all git
//! work to a blocking thread (so the UI thread never freezes) and delegate to the
//! `GitService` facade. No git or IO logic lives here.

use crate::git::asset::{self, DiffPayload};
use crate::git::discover;
use crate::git::{diff, log, refs, repo, status, summary, GitError, GitResult, GitService};
use crate::copilot_sdk::{CopilotModelOption, CopilotSdk};
use crate::pr_review;
use rayon::prelude::*;

/// Diffs above this size are streamed to disk and loaded via the asset protocol
/// instead of being serialized over the IPC bridge as JSON.
const INLINE_DIFF_LIMIT: usize = 256 * 1024;

async fn blocking<T, F>(f: F) -> GitResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> GitResult<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| GitError::Failed(format!("worker panicked: {e}")))?
}

#[tauri::command]
pub async fn open_repo(path: String) -> GitResult<repo::RepoMeta> {
    blocking(move || GitService::new(path).meta()).await
}

/// Discover every git repository under `root` and return their metadata. The
/// tree walk is bounded; metadata for the found repos is resolved in parallel
/// (rayon), and a repo that fails to open is skipped rather than failing the scan.
#[tauri::command]
pub async fn discover_repos(
    root: String,
    max_depth: Option<usize>,
) -> GitResult<Vec<repo::RepoMeta>> {
    blocking(move || {
        let depth = max_depth.unwrap_or(discover::DEFAULT_MAX_DEPTH);
        let paths = discover::find_repos(&root, depth);
        Ok(paths
            .par_iter()
            .filter_map(|p| GitService::new(p.to_string_lossy().to_string()).meta().ok())
            .collect())
    })
    .await
}

#[tauri::command]
pub async fn commit_graph(
    path: String,
    cursor: Option<String>,
    limit: usize,
) -> GitResult<log::CommitPage> {
    blocking(move || GitService::new(path).graph(cursor.as_deref(), limit)).await
}

#[tauri::command]
pub async fn commit_detail(path: String, sha: String) -> GitResult<diff::CommitDetail> {
    blocking(move || GitService::new(path).detail(&sha)).await
}

#[tauri::command]
pub async fn file_diff(path: String, sha: String, file: String) -> GitResult<DiffPayload> {
    blocking(move || {
        let text = GitService::new(path).file_patch(&sha, &file)?;
        asset::build_diff_payload(text, &sha, &file, INLINE_DIFF_LIMIT)
            .map_err(GitError::from)
    })
    .await
}

#[tauri::command]
pub async fn working_file_diff(
    path: String,
    file: String,
    staged: bool,
) -> GitResult<DiffPayload> {
    blocking(move || {
        let source = if staged { "staged" } else { "working-tree" };
        let text = GitService::new(path).working_file_patch(&file, staged)?;
        asset::build_diff_payload(text, source, &file, INLINE_DIFF_LIMIT).map_err(GitError::from)
    })
    .await
}

#[tauri::command]
pub async fn repo_status(path: String) -> GitResult<status::RepoStatus> {
    blocking(move || GitService::new(path).status()).await
}

#[tauri::command]
pub async fn repo_refs(path: String) -> GitResult<refs::RepoRefs> {
    blocking(move || GitService::new(path).refs()).await
}

/// Summarize every workspace repo in parallel (rayon). A single repo failing
/// (e.g. removed on disk) is dropped from the result rather than failing the
/// whole batch, so polling stays resilient.
#[tauri::command]
pub async fn workspace_summary(paths: Vec<String>) -> GitResult<Vec<summary::RepoSummary>> {
    blocking(move || {
        Ok(paths
            .par_iter()
            .filter_map(|p| GitService::new(p.clone()).summary().ok())
            .collect())
    })
    .await
}

#[tauri::command]
pub async fn stage(path: String, paths: Vec<String>) -> GitResult<()> {
    blocking(move || GitService::new(path).stage(&paths)).await
}

#[tauri::command]
pub async fn unstage(path: String, paths: Vec<String>) -> GitResult<()> {
    blocking(move || GitService::new(path).unstage(&paths)).await
}

#[tauri::command]
pub async fn commit(path: String, message: String) -> GitResult<String> {
    blocking(move || GitService::new(path).commit(&message)).await
}

#[tauri::command]
pub async fn fetch_repo(path: String) -> GitResult<()> {
    blocking(move || GitService::new(path).fetch()).await
}

#[tauri::command]
pub async fn pull_repo(path: String, rebase: bool) -> GitResult<()> {
    blocking(move || GitService::new(path).pull(rebase)).await
}

#[tauri::command]
pub async fn pr_review_environment() -> GitResult<pr_review::ReviewEnvironment> {
    pr_review::environment().await
}

#[tauri::command]
pub async fn list_copilot_models(
    copilot: tauri::State<'_, CopilotSdk>,
) -> GitResult<Vec<CopilotModelOption>> {
    copilot.list_models().await
}

#[tauri::command]
pub async fn list_pull_requests(path: String) -> GitResult<Vec<pr_review::PullRequest>> {
    pr_review::list_pull_requests(&path).await
}

#[tauri::command]
pub async fn resolved_review_threads(
    path: String,
    repo: String,
    number: u64,
) -> GitResult<Vec<String>> {
    pr_review::resolved_review_threads(&path, &repo, number).await
}

#[tauri::command]
pub async fn review_pull_request(
    copilot: tauri::State<'_, CopilotSdk>,
    path: String,
    number: u64,
    model_id: String,
) -> GitResult<pr_review::PullRequestReview> {
    pr_review::review_pull_request(&path, number, &copilot, &model_id).await
}

#[tauri::command]
pub async fn get_github_auth_status() -> GitResult<crate::github::AuthStatus> {
    Ok(crate::github::auth_status())
}

#[tauri::command]
pub async fn save_github_token(token: String) -> GitResult<()> {
    crate::github::set_token(&token).map_err(GitError::Failed)
}

#[tauri::command]
pub async fn clear_github_token() -> GitResult<()> {
    crate::github::delete_token().map_err(GitError::Failed)
}

#[tauri::command]
pub async fn copilot_open_login(
    copilot: tauri::State<'_, CopilotSdk>,
) -> GitResult<()> {
    copilot.open_login().await.map_err(GitError::Failed)
}

#[tauri::command]
pub async fn github_open_login() -> GitResult<String> {
    tauri::async_runtime::spawn_blocking(crate::github::open_gh_login)
        .await
        .map_err(|e| GitError::Failed(format!("Login task join error: {e}")))?
        .map_err(GitError::Failed)
}

#[tauri::command]
pub fn open_system_terminal(path: String) -> GitResult<()> {
    let dir = std::path::Path::new(&path);
    if !dir.is_dir() {
        return Err(GitError::Failed(format!("Not a directory: {path}")));
    }

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut c = std::process::Command::new("open");
        c.args(["-a", "Terminal"]).arg(dir);
        c
    };
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut c = std::process::Command::new("cmd");
        c.args(["/C", "start", "powershell.exe", "-NoExit"]).current_dir(dir);
        c
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut c = std::process::Command::new("x-terminal-emulator");
        c.current_dir(dir);
        c
    };

    command
        .spawn()
        .map(|_| ())
        .map_err(|e| GitError::Failed(format!("Failed to open system terminal: {e}")))
}


