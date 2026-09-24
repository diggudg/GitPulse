//! Repository references: branches/tags via gix, stashes via git2.
//!
//! Drives the left refs tree. `enumerate_refs` is the shared low-level iteration
//! reused by the commit-graph's ref index (DRY).

use super::{GitError, GitResult};
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefEntry {
    /// Short name, e.g. "main" or "origin/main".
    pub name: String,
    /// Full ref name, e.g. "refs/heads/main".
    pub full_name: String,
    pub target_sha: String,
    pub is_head: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StashEntry {
    pub index: usize,
    pub message: String,
    pub sha: String,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RepoRefs {
    pub head: Option<String>,
    pub local_branches: Vec<RefEntry>,
    pub remote_branches: Vec<RefEntry>,
    pub tags: Vec<RefEntry>,
    pub stashes: Vec<StashEntry>,
}

/// Enumerate every reference as `(full_name, target_sha)`. Shared with the graph
/// ref index so the gix iteration lives in exactly one place.
pub(crate) fn enumerate_refs(repo: &gix::Repository) -> GitResult<Vec<(String, String)>> {
    let platform = repo
        .references()
        .map_err(|e| GitError::Failed(e.to_string()))?;
    let mut out = Vec::new();
    for r in platform.all().map_err(|e| GitError::Failed(e.to_string()))? {
        let mut r = match r {
            Ok(r) => r,
            Err(_) => continue,
        };
        let full = r.name().as_bstr().to_string();
        let Ok(id) = r.peel_to_id_in_place() else {
            continue;
        };
        out.push((full, id.to_hex().to_string()));
    }
    Ok(out)
}

pub fn list_refs(path: &str) -> GitResult<RepoRefs> {
    let repo = gix::open(path).map_err(|_| GitError::NotARepo(path.to_string()))?;
    let head_name = repo
        .head_ref()
        .ok()
        .flatten()
        .map(|r| r.name().shorten().to_string());

    let mut refs = RepoRefs {
        head: head_name.clone(),
        ..Default::default()
    };

    for (full, sha) in enumerate_refs(&repo)? {
        if let Some(n) = full.strip_prefix("refs/heads/") {
            let is_head = head_name.as_deref() == Some(n);
            refs.local_branches.push(RefEntry {
                name: n.to_string(),
                full_name: full,
                target_sha: sha,
                is_head,
            });
        } else if let Some(n) = full.strip_prefix("refs/remotes/") {
            refs.remote_branches.push(RefEntry {
                name: n.to_string(),
                full_name: full,
                target_sha: sha,
                is_head: false,
            });
        } else if let Some(n) = full.strip_prefix("refs/tags/") {
            refs.tags.push(RefEntry {
                name: n.to_string(),
                full_name: full,
                target_sha: sha,
                is_head: false,
            });
        }
    }

    refs.local_branches.sort_by(|a, b| a.name.cmp(&b.name));
    refs.remote_branches.sort_by(|a, b| a.name.cmp(&b.name));
    refs.tags.sort_by(|a, b| a.name.cmp(&b.name));
    refs.stashes = list_stashes(path)?;

    Ok(refs)
}

fn list_stashes(path: &str) -> GitResult<Vec<StashEntry>> {
    let mut repo = git2::Repository::open(path)?;
    let mut out = Vec::new();
    repo.stash_foreach(|index, message, oid| {
        out.push(StashEntry {
            index,
            message: message.to_string(),
            sha: oid.to_string(),
        });
        true
    })?;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_branches_and_tags() {
        let dir = tempfile::tempdir().unwrap();
        let repo = git2::Repository::init(dir.path()).unwrap();
        let sig = git2::Signature::now("Test", "test@example.com").unwrap();
        let tree_id = repo.index().unwrap().write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let oid = repo
            .commit(Some("HEAD"), &sig, &sig, "init", &tree, &[])
            .unwrap();
        let commit = repo.find_commit(oid).unwrap();
        repo.branch("feature", &commit, false).unwrap();
        repo.tag_lightweight("v1", commit.as_object(), false).unwrap();

        let refs = list_refs(dir.path().to_str().unwrap()).unwrap();
        assert!(refs.head.is_some());
        assert!(refs.local_branches.iter().any(|b| b.name == "feature"));
        assert!(refs.tags.iter().any(|t| t.name == "v1"));
        assert!(refs.tags.iter().all(|t| t.target_sha == oid.to_string()));
    }
}
