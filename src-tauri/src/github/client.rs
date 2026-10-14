//! GitHub API client wrapper using octocrab and reqwest.

use crate::git::{GitError, GitResult};
use super::auth;

pub struct GitHubClient {
    pub octocrab: octocrab::Octocrab,
    pub token: String,
    http: reqwest::Client,
}

impl GitHubClient {
    pub fn new() -> GitResult<Self> {
        let token = auth::get_token().ok_or_else(|| {
            GitError::Failed(
                "No GitHub authentication token found. Please sign in via GitHub CLI or save a Personal Access Token in Settings."
                    .to_string(),
            )
        })?;

        let octocrab = octocrab::Octocrab::builder()
            .personal_token(token.clone())
            .build()
            .map_err(|e| GitError::Failed(format!("Failed to initialize octocrab client: {e}")))?;

        let http = reqwest::Client::builder()
            .user_agent("GitPulse/0.1.0")
            .build()
            .map_err(|e| GitError::Failed(format!("Failed to build HTTP client: {e}")))?;

        Ok(Self {
            octocrab,
            token,
            http,
        })
    }

    /// Retrieve the login username for the authenticated token.
    pub async fn current_user(&self) -> GitResult<String> {
        let user = self
            .octocrab
            .current()
            .user()
            .await
            .map_err(|e| GitError::Failed(format!("Failed to fetch GitHub user: {e}")))?;
        Ok(user.login)
    }

    /// Fetch raw unified diff for a pull request using `Accept: application/vnd.github.diff`.
    pub async fn pull_request_diff(&self, owner: &str, repo: &str, number: u64) -> GitResult<String> {
        let url = format!("https://api.github.com/repos/{owner}/{repo}/pulls/{number}");
        let response = self
            .http
            .get(&url)
            .header("Accept", "application/vnd.github.diff")
            .header("Authorization", format!("Bearer {}", self.token))
            .send()
            .await
            .map_err(|e| GitError::Failed(format!("Failed to request PR diff: {e}")))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(GitError::Failed(format!(
                "GitHub API returned error {status} for PR #{number} diff: {body}"
            )));
        }

        response
            .text()
            .await
            .map_err(|e| GitError::Failed(format!("Failed to read PR diff body: {e}")))
    }
}
