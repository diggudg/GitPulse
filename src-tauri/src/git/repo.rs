//! Repository open + validation (gix).

use super::{GitError, GitResult};
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoMeta {
    pub path: String,
    pub name: String,
    pub head: Option<String>,
}

/// Validate that `path` is a git repository and return its metadata.
pub fn open(path: &str) -> GitResult<RepoMeta> {
    let repo = gix::open(path).map_err(|_| GitError::NotARepo(path.to_string()))?;

    let work_dir = repo
        .work_dir()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| Path::new(path).to_path_buf());

    let name = work_dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("repository")
        .to_string();

    // HEAD branch name, or None when detached.
    let head = repo
        .head_ref()
        .ok()
        .flatten()
        .map(|r| r.name().shorten().to_string());

    Ok(RepoMeta {
        path: work_dir.to_string_lossy().to_string(),
        name,
        head,
    })
}
