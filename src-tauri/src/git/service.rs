//! `GitService` — a Facade over the per-repository git operations.
//!
//! The engine split (gix for reads, git2 for writes) and the individual
//! operation modules are implementation details. Command handlers depend on this
//! single cohesive type rather than reaching into scattered free functions, which
//! keeps the IPC layer thin (SRP) and gives one seam to evolve later (e.g. caching
//! an open repo handle, or migrating writes to gix) without touching callers (OCP).

use super::{diff, log, refs, repo, status, summary, write, GitResult};

pub struct GitService {
    path: String,
}

impl GitService {
    pub fn new(path: impl Into<String>) -> Self {
        Self { path: path.into() }
    }

    pub fn meta(&self) -> GitResult<repo::RepoMeta> {
        repo::open(&self.path)
    }

    pub fn graph(&self, cursor: Option<&str>, limit: usize) -> GitResult<log::CommitPage> {
        log::graph(&self.path, cursor, limit)
    }

    pub fn detail(&self, sha: &str) -> GitResult<diff::CommitDetail> {
        diff::detail(&self.path, sha)
    }

    pub fn file_patch(&self, sha: &str, file: &str) -> GitResult<String> {
        diff::file_patch(&self.path, sha, file)
    }

    pub fn working_file_patch(&self, file: &str, staged: bool) -> GitResult<String> {
        diff::working_file_patch(&self.path, file, staged)
    }

    pub fn status(&self) -> GitResult<status::RepoStatus> {
        status::status(&self.path)
    }

    pub fn summary(&self) -> GitResult<summary::RepoSummary> {
        summary::summary(&self.path)
    }

    pub fn refs(&self) -> GitResult<refs::RepoRefs> {
        refs::list_refs(&self.path)
    }

    pub fn stage(&self, paths: &[String]) -> GitResult<()> {
        write::stage(&self.path, paths)
    }

    pub fn unstage(&self, paths: &[String]) -> GitResult<()> {
        write::unstage(&self.path, paths)
    }

    pub fn commit(&self, message: &str) -> GitResult<String> {
        write::commit(&self.path, message)
    }

    pub fn fetch(&self) -> GitResult<()> {
        let output = std::process::Command::new("git")
            .arg("fetch")
            .current_dir(&self.path)
            .output()
            .map_err(|e| super::GitError::Failed(e.to_string()))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(super::GitError::Failed(stderr.into_owned()));
        }
        Ok(())
    }

    pub fn pull(&self, rebase: bool) -> GitResult<()> {
        let mut cmd = std::process::Command::new("git");
        cmd.arg("pull").current_dir(&self.path);
        if rebase {
            cmd.arg("--rebase");
        } else {
            cmd.arg("--ff-only");
        }

        let output = cmd
            .output()
            .map_err(|e| super::GitError::Failed(e.to_string()))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(super::GitError::Failed(stderr.into_owned()));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Locks the end-to-end working-tree loop across the facade: an untracked
    /// file becomes staged, commits, and then surfaces in the graph and detail.
    #[test]
    fn working_tree_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap().to_string();

        // Seed identity so commits succeed in an isolated repo.
        let repo = git2::Repository::init(dir.path()).unwrap();
        let mut cfg = repo.config().unwrap();
        cfg.set_str("user.name", "Test").unwrap();
        cfg.set_str("user.email", "test@example.com").unwrap();

        let svc = GitService::new(path);

        std::fs::write(dir.path().join("a.txt"), "hello\n").unwrap();

        // Untracked before staging.
        let st = svc.status().unwrap();
        assert!(st.untracked.contains(&"a.txt".to_string()));
        assert!(st.staged.is_empty());

        // Stage -> appears staged, no longer untracked.
        svc.stage(&["a.txt".to_string()]).unwrap();
        let st = svc.status().unwrap();
        assert_eq!(st.staged.len(), 1);
        assert!(st.untracked.is_empty());

        // Commit -> graph and detail reflect it.
        let sha = svc.commit("add a.txt").unwrap();
        let page = svc.graph(None, 10).unwrap();
        assert_eq!(page.commits.len(), 1);
        assert_eq!(page.commits[0].summary, "add a.txt");

        let detail = svc.detail(&sha).unwrap();
        assert_eq!(detail.files.len(), 1);
        assert_eq!(detail.files[0].path, "a.txt");
        assert!(detail.files[0].additions >= 1);

        // Patch text mentions the file.
        let patch = svc.file_patch(&sha, "a.txt").unwrap();
        assert!(patch.contains("a.txt"));
    }
}
