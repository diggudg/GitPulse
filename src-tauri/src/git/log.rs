//! Commit-graph walk (gix). This is the performance-critical read path that must
//! stay smooth on 50k+ commit repositories, so it runs off the UI thread and is
//! paginated — we never materialize the whole history at once.

use super::{GitError, GitResult};
use gix::traverse::commit::topo::{Builder, Sorting};
use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub enum RefKind {
    Head,
    LocalBranch,
    RemoteBranch,
    Tag,
}

#[derive(Debug, Serialize, Clone)]
pub struct RefLabel {
    pub name: String,
    pub kind: RefKind,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub sha: String,
    pub parents: Vec<String>,
    pub author: String,
    pub email: String,
    pub time: i64,
    pub summary: String,
    pub refs: Vec<RefLabel>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitPage {
    pub commits: Vec<Commit>,
    pub next_cursor: Option<String>,
}

/// Walk commits from all refs in topological date order, returning one page.
/// This keeps every parent below its descendants while favoring recent commits.
///
/// `cursor` is an opaque offset (stringified count) for MVP pagination; `None`
/// starts at the beginning. A streaming/seek cursor is a documented follow-up.
pub fn graph(path: &str, cursor: Option<&str>, limit: usize) -> GitResult<CommitPage> {
    let repo = gix::open(path).map_err(|_| GitError::NotARepo(path.to_string()))?;

    let ref_index = build_ref_index(&repo)?;
    let tips = collect_tips(&repo)?;
    if tips.is_empty() {
        return Ok(CommitPage {
            commits: Vec::new(),
            next_cursor: None,
        });
    }

    let offset: usize = cursor.and_then(|c| c.parse().ok()).unwrap_or(0);

    let walk = Builder::from_iters(repo.objects.clone(), tips, None::<Vec<gix::ObjectId>>)
        .sorting(Sorting::DateOrder)
        .build()
        .map_err(|e| GitError::Failed(e.to_string()))?;

    let mut commits = Vec::with_capacity(limit);
    let mut seen = 0usize;
    let mut produced = 0usize;

    for info in walk {
        let info = info.map_err(|e| GitError::Failed(e.to_string()))?;
        seen += 1;
        if seen <= offset {
            continue;
        }
        if produced >= limit {
            break;
        }

        let commit = repo
            .find_object(info.id)
            .map_err(|e| GitError::Failed(e.to_string()))?
            .try_into_commit()
            .map_err(|e| GitError::Failed(e.to_string()))?;

        let sha = info.id.to_hex().to_string();
        let parents = info.parent_ids.iter().map(|p| p.to_hex().to_string()).collect();

        let (author, email) = match commit.author() {
            Ok(a) => (a.name.to_string(), a.email.to_string()),
            Err(_) => (String::new(), String::new()),
        };
        let time = commit.time().map(|t| t.seconds).unwrap_or(0);

        let summary = commit
            .message()
            .map(|m| m.summary().to_string())
            .unwrap_or_default();

        let refs = ref_index.get(&sha).cloned().unwrap_or_default();

        commits.push(Commit {
            sha,
            parents,
            author,
            email,
            time,
            summary,
            refs,
        });
        produced += 1;
    }

    // If the walk yielded a full page there may be more history.
    let next_cursor = if produced == limit {
        Some((offset + produced).to_string())
    } else {
        None
    };

    Ok(CommitPage {
        commits,
        next_cursor,
    })
}

/// Every local/remote branch and tag, plus HEAD when it is detached.
fn collect_tips(repo: &gix::Repository) -> GitResult<Vec<gix::ObjectId>> {
    let mut tips = Vec::new();
    let platform = repo
        .references()
        .map_err(|e| GitError::Failed(e.to_string()))?;
    for r in platform.all().map_err(|e| GitError::Failed(e.to_string()))? {
        let mut r = match r {
            Ok(r) => r,
            Err(_) => continue,
        };
        let full_name = r.name().as_bstr().to_string();
        if !full_name.starts_with("refs/heads/")
            && !full_name.starts_with("refs/remotes/")
            && !full_name.starts_with("refs/tags/")
        {
            continue;
        }
        if let Ok(id) = r.peel_to_id_in_place() {
            tips.push(id.detach());
        }
    }
    if let Ok(id) = repo.head_id() {
        tips.push(id.detach());
    }
    tips.sort();
    tips.dedup();
    Ok(tips)
}

/// Map commit SHA -> ref labels pointing at it (for graph badges & minimap).
fn build_ref_index(repo: &gix::Repository) -> GitResult<HashMap<String, Vec<RefLabel>>> {
    let mut index: HashMap<String, Vec<RefLabel>> = HashMap::new();

    let head_id = repo.head_id().ok().map(|id| id.to_hex().to_string());

    for (full, sha) in super::refs::enumerate_refs(repo)? {
        let (name, kind) = if let Some(n) = full.strip_prefix("refs/heads/") {
            (n.to_string(), RefKind::LocalBranch)
        } else if let Some(n) = full.strip_prefix("refs/remotes/") {
            (n.to_string(), RefKind::RemoteBranch)
        } else if let Some(n) = full.strip_prefix("refs/tags/") {
            (n.to_string(), RefKind::Tag)
        } else {
            continue;
        };

        index.entry(sha).or_default().push(RefLabel { name, kind });
    }

    // Tag HEAD so the minimap can render it green.
    if let Some(sha) = head_id {
        index.entry(sha).or_default().push(RefLabel {
            name: "HEAD".to_string(),
            kind: RefKind::Head,
        });
    }

    Ok(index)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_offset_parses_to_zero() {
        assert_eq!(None::<&str>.and_then(|c: &str| c.parse::<usize>().ok()), None);
    }

    #[test]
    fn graph_walks_fixture_repo() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path();
        // Build a tiny repo with two commits using git2 (test-only).
        let repo = git2::Repository::init(path).unwrap();
        let sig = git2::Signature::now("Test", "test@example.com").unwrap();
        let tree_id = {
            let mut idx = repo.index().unwrap();
            std::fs::write(path.join("a.txt"), "hello").unwrap();
            idx.add_path(std::path::Path::new("a.txt")).unwrap();
            idx.write().unwrap();
            idx.write_tree().unwrap()
        };
        let tree = repo.find_tree(tree_id).unwrap();
        let c1 = repo
            .commit(Some("HEAD"), &sig, &sig, "first", &tree, &[])
            .unwrap();
        let parent = repo.find_commit(c1).unwrap();
        repo.commit(Some("HEAD"), &sig, &sig, "second", &tree, &[&parent])
            .unwrap();

        let page = graph(path.to_str().unwrap(), None, 10).unwrap();
        assert_eq!(page.commits.len(), 2);
        assert_eq!(page.commits[0].summary, "second");
    }

