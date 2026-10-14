import { useEffect, useMemo, useState } from "react";
import { Bot, Copy, ExternalLink, Key, Trash2, X, Check } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { RepoMeta } from "@/lib/ipc";
import {
  clearGithubToken,
  copilotOpenLogin,
  getGithubAuthStatus,
  githubOpenLogin,
  listCopilotModels,
  listPullRequests,
  prReviewEnvironment,
  reviewPullRequest,
  saveGithubToken,
  type GithubAuthStatus,
} from "@/lib/ipc";
import { reviewErrorMessage, runPrReviewCycle } from "./usePrReviewAutomation";
import { usePrReviewStore, type PrReviewMode } from "@/stores/prReviewStore";

const MODE_OPTIONS: { value: PrReviewMode; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "allNew", label: "All new PRs" },
  { value: "authoredByMe", label: "Only PRs authored by me" },
  { value: "allOpen", label: "All open PRs" },
];

export function PrReviewSettings({
  repos,
  onClose,
}: {
  repos: RepoMeta[];
  onClose: () => void;
}) {
  const mode = usePrReviewStore((state) => state.mode);
  const modeStartedAt = usePrReviewStore((state) => state.modeStartedAt);
  const excludedRepos = usePrReviewStore((state) => state.excludedRepos);
  const setMode = usePrReviewStore((state) => state.setMode);
  const selectedModelId = usePrReviewStore((state) => state.selectedModelId);
  const setSelectedModelId = usePrReviewStore((state) => state.setSelectedModelId);
  const availableModels = usePrReviewStore((state) => state.availableModels);
  const setAvailableModels = usePrReviewStore((state) => state.setAvailableModels);
  const modelsLoading = usePrReviewStore((state) => state.modelsLoading);
  const setModelsLoading = usePrReviewStore((state) => state.setModelsLoading);
  const modelsError = usePrReviewStore((state) => state.modelsError);
  const setModelsError = usePrReviewStore((state) => state.setModelsError);
  const setRepoExcluded = usePrReviewStore((state) => state.setRepoExcluded);
  const environment = usePrReviewStore((state) => state.environment);
  const setEnvironment = usePrReviewStore((state) => state.setEnvironment);
  const globalError = usePrReviewStore((state) => state.globalError);
  const setGlobalError = usePrReviewStore((state) => state.setGlobalError);
  const recordDiagnostic = usePrReviewStore((state) => state.recordDiagnostic);
  const repoErrors = usePrReviewStore((state) => state.repoErrors);
  const history = usePrReviewStore((state) => state.history);
  const reviewing = usePrReviewStore((state) => state.reviewing);
  const diagnostics = usePrReviewStore((state) => state.diagnostics);
  const clearDiagnostics = usePrReviewStore((state) => state.clearDiagnostics);
  const lastCycleSummary = usePrReviewStore((state) => state.lastCycleSummary);
  const setLastCycleSummary = usePrReviewStore((state) => state.setLastCycleSummary);
  const recordReview = usePrReviewStore((state) => state.recordReview);
  const clearAttempt = usePrReviewStore((state) => state.clearAttempt);

  const [checkingConnection, setCheckingConnection] = useState(false);
  const [authStatus, setAuthStatus] = useState<GithubAuthStatus | null>(null);
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [copilotLoginLoading, setCopilotLoginLoading] = useState(false);
  const [copilotLoginMessage, setCopilotLoginMessage] = useState<string | null>(null);
  const [ghLoginLoading, setGhLoginLoading] = useState(false);
  const [ghLoginMessage, setGhLoginMessage] = useState<string | null>(null);

  const [manualRepoPath, setManualRepoPath] = useState(repos[0]?.path ?? "");
  const [manualPrNumber, setManualPrNumber] = useState("");
  const [manualReviewLoading, setManualReviewLoading] = useState(false);
  const [manualReviewStatus, setManualReviewStatus] = useState<string | null>(null);
  const [manualReviewError, setManualReviewError] = useState<string | null>(null);
  const [manualReviewSuccess, setManualReviewSuccess] = useState<string | null>(null);

  const recentReviews = useMemo(
    () =>
      Object.values(history)
        .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))
        .slice(0, 8),
    [history],
  );
  const includedRepoCount = repos.filter((repo) => !excludedRepos.includes(repo.path)).length;
  const selectedModel = availableModels.find((model) => model.id === selectedModelId);
  const selectedModelIsAvailable = selectedModel?.selectable === true;

  const loadGithubStatus = async () => {
    try {
      const status = await getGithubAuthStatus();
      setAuthStatus(status);
    } catch {
      // ignore
    }

    try {
      const result = await prReviewEnvironment();
      setEnvironment(result);
      setGlobalError(null);
    } catch (error) {
      const message = reviewErrorMessage(error);
      setGlobalError(message);
      recordDiagnostic(null, null, message);
    }
  };

  const loadModels = async () => {
    setModelsLoading(true);
    try {
      const models = await listCopilotModels();
      setAvailableModels(models);
      setModelsError(null);
    } catch (error) {
      const message = reviewErrorMessage(error);
      setModelsError(message);
      recordDiagnostic(null, null, message);
    } finally {
      setModelsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void getGithubAuthStatus().then((status) => {
      if (active) setAuthStatus(status);
    });
    prReviewEnvironment()
      .then((result) => {
        if (active) {
          setEnvironment(result);
          setGlobalError(null);
        }
      })
      .catch((error) => {
        if (active) {
          const message = reviewErrorMessage(error);
          setGlobalError(message);
          recordDiagnostic(null, null, message);
        }
      });
    setModelsLoading(true);
    listCopilotModels()
      .then((models) => {
        if (active) {
          setAvailableModels(models);
          setModelsError(null);
        }
      })
      .catch((error) => {
        if (active) {
          const message = reviewErrorMessage(error);
          setModelsError(message);
          recordDiagnostic(null, null, message);
        }
      })
      .finally(() => {
        if (active) setModelsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    recordDiagnostic,
    setAvailableModels,
    setEnvironment,
    setGlobalError,
    setModelsError,
    setModelsLoading,
  ]);

  async function retryConnection() {
    setCheckingConnection(true);
    await Promise.allSettled([loadGithubStatus(), loadModels()]);
    setCheckingConnection(false);
  }

  async function handleCopilotSignIn() {
    setCopilotLoginLoading(true);
    setCopilotLoginMessage(
      "Opening browser for GitHub Copilot authorization. Complete sign-in there, then return here.",
    );
    try {
      await copilotOpenLogin();
      setCopilotLoginMessage("Sign-in completed! Refreshing models…");
      await loadModels();
      setCopilotLoginMessage(null);
    } catch (error) {
      const message = reviewErrorMessage(error);
      setModelsError(message);
      recordDiagnostic(null, null, message);
      setCopilotLoginMessage(null);
    } finally {
      setCopilotLoginLoading(false);
    }
  }

  async function handleGhSignIn() {
    setGhLoginLoading(true);
    setGhLoginMessage(
      "Opening browser for GitHub CLI authorization. Complete sign-in there, then return here.",
    );
    try {
      await githubOpenLogin();
      setGhLoginMessage("Sign-in completed! Updating GitHub status…");
      await loadGithubStatus();
      setGhLoginMessage(null);
    } catch (error) {
      const message = reviewErrorMessage(error);
      setGlobalError(message);
      recordDiagnostic(null, null, message);
      setGhLoginMessage(null);
    } finally {
      setGhLoginLoading(false);
    }
  }

  async function handleSaveToken() {
    if (!tokenInput.trim()) return;
    try {
      await saveGithubToken(tokenInput.trim());
      setTokenInput("");
      setShowTokenInput(false);
      await loadGithubStatus();
      if (availableModels.length === 0 || modelsError) {
        await loadModels();
      }
    } catch (error) {
      const message = reviewErrorMessage(error);
      setGlobalError(message);
      recordDiagnostic(null, null, message);
    }
  }

  async function handleClearToken() {
    try {
      await clearGithubToken();
      setEnvironment(null);
      await loadGithubStatus();
    } catch (error) {
      const message = reviewErrorMessage(error);
      setGlobalError(message);
      recordDiagnostic(null, null, message);
    }
  }

  useEffect(() => {
    if (!manualRepoPath && repos.length > 0) {
      setManualRepoPath(repos[0].path);
    }
  }, [repos, manualRepoPath]);

  async function handleManualReview() {
    if (!manualRepoPath || !manualPrNumber.trim()) return;
    const prNum = parseInt(manualPrNumber.trim(), 10);
    if (isNaN(prNum) || prNum <= 0) {
      setManualReviewError("Please enter a valid positive PR number.");
      return;
    }
    if (!selectedModelId) {
      setManualReviewError("Please select a Copilot model first.");
      return;
    }

    setManualReviewLoading(true);
    setManualReviewError(null);
    setManualReviewSuccess(null);
    setManualReviewStatus(`Starting review for PR #${prNum} using ${selectedModelId}…`);

    try {
      setManualReviewStatus(`Fetching PR #${prNum} diff, generating Copilot review…`);
      const response = await reviewPullRequest(manualRepoPath, prNum, selectedModelId);
      let title = `PR #${prNum}`;
      try {
        const prs = await listPullRequests(manualRepoPath);
        const found = prs.find((p) => p.number === prNum);
        if (found) title = found.title;
      } catch {
        // ignore title fetch failure
      }

      const key = `${response.repo}#${response.number}`;
      clearAttempt(key);
      recordReview(key, {
        ...response,
        title,
        reviewedAt: new Date().toISOString(),
      });

      setManualReviewSuccess(response.reviewUrl);
      setManualReviewStatus(
        `PR #${prNum} review submitted successfully! (${response.event === "APPROVE" ? "Approved" : "Commented"}, ${response.findings.length} findings)`,
      );
    } catch (error) {
      const message = reviewErrorMessage(error);
      setManualReviewError(message);
      recordDiagnostic(manualRepoPath, prNum, message);
      setManualReviewStatus(null);
    } finally {
      setManualReviewLoading(false);
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-bg">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
        <Bot size={17} className="text-accent" />
        <h2 className="font-semibold text-fg">Automated PR reviews</h2>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded p-1 text-fg-muted hover:bg-bg-inset hover:text-fg"
          title="Close PR review settings"
          aria-label="Close PR review settings"
        >
          <X size={15} />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {/* GitHub Authentication Card */}
        <div className="rounded-md border border-border bg-bg-elevated p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Key size={14} className="text-accent" />
              <span className="text-xs font-semibold text-fg">GitHub Authentication</span>
              {environment && (
                <span className="rounded bg-bg-inset px-1.5 py-0.5 text-xs text-fg-muted">
                  @{environment.githubUser} ({environment.authSource})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleGhSignIn()}
                disabled={ghLoginLoading}
                className="rounded border border-border px-2 py-0.5 text-xs hover:bg-bg-inset disabled:opacity-50"
                title="Sign in via GitHub CLI (gh auth login)"
              >
                {ghLoginLoading ? "Signing in…" : "Sign in via gh"}
              </button>
              <button
                type="button"
                onClick={() => setShowTokenInput((v) => !v)}
                className="rounded border border-border px-2 py-0.5 text-xs hover:bg-bg-inset"
              >
                {showTokenInput ? "Cancel" : "Set Custom PAT"}
              </button>
              {(authStatus?.hasToken || environment) && (
                <button
                  type="button"
                  onClick={() => void handleClearToken()}
                  className="rounded border border-border px-2 py-0.5 text-xs text-fg-muted hover:text-danger"
                  title="Clear token from OS Keychain"
                >
                  Clear Token
                </button>
              )}
            </div>
          </div>

          {ghLoginMessage && (
            <div className="mt-2 text-xs text-accent">{ghLoginMessage}</div>
          )}

          {showTokenInput && (
            <div className="mt-2.5 flex items-center gap-2 border-t border-border pt-2.5">
              <input
                type="password"
                placeholder="github_pat_... or ghp_..."
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="min-w-64 flex-1 rounded border border-border bg-bg-inset px-2.5 py-1 text-xs text-fg font-mono"
              />
              <button
                type="button"
                onClick={() => void handleSaveToken()}
                className="flex items-center gap-1 rounded bg-accent px-2.5 py-1 text-xs text-accent-fg font-medium"
              >
                <Check size={12} /> Save to Keychain
              </button>
            </div>
          )}

          {environment ? (
            <div className="mt-2 text-[11px] text-fg-muted">
              Signed in as @{environment.githubUser} via {environment.authSource}
            </div>
          ) : globalError ? (
            <div className="mt-2 flex items-center justify-between gap-2 text-xs text-danger">
              <span className="truncate">{globalError}</span>
              <button
                type="button"
                onClick={() => void loadGithubStatus()}
                className="shrink-0 underline hover:text-fg"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="mt-2 text-[11px] text-fg-muted">
              GitHub token is needed to fetch PRs, resolve review threads, and submit reviews.
            </div>
          )}
        </div>

        {/* Copilot Engine & Review Configuration Card */}
        <div className="rounded-md border border-border bg-bg-elevated p-3">
          <div className="mb-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot size={14} className="text-accent" />
              <span className="text-xs font-semibold text-fg">GitHub Copilot</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopilotSignIn()}
                disabled={copilotLoginLoading || modelsLoading}
                className="rounded border border-border px-2 py-0.5 text-xs text-fg hover:bg-bg-inset disabled:opacity-50"
              >
                {copilotLoginLoading ? "Opening browser…" : "Sign in to Copilot"}
              </button>
              <button
                type="button"
                onClick={() => void loadModels()}
                disabled={modelsLoading || copilotLoginLoading}
                className="rounded border border-border px-2 py-0.5 text-xs text-fg-muted hover:text-fg hover:bg-bg-inset disabled:opacity-50"
                title="Refresh Copilot models list"
              >
                {modelsLoading ? "Loading…" : "Refresh"}
              </button>
            </div>
          </div>

          {copilotLoginMessage && (
            <div className="mb-2.5 rounded bg-accent/10 p-2 text-xs text-accent">
              {copilotLoginMessage}
            </div>
          )}

          {modelsError && (
            <div className="mb-2.5 rounded bg-danger/10 p-2 text-xs text-danger">
              <span className="font-medium">Copilot models unavailable: </span>
              {modelsError}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs text-fg-muted">
              Copilot model
              <select
                value={selectedModelIsAvailable ? selectedModelId ?? "" : ""}
                onChange={(event) => setSelectedModelId(event.target.value || null)}
                disabled={modelsLoading || availableModels.length === 0}
                className="rounded-md border border-border bg-bg-inset px-2.5 py-2 text-sm text-fg disabled:opacity-50"
              >
                <option value="">
                  {modelsLoading
                    ? "Loading models…"
                    : availableModels.length === 0
                      ? "No models available (sign in required)"
                      : "Select a model (no default)"}
                </option>
                {availableModels.map((model) => (
                  <option key={model.id} value={model.id} disabled={!model.selectable}>
                    {model.name} ({model.id})
                    {model.provider ? ` — ${model.provider}` : ""}
                    {!model.selectable ? " — disabled by policy" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-56 flex-col gap-1 text-xs text-fg-muted">
              Review mode
              <select
                value={mode}
                onChange={(event) => {
                  const option = MODE_OPTIONS.find((item) => item.value === event.target.value);
                  if (option) setMode(option.value);
                }}
                className="rounded-md border border-border bg-bg-inset px-2.5 py-2 text-sm text-fg"
              >
                {MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void runPrReviewCycle(true)}
              disabled={
                reviewing.length > 0 ||
                includedRepoCount === 0 ||
                !selectedModelIsAvailable ||
                modelsLoading
              }
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-bg-inset disabled:opacity-50"
            >
              {reviewing.length > 0 ? "Reviewing…" : "Check selected repos now"}
            </button>
          </div>

          {lastCycleSummary && (
            <div className="mt-2.5 flex items-center justify-between rounded bg-bg-inset p-2 text-xs text-fg-muted">
              <span>{lastCycleSummary}</span>
              <button
                type="button"
                onClick={() => setLastCycleSummary(null)}
                className="ml-2 text-fg-muted hover:text-fg"
                title="Dismiss"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {selectedModelId && !selectedModelIsAvailable && !modelsLoading && (
            <p className="mt-2 text-sm text-warning">
              The saved model “{selectedModelId}” is no longer available. Select another model;
              GitPulse will not silently switch models.
            </p>
          )}
          {selectedModel?.warnings.map((warning) => (
            <p key={warning} className="mt-1 text-xs text-warning">
              {warning}
            </p>
          ))}
          {selectedModel?.dataRetentionWarning && (
            <p className="mt-1 text-xs text-warning">{selectedModel.dataRetentionWarning}</p>
          )}
        </div>

        {/* On-Demand PR Review Card */}
        <div className="rounded-md border border-border bg-bg-elevated p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot size={14} className="text-accent" />
              <span className="text-xs font-semibold text-fg">Review PR on demand</span>
            </div>
            <span className="text-[11px] text-fg-muted">
              Trigger an immediate review on any open or closed PR
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={manualRepoPath}
              onChange={(e) => setManualRepoPath(e.target.value)}
              disabled={manualReviewLoading || repos.length === 0}
              className="min-w-44 flex-1 rounded-md border border-border bg-bg-inset px-2.5 py-1.5 text-xs text-fg disabled:opacity-50"
            >
              {repos.length === 0 && <option value="">No repositories added</option>}
              {repos.map((repo) => (
                <option key={repo.path} value={repo.path}>
                  {repo.name} ({repo.path})
                </option>
              ))}
            </select>

            <input
              type="number"
              min="1"
              placeholder="PR # (e.g. 50)"
              value={manualPrNumber}
              onChange={(e) => setManualPrNumber(e.target.value)}
              disabled={manualReviewLoading}
              className="w-28 rounded-md border border-border bg-bg-inset px-2.5 py-1.5 text-xs text-fg"
            />

            <button
              type="button"
              onClick={() => void handleManualReview()}
              disabled={
                manualReviewLoading ||
                !manualRepoPath ||
                !manualPrNumber.trim() ||
                !selectedModelIsAvailable
              }
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
            >
              {manualReviewLoading ? "Reviewing…" : "Review PR"}
            </button>
          </div>

          {manualReviewStatus && (
            <div className="mt-2.5 rounded bg-bg-inset p-2 text-xs text-accent">
              {manualReviewStatus}
            </div>
          )}

          {manualReviewSuccess && (
            <div className="mt-2 flex items-center justify-between rounded bg-success/10 p-2 text-xs text-success">
              <span>Review submitted successfully!</span>
              <button
                type="button"
                onClick={() =>
                  void openUrl(manualReviewSuccess).catch((err) =>
                    setManualReviewError(reviewErrorMessage(err)),
                  )
                }
                className="flex items-center gap-1 font-medium underline hover:text-fg"
              >
                View on GitHub <ExternalLink size={12} />
              </button>
            </div>
          )}

          {manualReviewError && (
            <div className="mt-2 rounded bg-danger/10 p-2 text-xs text-danger">
              <span className="font-medium">Review failed: </span>
              {manualReviewError}
            </div>
          )}
        </div>

        <p className="text-xs leading-relaxed text-fg-muted">
          {mode === "off"
            ? "Automatic reviews are off. Use Check selected repos now for a one-time run."
            : "Automatic checks run every 30 minutes while GitPulse is open."}{" "}
          {mode === "allNew" &&
            `New PRs are counted from ${new Date(modeStartedAt).toLocaleString()}. `}
          A changed commit or newly resolved review thread triggers a re-review. Diffs are sent to
          the selected Copilot model; comments and eligible approvals are posted via the native
          GitHub API. No model is selected automatically. Approval is withheld for critical/high
          findings, draft PRs, and your own PRs. Bot-authored PRs are skipped.
        </p>

        {globalError && !environment && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 text-sm text-danger">{globalError}</p>
            <button
              type="button"
              onClick={() => void retryConnection()}
              disabled={checkingConnection}
              className="rounded-md border border-border px-2 py-1 text-xs hover:bg-bg-inset disabled:opacity-50"
            >
              {checkingConnection ? "Checking…" : "Retry connection"}
            </button>
          </div>
        )}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">
            Repositories
          </h3>
          {repos.length === 0 ? (
            <p className="text-sm text-fg-muted">Add a repository to configure PR reviews.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {repos.map((repo) => {
                const excluded = excludedRepos.includes(repo.path);
                return (
                  <li key={repo.path} className="flex items-center gap-3 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={!excluded}
                      onChange={(event) => setRepoExcluded(repo.path, !event.target.checked)}
                      aria-label={`Include ${repo.name} in automated reviews`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-fg">{repo.name}</div>
                      <div className="truncate text-xs text-fg-muted">{repo.path}</div>
                    </div>
                    {repoErrors[repo.path] && (
                      <details className="max-w-64 min-w-0 text-xs text-danger">
                        <summary className="cursor-pointer truncate" title={repoErrors[repo.path]}>
                          Review error
                        </summary>
                        <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded bg-bg-inset p-2">
                          {repoErrors[repo.path]}
                        </pre>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">
            Recent reviews
          </h3>
          {recentReviews.length === 0 ? (
            <p className="text-sm text-fg-muted">No PRs reviewed yet.</p>
          ) : (
            <ul className="space-y-2">
              {recentReviews.map((review) => (
                <li
                  key={`${review.repo}#${review.number}`}
                  className="rounded-md border border-border bg-bg-elevated px-3 py-2"
                >
                  <div className="flex items-center gap-2 text-sm text-fg">
                    <span className="min-w-0 flex-1 truncate">
                      {review.repo}#{review.number}: {review.title}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        void openUrl(review.reviewUrl).catch((error) =>
                          setGlobalError(reviewErrorMessage(error)),
                        )
                      }
                      className="text-fg-muted hover:text-accent"
                      title="Open posted review"
                      aria-label={`Open review for ${review.repo}#${review.number}`}
                    >
                      <ExternalLink size={13} />
                    </button>
                    <span
                      className={
                        review.event === "APPROVE" ? "text-xs text-success" : "text-xs text-warning"
                      }
                    >
                      {review.event === "APPROVE" ? "Approved" : "Commented"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-fg-muted">{review.summary}</p>
                  <p className="mt-1 text-[11px] text-fg-muted">
                    {review.modelId} · {review.findings.length} finding
                    {review.findings.length === 1 ? "" : "s"} ·{" "}
                    {new Date(review.reviewedAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
              Recent errors
            </h3>
            <span className="text-[11px] text-fg-muted">
              Stored locally; PR diffs and prompts are not logged.
            </span>
            {diagnostics.length > 0 && (
              <button
                type="button"
                onClick={clearDiagnostics}
                className="ml-auto flex items-center gap-1 text-xs text-fg-muted hover:text-danger"
                title="Clear local PR review diagnostics"
              >
                <Trash2 size={12} /> Clear
              </button>
            )}
          </div>
          {diagnostics.length === 0 ? (
            <p className="text-sm text-fg-muted">No recorded review errors.</p>
          ) : (
            <ul className="space-y-2">
              {diagnostics.map((diagnostic, index) => (
                <li
                  key={`${diagnostic.occurredAt}-${index}`}
                  className="rounded-md border border-border bg-bg-elevated p-2"
                >
                  <div className="flex items-center gap-2 text-xs text-fg-muted">
                    <span className="min-w-0 flex-1 truncate">
                      {diagnostic.repoPath ?? "GitHub/Copilot"}{" "}
                      {diagnostic.prNumber === null ? "" : `· PR #${diagnostic.prNumber}`}
                    </span>
                    <time>{new Date(diagnostic.occurredAt).toLocaleString()}</time>
                    <button
                      type="button"
                      onClick={() =>
                        void navigator.clipboard.writeText(diagnostic.message).catch((error) =>
                          setGlobalError(reviewErrorMessage(error)),
                        )
                      }
                      className="rounded p-1 hover:bg-bg-inset hover:text-fg"
                      title="Copy full error"
                      aria-label="Copy full error"
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words text-xs text-danger">
                    {diagnostic.message}
                  </pre>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
