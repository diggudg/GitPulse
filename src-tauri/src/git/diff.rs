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

    patch_for_file(&diff, file)
}

/// Unified patch for one path against the index or working tree.
pub fn working_file_patch(path: &str, file: &str, staged: bool) -> GitResult<String> {
    let repo = git2::Repository::open(path)?;
    let mut opts = git2::DiffOptions::new();
    opts.pathspec(file).disable_pathspec_match(true);

    let diff = if staged {
        let head_tree = match repo.head() {
            Ok(head) => Some(head.peel_to_tree()?),
            Err(error) if error.code() == git2::ErrorCode::UnbornBranch => None,
            Err(error) => return Err(error.into()),
        };
        repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut opts))?
    } else {
        opts.include_untracked(true)
            .show_untracked_content(true)
            .recurse_untracked_dirs(true);
        repo.diff_index_to_workdir(None, Some(&mut opts))?
    };

    patch_for_file(&diff, file)
}

fn patch_for_file(diff: &git2::Diff<'_>, file: &str) -> GitResult<String> {
    for (idx, delta) in diff.deltas().enumerate() {
        let matches = [delta.old_file().path(), delta.new_file().path()]
            .into_iter()
            .flatten()
            .any(|path| path.to_string_lossy() == file);
        if !matches {
            continue;
        }
        if let Some(mut patch) = git2::Patch::from_diff(diff, idx)? {
            let buf = patch.to_buf()?;
            return Ok(String::from_utf8_lossy(&buf).to_string());
        }
    }
    Ok(String::new())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn init_repo(dir: &Path) -> git2::Repository {
        let repo = git2::Repository::init(dir).unwrap();
        let signature = git2::Signature::now("Test", "test@example.com").unwrap();
        std::fs::write(dir.join("tracked.txt"), "base\n").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("tracked.txt")).unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        repo.commit(Some("HEAD"), &signature, &signature, "initial", &tree, &[])
            .unwrap();
        drop(tree);
        repo
    }

    #[test]
    fn working_tree_patches_distinguish_index_and_worktree() {
        let dir = tempfile::tempdir().unwrap();
        let repo = init_repo(dir.path());
        let path = dir.path().to_str().unwrap();

        std::fs::write(dir.path().join("tracked.txt"), "staged\n").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("tracked.txt")).unwrap();
        index.write().unwrap();
        std::fs::write(dir.path().join("tracked.txt"), "unstaged\n").unwrap();

        let staged = working_file_patch(path, "tracked.txt", true).unwrap();
        assert!(staged.contains("-base"));
        assert!(staged.contains("+staged"));
        assert!(!staged.contains("+unstaged"));

        let unstaged = working_file_patch(path, "tracked.txt", false).unwrap();
        assert!(unstaged.contains("-staged"));
        assert!(unstaged.contains("+unstaged"));
        assert!(!unstaged.contains("+base"));
    }

    #[test]
    fn working_tree_patch_includes_untracked_file_content() {
        let dir = tempfile::tempdir().unwrap();
        let _repo = init_repo(dir.path());
        let path = dir.path().to_str().unwrap();
        let file = "new[1].txt";
        std::fs::write(dir.path().join(file), "new content\n").unwrap();

        let patch = working_file_patch(path, file, false).unwrap();
        assert!(patch.contains(file));
        assert!(patch.contains("+new content"));
    }

    #[test]
    fn stash_commit_file_patch_is_available() {
        let dir = tempfile::tempdir().unwrap();
        let mut repo = init_repo(dir.path());
        let signature = git2::Signature::now("Test", "test@example.com").unwrap();
        std::fs::write(dir.path().join("tracked.txt"), "stashed change\n").unwrap();
        let sha = repo
            .stash_save(&signature, "saved changes", None)
            .unwrap()
            .to_string();

        let detail = detail(dir.path().to_str().unwrap(), &sha).unwrap();
        assert_eq!(detail.files[0].path, "tracked.txt");
        let patch = file_patch(dir.path().to_str().unwrap(), &sha, "tracked.txt").unwrap();
        assert!(patch.contains("+stashed change"));
    }
}