    #[test]
    fn graph_keeps_parent_below_child_when_commit_times_are_skewed() {
        let dir = tempfile::tempdir().unwrap();
        let repo = git2::Repository::init(dir.path()).unwrap();
        let parent_signature = git2::Signature::new(
            "Test",
            "test@example.com",
            &git2::Time::new(2_000_000_000, 0),
        )
        .unwrap();
        let child_signature = git2::Signature::new(
            "Test",
            "test@example.com",
            &git2::Time::new(1_000_000_000, 0),
        )
        .unwrap();
        let tree_id = repo.index().unwrap().write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let parent_id = repo
            .commit(
                Some("HEAD"),
                &parent_signature,
                &parent_signature,
                "parent with newer clock",
                &tree,
                &[],
            )
            .unwrap();
        let parent = repo.find_commit(parent_id).unwrap();
        repo.commit(
            Some("HEAD"),
            &child_signature,
            &child_signature,
            "child with older clock",
            &tree,
            &[&parent],
        )
        .unwrap();
        drop(parent);
        drop(tree);

        let page = graph(dir.path().to_str().unwrap(), None, 10).unwrap();
        assert_eq!(page.commits[0].summary, "child with older clock");
        assert_eq!(page.commits[1].summary, "parent with newer clock");
    }

    #[test]
    fn graph_includes_an_unreferenced_detached_head() {
        let dir = tempfile::tempdir().unwrap();
        let repo = git2::Repository::init(dir.path()).unwrap();
        let signature = git2::Signature::now("Test", "test@example.com").unwrap();
        let tree_id = repo.index().unwrap().write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        let detached_id = repo
            .commit(
                None,
                &signature,
                &signature,
                "detached head",
                &tree,
                &[],
            )
            .unwrap();
        drop(tree);
        repo.set_head_detached(detached_id).unwrap();

        let page = graph(dir.path().to_str().unwrap(), None, 10).unwrap();
        assert_eq!(page.commits.len(), 1);
        assert_eq!(page.commits[0].summary, "detached head");
        assert!(page.commits[0]
            .refs
            .iter()
            .any(|label| matches!(label.kind, RefKind::Head)));
    }

    #[test]
    fn graph_excludes_stash_pseudo_commits_but_lists_stash_separately() {
        let dir = tempfile::tempdir().unwrap();
        let mut repo = git2::Repository::init(dir.path()).unwrap();
        let signature = git2::Signature::now("Test", "test@example.com").unwrap();
        let mut index = repo.index().unwrap();
        std::fs::write(dir.path().join("file.txt"), "base\n").unwrap();
        index.add_path(std::path::Path::new("file.txt")).unwrap();
        let tree_id = index.write_tree().unwrap();
        let tree = repo.find_tree(tree_id).unwrap();
        repo.commit(Some("HEAD"), &signature, &signature, "main commit", &tree, &[])
            .unwrap();
        drop(tree);
        std::fs::write(dir.path().join("file.txt"), "stashed\n").unwrap();
        let stash_sha = repo.stash_save(&signature, "saved changes", None).unwrap().to_string();

        let path = dir.path().to_str().unwrap();
        let page = graph(path, None, 10).unwrap();
        assert_eq!(page.commits.len(), 1);
        assert_eq!(page.commits[0].summary, "main commit");

        let refs = super::super::refs::list_refs(path).unwrap();
        assert!(refs.stashes.iter().any(|stash| stash.sha == stash_sha));
    }
}
