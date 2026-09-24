//! Git engine layer.
//!
//! Engine split (see plan): `gix` (gitoxide) powers the performance-critical
//! commit-graph walk and repo open; the mature `git2` (libgit2) API powers
//! status / diff / write operations for MVP reliability. The choice is an
//! internal detail behind these modules — callers only see plain data types.

pub mod asset;
pub mod diff;
pub mod discover;
pub mod log;
pub mod refs;
pub mod repo;
pub mod service;
pub mod status;
pub mod summary;
pub mod write;

pub use service::GitService;

use serde::Serialize;

/// A user-facing git error. All command handlers return `Result<_, GitError>`,
/// which Tauri serializes to the frontend.
#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum GitError {
    #[error("not a git repository: {0}")]
    NotARepo(String),
    #[error("git operation failed: {0}")]
    Failed(String),
}

impl From<git2::Error> for GitError {
    fn from(e: git2::Error) -> Self {
        GitError::Failed(e.message().to_string())
    }
}

impl From<std::io::Error> for GitError {
    fn from(e: std::io::Error) -> Self {
        GitError::Failed(e.to_string())
    }
}

pub type GitResult<T> = Result<T, GitError>;
