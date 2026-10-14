//! GitHub Copilot SDK lifecycle, model discovery, and read-only review sessions.

use crate::git::{GitError, GitResult};
use github_copilot_sdk::{
    Client, ClientInfo, ClientMode, ClientOptions, Model, SessionConfig,
};
use github_copilot_sdk::types::MessageOptions;
use serde::Serialize;
use std::env;
use std::ffi::OsString;
use std::path::PathBuf;
use std::time::Duration;
use tokio::sync::RwLock;

/// Resolve standard system execution paths for macOS/Linux to ensure command binaries
/// (such as `gh` or `copilot`) can be located within packaged desktop GUI environments.
pub fn command_execution_path() -> String {
    let mut parts = Vec::new();
    if let Some(home) = env::var_os("HOME").map(PathBuf::from) {
        parts.push(home.join(".local/bin").to_string_lossy().to_string());
        parts.push(home.join("bin").to_string_lossy().to_string());
    }
    parts.push("/opt/homebrew/bin".to_string());
    parts.push("/usr/local/bin".to_string());
    parts.push("/usr/bin".to_string());
    parts.push("/bin".to_string());
    parts.push("/usr/sbin".to_string());
    parts.push("/sbin".to_string());
    if let Ok(path) = env::var("PATH") {
        for p in path.split(':') {
            if !parts.iter().any(|existing| existing == p) {
                parts.push(p.to_string());
            }
        }
    }
    parts.join(":")
}

fn resolve_copilot_base_directory(
    copilot_home: Option<OsString>,
    home: Option<OsString>,
) -> Result<PathBuf, String> {
    if let Some(copilot_home) = copilot_home.filter(|path| !path.is_empty()) {
        return Ok(PathBuf::from(copilot_home));
    }

    let home = home.filter(|path| !path.is_empty()).ok_or_else(|| {
        "Could not find the user's home directory for Copilot configuration.".to_string()
    })?;
    Ok(PathBuf::from(home).join(".copilot"))
}

pub fn copilot_base_directory() -> Result<PathBuf, String> {
    let base_directory =
        resolve_copilot_base_directory(env::var_os("COPILOT_HOME"), env::var_os("HOME"))?;
    std::fs::create_dir_all(&base_directory).map_err(|error| {
        format!(
            "Could not create Copilot configuration directory {}: {error}",
            base_directory.display()
        )
    })?;
    Ok(base_directory)
}

