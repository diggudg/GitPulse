//! GitHub authentication & secure token management.
//!
//! Stores tokens in the native OS Keychain via `keyring`, with a transparent
//! fallback bridge to import existing credentials from `GITHUB_TOKEN`,
//! `COPILOT_GITHUB_TOKEN`, `~/.config/gh/hosts.yml`, or `gh auth token`.

use keyring::Entry;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

const SERVICE_NAME: &str = "com.gitpulse.app";
const ACCOUNT_NAME: &str = "github_token";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    pub has_token: bool,
    pub source: String,
}

fn command_execution_path() -> String {
    crate::copilot_sdk::command_execution_path()
}

pub fn resolve_gh_path() -> PathBuf {
    for dir in command_execution_path().split(':') {
        let candidate = PathBuf::from(dir).join("gh");
        if candidate.is_file() {
            return candidate;
        }
    }
    PathBuf::from("gh")
}

/// Retrieve the active GitHub personal access / OAuth token.
pub fn get_token() -> Option<String> {
    // 1. Check GITHUB_TOKEN environment variable
    if let Ok(token) = env::var("GITHUB_TOKEN") {
        let trimmed = token.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    // 2. Check COPILOT_GITHUB_TOKEN environment variable
    if let Ok(token) = env::var("COPILOT_GITHUB_TOKEN") {
        let trimmed = token.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }

    // 3. Live gh CLI credential (never cached, so it can't go stale)
    if let Some(token) = token_from_gh_cli().or_else(token_from_gh_hosts_file) {
        return Some(token);
    }

    // 4. Custom PAT saved in the native OS Keychain
    if let Ok(entry) = Entry::new(SERVICE_NAME, ACCOUNT_NAME) {
        if let Ok(password) = entry.get_password() {
            let trimmed = password.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }

    None
}

/// Save an access token securely in the native OS Keychain.
pub fn set_token(token: &str) -> Result<(), String> {
    let trimmed = token.trim();
    if trimmed.is_empty() {
        return Err("Token cannot be empty".to_string());
    }
    let entry = Entry::new(SERVICE_NAME, ACCOUNT_NAME).map_err(|e| e.to_string())?;
    entry.set_password(trimmed).map_err(|e| e.to_string())
}

/// Remove the stored token from the native OS Keychain.
pub fn delete_token() -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, ACCOUNT_NAME).map_err(|e| e.to_string())?;
    let _ = entry.delete_credential();
    Ok(())
}

/// Check current token source status.
pub fn auth_status() -> AuthStatus {
    if let Ok(token) = env::var("GITHUB_TOKEN") {
        if !token.trim().is_empty() {
            return AuthStatus {
                has_token: true,
                source: "Environment (GITHUB_TOKEN)".to_string(),
            };
        }
    }

    if let Ok(token) = env::var("COPILOT_GITHUB_TOKEN") {
        if !token.trim().is_empty() {
            return AuthStatus {
                has_token: true,
                source: "Environment (COPILOT_GITHUB_TOKEN)".to_string(),
            };
        }
    }

    if token_from_gh_cli().is_some() || token_from_gh_hosts_file().is_some() {
        return AuthStatus {
            has_token: true,
            source: "GitHub CLI (gh)".to_string(),
        };
    }

    if let Ok(entry) = Entry::new(SERVICE_NAME, ACCOUNT_NAME) {
        if let Ok(password) = entry.get_password() {
            if !password.trim().is_empty() {
                return AuthStatus {
                    has_token: true,
                    source: "OS Keychain".to_string(),
                };
            }
        }
    }

    AuthStatus {
        has_token: false,
        source: "None".to_string(),
    }
}

/// Parse ~/.config/gh/hosts.yml for github.com oauth_token.
fn token_from_gh_hosts_file() -> Option<String> {
    let home = env::var_os("HOME").map(PathBuf::from)?;
    let hosts_path = home.join(".config").join("gh").join("hosts.yml");
    let content = fs::read_to_string(hosts_path).ok()?;

    let mut in_github_com = false;
    for line in content.lines() {
        let trimmed = line.trim();
        if line.starts_with("github.com:") {
            in_github_com = true;
            continue;
        } else if !line.starts_with(' ') && !line.starts_with('\t') && line.ends_with(':') {
            in_github_com = false;
        }

        if in_github_com && trimmed.starts_with("oauth_token:") {
            if let Some((_, token)) = trimmed.split_once(':') {
                let token = token.trim();
                if !token.is_empty() {
                    return Some(token.to_string());
                }
            }
        }
    }
    None
}

/// Try running `gh auth token` as a fallback command.
pub fn token_from_gh_cli() -> Option<String> {
    let gh = resolve_gh_path();
    let output = Command::new(gh)
        .args(["auth", "token"])
        .env("PATH", command_execution_path())
        .output()
        .ok()?;

    if output.status.success() {
        let token = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !token.is_empty() {
            return Some(token);
        }
    }
    None
}

/// Launch browser-based GitHub CLI login and persist token.
pub fn open_gh_login() -> Result<String, String> {
    let gh = resolve_gh_path();
    let output = Command::new(&gh)
        .args(["auth", "login", "--web", "-h", "github.com"])
        .env("PATH", command_execution_path())
        .output()
        .map_err(|e| format!("Failed to launch GitHub CLI login: {e}. Check that GitHub CLI (gh) is installed."))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let message = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            format!("GitHub CLI login exited with status: {}", output.status)
        };
        return Err(message);
    }

    if let Some(token) = token_from_gh_cli() {
        let _ = set_token(&token);
        Ok(token)
    } else {
        Err("Signed in successfully via gh, but token could not be retrieved.".to_string())
    }
}
