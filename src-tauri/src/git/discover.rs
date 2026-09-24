//! Repository discovery: walk a directory tree and find the git repositories
//! inside it, so a user can add a whole parent folder at once.
//!
//! A directory is a repo if it contains a `.git` entry (a dir for normal repos,
//! a file for worktrees/submodules). We do not descend into a repo once found,
//! skip noisy/heavy directories, and bound the depth — keeping scans of large
//! trees fast and predictable.

use std::path::{Path, PathBuf};

/// Default recursion depth below the chosen root.
pub const DEFAULT_MAX_DEPTH: usize = 5;

/// Directories never worth descending into when hunting for repos.
const SKIP_DIRS: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    "vendor",
    ".venv",
    "venv",
    "__pycache__",
];

/// Find all git repositories under `root`, up to `max_depth` levels deep.
pub fn find_repos(root: &str, max_depth: usize) -> Vec<PathBuf> {
    let mut out = Vec::new();
    walk(Path::new(root), max_depth, &mut out);
    out
}

fn walk(dir: &Path, depth_left: usize, out: &mut Vec<PathBuf>) {
    if dir.join(".git").exists() {
        out.push(dir.to_path_buf());
        return; // a repo's internals are never scanned for nested repos
    }
    if depth_left == 0 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        // Skip symlinks to avoid cycles and escaping the tree.
        if entry.file_type().map(|t| !t.is_dir()).unwrap_or(true) {
            continue;
        }
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with('.') || SKIP_DIRS.contains(&name.as_ref()) {
            continue;
        }
        walk(&entry.path(), depth_left - 1, out);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn init_repo(path: &Path) {
        std::fs::create_dir_all(path).unwrap();
        git2::Repository::init(path).unwrap();
    }

    #[test]
    fn finds_nested_repos_and_skips_noise() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();

        init_repo(&root.join("a")); // depth 1
        init_repo(&root.join("group/b")); // depth 2
        init_repo(&root.join("node_modules/pkg")); // must be skipped
        std::fs::create_dir_all(root.join("plain/sub")).unwrap(); // no repo

        // A nested repo inside another repo must not be reported separately.
        std::fs::create_dir_all(root.join("a/inner")).unwrap();
        git2::Repository::init(root.join("a/inner")).unwrap();

        let mut found: Vec<String> = find_repos(root.to_str().unwrap(), DEFAULT_MAX_DEPTH)
            .into_iter()
            .map(|p| p.strip_prefix(root).unwrap().to_string_lossy().to_string())
            .collect();
        found.sort();

        assert_eq!(found, vec!["a".to_string(), "group/b".to_string()]);
    }

    #[test]
    fn root_itself_can_be_a_repo() {
        let dir = tempfile::tempdir().unwrap();
        init_repo(dir.path());
        let found = find_repos(dir.path().to_str().unwrap(), DEFAULT_MAX_DEPTH);
        assert_eq!(found.len(), 1);
    }
}