pub fn resolve_copilot_cli_path() -> Option<PathBuf> {
    // 1. Try bundled CLI extracted by github-copilot-sdk
    if let Some(path) = github_copilot_sdk::install_bundled_cli() {
        if path.is_file() {
            return Some(path);
        }
    }

    // 2. Check local caches where github-copilot-sdk extracts CLI
    if let Some(home) = env::var_os("HOME").map(PathBuf::from) {
        let cache_cli_dir = home.join("Library/Caches/github-copilot-sdk/cli");
        if let Ok(entries) = std::fs::read_dir(&cache_cli_dir) {
            for entry in entries.flatten() {
                let candidate = entry.path().join("copilot");
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }

    // 3. Check system PATH
    for dir in command_execution_path().split(':') {
        let candidate = PathBuf::from(dir).join("copilot");
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    None
}

pub struct CopilotSdk {
    client: RwLock<Option<Client>>,
}

impl Default for CopilotSdk {
    fn default() -> Self {
        Self {
            client: RwLock::new(None),
        }
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CopilotModelOption {
    pub id: String,
    pub name: String,
    pub provider: Option<String>,
    pub category: Option<String>,
    pub price_category: Option<String>,
    pub policy_state: Option<String>,
    pub warnings: Vec<String>,
    pub data_retention_warning: Option<String>,
    pub selectable: bool,
}

impl CopilotSdk {
    async fn start_client(&self) -> GitResult<Client> {
        let base_directory = copilot_base_directory()
            .map_err(|e| GitError::Failed(format!("Copilot configuration error: {e}")))?;

        let mut options = ClientOptions::new()
            .with_mode(ClientMode::CopilotCli)
            .with_base_directory(base_directory)
            .with_use_logged_in_user(true)
            .with_client_info(
                ClientInfo::new()
                    .with_application_name("GitPulse")
                    .with_application_version(env!("CARGO_PKG_VERSION")),
            );

        if let Some(token) = crate::github::auth::get_token() {
            options = options.with_github_token(token);
        } else if let Ok(token) = env::var("COPILOT_GITHUB_TOKEN") {
            let trimmed = token.trim();
            if !trimmed.is_empty() {
                options = options.with_github_token(trimmed);
            }
        }

        Client::start(options).await.map_err(|error| {
            GitError::Failed(format!(
                "Could not start the Copilot SDK runtime: {error}. Check your network connection and make sure this Mac is signed in to GitHub Copilot."
            ))
        })
    }

    async fn get_client(&self) -> GitResult<Client> {
        let read = self.client.read().await;
        if let Some(client) = read.as_ref() {
            return Ok(client.clone());
        }
        drop(read);

        let mut write = self.client.write().await;
        if let Some(client) = write.as_ref() {
            return Ok(client.clone());
        }
        let new_client = self.start_client().await?;
        *write = Some(new_client.clone());
        Ok(new_client)
    }

    pub async fn reset_client(&self) {
        let mut guard = self.client.write().await;
        if let Some(client) = guard.take() {
            let _ = client.stop().await;
        }
    }

    pub async fn open_login(&self) -> Result<(), String> {
        let cli_path = resolve_copilot_cli_path()
            .ok_or_else(|| "This build does not include the Copilot CLI sign-in tool.".to_string())?;
        let copilot_home = copilot_base_directory()?;

        // Reset the current client so the next operation picks up the freshly authenticated session.
        self.reset_client().await;

        tauri::async_runtime::spawn_blocking(move || {
            let output = std::process::Command::new(&cli_path)
                .arg("login")
                .arg("--web-flow")
                .env("COPILOT_HOME", &copilot_home)
                .env("PATH", command_execution_path())
                .output()
                .map_err(|error| format!("Failed to launch Copilot sign-in: {error}"))?;

            if output.status.success() {
                Ok(())
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let message = if !stderr.is_empty() {
                    stderr
                } else if !stdout.is_empty() {
                    stdout
                } else {
                    format!("Copilot sign-in exited with status: {}", output.status)
                };
                Err(message)
            }
        })
        .await
        .map_err(|join_error| format!("Failed to wait for sign-in process: {join_error}"))?
    }

    pub async fn list_models(&self) -> GitResult<Vec<CopilotModelOption>> {
        let client = self.get_client().await?;
        let models = client
            .list_models()
            .await
            .map_err(|error| {
                GitError::Failed(format!(
                    "Could not load Copilot models: {error}. Check your network connection and make sure this Mac is signed in to GitHub Copilot with access to the selected model."
                ))
            })?;

        Ok(models.into_iter().map(model_option).collect())
    }

    pub async fn review(&self, model_id: &str, prompt: String) -> GitResult<String> {
        if model_id.trim().is_empty() {
            return Err(GitError::Failed(
                "Select a Copilot model before reviewing pull requests.".into(),
            ));
        }

        let client = self.get_client().await?;
        let model = client
            .list_models()
            .await
            .map_err(|error| GitError::Failed(format!("Could not verify the selected model: {error}")))?
            .into_iter()
            .find(|model| model.id == model_id)
            .ok_or_else(|| {
                GitError::Failed(format!(
                    "The selected Copilot model `{model_id}` is no longer available. Choose another model."
                ))
            })?;
        if !model_is_selectable(&model) {
            return Err(GitError::Failed(format!(
                "The selected Copilot model `{model_id}` is disabled by policy. Choose another model."
            )));
        }

        let config = SessionConfig::default()
            .with_model(model_id)
            .with_available_tools(std::iter::empty::<String>())
            .with_mcp_servers(Default::default())
            .with_request_extensions(false)
            .with_enable_config_discovery(false)
            .with_enable_on_demand_instruction_discovery(false)
            .with_enable_skills(false)
            .with_enable_file_hooks(false)
            .with_enable_host_git_operations(false)
            .with_enable_session_store(false);
        let session = client.create_session(config).await.map_err(|error| {
            GitError::Failed(format!("Could not create a Copilot review session: {error}"))
        })?;

        let options = MessageOptions::new(prompt).with_wait_timeout(Duration::from_secs(180));
        let response = session.send_and_wait(options).await;
        let cleanup = session.disconnect().await;
        let event = response.map_err(|error| {
            GitError::Failed(format!("Copilot review failed: {error}"))
        })?;
        cleanup.map_err(|error| {
            GitError::Failed(format!("Could not close the Copilot review session: {error}"))
        })?;
        let event = event.ok_or_else(|| {
            GitError::Failed("Copilot completed without returning a review message.".into())
        })?;
        if event.event_type != "assistant.message" {
            return Err(GitError::Failed(format!(
                "Copilot returned `{}` instead of a review message.",
                event.event_type
            )));
        }
        let message: github_copilot_sdk::session_events::AssistantMessageData =
            serde_json::from_value(event.data).map_err(|error| {
                GitError::Failed(format!("Could not parse the Copilot review message: {error}"))
            })?;
        Ok(message.content)
    }
}


fn model_option(model: Model) -> CopilotModelOption {
    let policy_state = model.policy.as_ref().map(|policy| format!("{:?}", policy.state));
    let selectable = !policy_state
        .as_deref()
        .is_some_and(|state| state.eq_ignore_ascii_case("disabled"));
    let mut warnings = model
        .warning_messages
        .unwrap_or_default()
        .into_iter()
        .map(|message| message.message)
        .collect::<Vec<_>>();
    if let Some(info_messages) = model.info_messages {
        warnings.extend(info_messages.into_iter().map(|message| message.message));
    }

    CopilotModelOption {
        id: model.id,
        name: model.name,
        provider: model.provider.map(|provider| provider.label),
        category: model.model_picker_category.map(|category| format!("{category:?}")),
        price_category: model
            .model_picker_price_category
            .map(|category| format!("{category:?}")),
        policy_state,
        warnings,
        data_retention_warning: model.warning_text.and_then(|warning| warning.data_retention),
        selectable,
    }
}

fn model_is_selectable(model: &Model) -> bool {
    !model
        .policy
        .as_ref()
        .is_some_and(|policy| format!("{:?}", policy.state).eq_ignore_ascii_case("disabled"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disables_models_explicitly_blocked_by_policy() {
        let mut model = Model::default();
        model.id = "blocked".into();
        model.name = "Blocked".into();
        model.policy = Some(github_copilot_sdk::types::ModelPolicy {
            state: serde_json::from_str("\"disabled\"").unwrap(),
            terms: None,
        });
        assert!(!model_option(model).selectable);
    }

    #[test]
    fn model_without_policy_remains_selectable() {
        let model = Model {
            id: "available".into(),
            name: "Available".into(),
            ..Model::default()
        };
        assert!(model_option(model).selectable);
    }

    #[tokio::test]
    #[ignore = "requires Copilot sign-in and network access"]
    async fn signed_in_user_can_load_model_catalog() {
        let models = CopilotSdk::default().list_models().await.unwrap();
        assert!(!models.is_empty());
        assert!(models.iter().any(|model| model.selectable));
    }
}
