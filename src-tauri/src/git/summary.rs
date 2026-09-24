//! Per-repository workspace summary: the live signals the Launchpad and sidebar
//! surface (uncommitted work, divergence from upstream). Reuses `repo::open` for
//! name/head and `status` for the working-tree scan (DRY); only the ahead/behind
//! calculation is new here.

use super::{repo, status, GitResult};
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoSummary {
    pub path: String,
    pub name: String,
    pub head: Option<String>,
    /// Count of staged + unstaged + untracked entries (work in progress).
    pub wip_count: usize,
    /// Commits the local branch is ahead / behind its upstream.
    pub ahead: usize,
    pub behind: usize,
    pub has_upstream: bool,
}

pub fn summary(path: &str) -> GitResult<RepoSummary> {
    let meta = repo::open(path)?;
    let st = status::status(path)?;
    let wip_count = st.staged.len() + st.unstaged.len() + st.untracked.len();

    let (ahead, behind, has_upstream) = ahead_behind(path)?;

    Ok(RepoSummary {
        path: meta.path,
        name: meta.name,
        head: meta.head,
        wip_count,
        ahead,
        behind,
        has_upstream,
    })
}

/// Divergence of the current branch from its configured upstream. Repos with a
/// detached HEAD or no upstream report `(0, 0, false)` rather than erroring.
fn ahead_behind(path: &str) -> GitResult<(usize, usize, bool)> {
    let repo = git2::Repository::open(path)?;
    let head = match repo.head() {
        Ok(h) if h.is_branch() => h,
        _ => return Ok((0, 0, false)),
    };
    let Some(local_oid) = head.target() else {
        return Ok((0, 0, false));
    };
    let branch = git2::Branch::wrap(head);
    let upstream = match branch.upstream() {
        Ok(u) => u,
        Err(_) => return Ok((0, 0, false)),
    };
    let Some(up_oid) = upstream.get().target() else {
        return Ok((0, 0, false));
    };
    let (ahead, behind) = repo.graph_ahead_behind(local_oid, up_oid)?;
    Ok((ahead, behind, true))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn summary_reports_wip_and_no_upstream() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().to_str().unwrap();
        let repo = git2::Repository::init(dir.path()).unwrap();
        let mut cfg = repo.config().unwrap();
        cfg.set_str("user.name", "Test").unwrap();
        cfg.set_str("user.email", "test@example.com").unwrap();

        std::fs::write(dir.path().join("a.txt"), "hello\n").unwrap();

        let s = summary(path).unwrap();
        assert_eq!(s.wip_count, 1); // one untracked file
        assert!(!s.has_upstream);
        assert_eq!(s.ahead, 0);
        assert_eq!(s.behind, 0);
    }
}
