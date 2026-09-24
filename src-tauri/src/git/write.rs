//! Write operations: stage / unstage / commit (git2).
//!
//! gix's write/index API is still maturing, so the MVP routes mutations through
//! libgit2, which has a stable, well-understood surface.

use super::{GitError, GitResult};
use std::path::Path;

/// Stage the given paths (relative to the work dir) into the index.
pub fn stage(path: &str, paths: &[String]) -> GitResult<()> {
    let repo = git2::Repository::open(path)?;
    let mut index = repo.index()?;
    for p in paths {
        let rel = Path::new(p);
        if repo.workdir().map(|w| w.join(rel).exists()).unwrap_or(false) {
            index.add_path(rel)?;
        } else {
            // File was deleted in the work tree — record the removal.
            index.remove_path(rel)?;
        }
    }
    index.write()?;
    Ok(())
}

/// Unstage the given paths (reset index entry to HEAD).
pub fn unstage(path: &str, paths: &[String]) -> GitResult<()> {
    let repo = git2::Repository::open(path)?;
    match repo.head() {
        Ok(head) => {
            let commit = head.peel_to_commit()?;
            let specs: Vec<&Path> = paths.iter().map(|p| Path::new(p)).collect();
            repo.reset_default(Some(commit.as_object()), specs.iter())?;
        }
        Err(_) => {
            // Unborn HEAD (no commits yet): just drop entries from the index.
            let mut index = repo.index()?;
            for p in paths {
                index.remove_path(Path::new(p))?;
            }
            index.write()?;
        }
    }
    Ok(())
}

/// Create a commit from the current index. Returns the new commit SHA.
pub fn commit(path: &str, message: &str) -> GitResult<String> {
    if message.trim().is_empty() {
        return Err(GitError::Failed("empty commit message".into()));
    }
    let repo = git2::Repository::open(path)?;
    let sig = repo.signature()?;
    let mut index = repo.index()?;
    let tree_id = index.write_tree()?;
    let tree = repo.find_tree(tree_id)?;

    let parents: Vec<git2::Commit> = match repo.head() {
        Ok(head) => vec![head.peel_to_commit()?],
        Err(_) => Vec::new(),
    };
    let parent_refs: Vec<&git2::Commit> = parents.iter().collect();

    let oid = repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &parent_refs)?;
    Ok(oid.to_string())
}
