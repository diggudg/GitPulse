//! Native Git remote parsing for GitHub repositories.
//!
//! Extracts (owner, name) from local git remotes entirely offline,
//! eliminating the need to spawn `gh repo view`.

use crate::git::{GitError, GitResult};

/// Extracts `(owner, repo)` from standard GitHub remote URLs.
///
/// Supported formats:
/// - `git@github.com:owner/repo.git`
/// - `git@github.com:owner/repo`
/// - `https://github.com/owner/repo.git`
/// - `https://github.com/owner/repo`
/// - `https://user:token@github.com/owner/repo.git`
/// - `ssh://git@github.com/owner/repo.git`
pub fn parse_github_remote(url: &str) -> Option<(String, String)> {
    let clean = url.trim().trim_end_matches(".git");

    if let Some(path) = clean.strip_prefix("git@github.com:") {
        let (owner, name) = path.split_once('/')?;
        if !owner.is_empty() && !name.is_empty() {
            return Some((owner.to_string(), name.to_string()));
        }
    }

    if let Some(path) = clean.strip_prefix("ssh://git@github.com/") {
        let (owner, name) = path.split_once('/')?;
        if !owner.is_empty() && !name.is_empty() {
            return Some((owner.to_string(), name.to_string()));
        }
    }

    if let Ok(parsed) = url::Url::parse(clean) {
        if parsed.host_str() == Some("github.com") {
            let segments: Vec<&str> = parsed
                .path_segments()?
                .filter(|s| !s.is_empty())
                .collect();
            if segments.len() >= 2 {
                return Some((segments[0].to_string(), segments[1].to_string()));
            }
        }
    }

    None
}

/// Resolves `(owner, repo)` for a local git repository path by inspecting its remotes.
/// Checks `origin` first, then falls back to any remote pointing to `github.com`.
pub fn github_repo_from_path(path: &str) -> GitResult<(String, String)> {
    let repo = git2::Repository::open(path)?;

    // Check origin remote first
    if let Ok(remote) = repo.find_remote("origin") {
        if let Some(url) = remote.url() {
            if let Some(coords) = parse_github_remote(url) {
                return Ok(coords);
            }
        }
    }

    // Fall back to checking any other remote
    if let Ok(remotes) = repo.remotes() {
        for name in remotes.iter().flatten() {
            if name == "origin" {
                continue;
            }
            if let Ok(remote) = repo.find_remote(name) {
                if let Some(url) = remote.url() {
                    if let Some(coords) = parse_github_remote(url) {
                        return Ok(coords);
                    }
                }
            }
        }
    }

    Err(GitError::Failed(format!(
        "No github.com remote found for repository at {path}"
    )))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ssh_urls() {
        assert_eq!(
            parse_github_remote("git@github.com:polestar/gitpulse.git"),
            Some(("polestar".into(), "gitpulse".into()))
        );
        assert_eq!(
            parse_github_remote("git@github.com:diggudg/my-repo"),
            Some(("diggudg".into(), "my-repo".into()))
        );
        assert_eq!(
            parse_github_remote("ssh://git@github.com/polestar/backend.git"),
            Some(("polestar".into(), "backend".into()))
        );
    }

    #[test]
    fn parses_https_urls() {
        assert_eq!(
            parse_github_remote("https://github.com/polestar/gitpulse.git"),
            Some(("polestar".into(), "gitpulse".into()))
        );
        assert_eq!(
            parse_github_remote("https://github.com/diggudg/personal"),
            Some(("diggudg".into(), "personal".into()))
        );
        assert_eq!(
            parse_github_remote("https://oauth2:ghp_123456@github.com/polestar/secure.git"),
            Some(("polestar".into(), "secure".into()))
        );
    }

    #[test]
    fn rejects_non_github_urls() {
        assert_eq!(parse_github_remote("https://gitlab.com/owner/repo.git"), None);
        assert_eq!(parse_github_remote("git@bitbucket.org:owner/repo.git"), None);
        assert_eq!(parse_github_remote("invalid-url"), None);
    }
}
