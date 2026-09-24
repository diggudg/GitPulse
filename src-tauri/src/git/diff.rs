//! Commit diffs (git2). Produces the changed-file list (with per-file line
//! stats) for a commit, and the unified patch text for a single file.

use super::status::{FileChange, FileStatus};
use super::{GitError, GitResult};
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetail {
    pub sha: String,
    pub author: String,
    pub email: String,
    pub time: i64,
    pub message: String,
    pub files: Vec<FileChange>,
}

/// Build the diff between a commit and its first parent (or the empty tree for
/// the root commit).
fn commit_diff<'r>(
    repo: &'r git2::Repository,
    sha: &str,
) -> GitResult<(git2::Commit<'r>, git2::Diff<'r>)> {
    let oid = git2::Oid::from_str(sha).map_err(|e| GitError::Failed(e.to_string()))?;
    let commit = repo.find_commit(oid)?;
    let tree = commit.tree()?;
    let parent_tree = if commit.parent_count() > 0 {
        Some(commit.parent(0)?.tree()?)
    } else {
        None
    };
    let mut opts = git2::DiffOptions::new();
    let diff = repo.diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut opts))?;
    Ok((commit, diff))
}

pub fn detail(path: &str, sha: &str) -> GitResult<CommitDetail> {
    let repo = git2::Repository::open(path)?;
    let (commit, diff) = commit_diff(&repo, sha)?;

    let mut files = Vec::new();
    for (idx, delta) in diff.deltas().enumerate() {
        let status = match delta.status() {
            git2::Delta::Added => FileStatus::Added,
            git2::Delta::Deleted => FileStatus::Deleted,
            git2::Delta::Renamed => FileStatus::Renamed,
            _ => FileStatus::Modified,
        };
        let new_path = delta
            .new_file()
            .path()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        let old_path = delta
            .old_file()
            .path()
            .map(|p| p.to_string_lossy().to_string());

        let (additions, deletions) = match git2::Patch::from_diff(&diff, idx) {
            Ok(Some(patch)) => {
                let (_, add, del) = patch.line_stats().unwrap_or((0, 0, 0));
                (add as u32, del as u32)
            }
            _ => (0, 0),
        };

        files.push(FileChange {
            path: new_path,
            old_path: old_path.filter(|p| !p.is_empty()),
            status,
            additions,
            deletions,
        });
    }

    let author = commit.author();
    Ok(CommitDetail {
        sha: sha.to_string(),
        author: author.name().unwrap_or("").to_string(),
        email: author.email().unwrap_or("").to_string(),
        time: commit.time().seconds(),
        message: commit.message().unwrap_or("").to_string(),
        files,
    })
}

/// Unified patch text for a single file within a commit. Returned to the caller
/// which decides whether to inline it or stream it via the asset protocol.
pub fn file_patch(path: &str, sha: &str, file: &str) -> GitResult<String> {
    let repo = git2::Repository::open(path)?;
    let (_, diff) = commit_diff(&repo, sha)?;

    for (idx, delta) in diff.deltas().enumerate() {
        let matches = delta
            .new_file()
            .path()
            .map(|p| p.to_string_lossy() == file)
            .unwrap_or(false);
        if !matches {
            continue;
        }
        if let Ok(Some(mut patch)) = git2::Patch::from_diff(&diff, idx) {
            let buf = patch.to_buf()?;
            return Ok(String::from_utf8_lossy(&buf).to_string());
        }
    }
    Ok(String::new())
}
