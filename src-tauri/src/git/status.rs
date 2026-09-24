//! Working-tree status (git2).

use super::GitResult;
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub enum FileStatus {
    Added,
    Modified,
    Deleted,
    Renamed,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    pub old_path: Option<String>,
    pub status: FileStatus,
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoStatus {
    pub staged: Vec<FileChange>,
    pub unstaged: Vec<FileChange>,
    pub untracked: Vec<String>,
}

pub fn status(path: &str) -> GitResult<RepoStatus> {
    let repo = git2::Repository::open(path)?;
    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true).recurse_untracked_dirs(true);

    let mut staged = Vec::new();
    let mut unstaged = Vec::new();
    let mut untracked = Vec::new();

    for entry in repo.statuses(Some(&mut opts))?.iter() {
        let s = entry.status();
        let path_str = entry.path().unwrap_or("").to_string();

        if s.contains(git2::Status::WT_NEW) {
            untracked.push(path_str.clone());
        }

        // Index (staged) side.
        if let Some(fs) = map_index_status(s) {
            staged.push(simple_change(&path_str, fs));
        }
        // Working-tree (unstaged) side.
        if let Some(fs) = map_wt_status(s) {
            unstaged.push(simple_change(&path_str, fs));
        }
    }

    Ok(RepoStatus {
        staged,
        unstaged,
        untracked,
    })
}

fn simple_change(path: &str, status: FileStatus) -> FileChange {
    FileChange {
        path: path.to_string(),
        old_path: None,
        status,
        additions: 0,
        deletions: 0,
    }
}

fn map_index_status(s: git2::Status) -> Option<FileStatus> {
    if s.contains(git2::Status::INDEX_NEW) {
        Some(FileStatus::Added)
    } else if s.contains(git2::Status::INDEX_MODIFIED) {
        Some(FileStatus::Modified)
    } else if s.contains(git2::Status::INDEX_DELETED) {
        Some(FileStatus::Deleted)
    } else if s.contains(git2::Status::INDEX_RENAMED) {
        Some(FileStatus::Renamed)
    } else {
        None
    }
}

fn map_wt_status(s: git2::Status) -> Option<FileStatus> {
    if s.contains(git2::Status::WT_MODIFIED) {
        Some(FileStatus::Modified)
    } else if s.contains(git2::Status::WT_DELETED) {
        Some(FileStatus::Deleted)
    } else if s.contains(git2::Status::WT_RENAMED) {
        Some(FileStatus::Renamed)
    } else {
        None
    }
}
