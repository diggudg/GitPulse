import { useEffect } from "react";
import {
  listCopilotModels,
  listPullRequests,
  prReviewEnvironment,
  resolvedReviewThreads,
  reviewPullRequest,
} from "@/lib/ipc";
import { usePrReviewStore } from "@/stores/prReviewStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";

const POLL_INTERVAL_MS = 30 * 60 * 1000;
const REVIEW_RETRY_DELAY_MS = 15 * 60 * 1000;

let activeCycle: Promise<void> | null = null;

export function runPrReviewCycle(forceAllOpen = false): Promise<void> {
  if (activeCycle) return activeCycle;
  activeCycle = executeReviewCycle(forceAllOpen).finally(() => {
    activeCycle = null;
  });
  return activeCycle;
}

export function reviewErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return JSON.stringify(error) ?? String(error);
}

export function usePrReviewAutomation() {
  const mode = usePrReviewStore((state) => state.mode);
  const modeRevision = usePrReviewStore((state) => state.modeRevision);
  const selectedModelId = usePrReviewStore((state) => state.selectedModelId);
  const excludedRepos = usePrReviewStore((state) => state.excludedRepos.join("\n"));
  const repoPaths = useWorkspaceStore((state) => state.repos.map((repo) => repo.path).join("\n"));

  useEffect(() => {
    if (mode === "off" || !selectedModelId) return;
    void runPrReviewCycle();
    const interval = setInterval(() => void runPrReviewCycle(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [mode, modeRevision, selectedModelId, excludedRepos, repoPaths]);
}

async function executeReviewCycle(forceAllOpen: boolean): Promise<void> {
  const store = usePrReviewStore.getState();
  const mode = forceAllOpen ? "allOpen" : store.mode;
  const modeRevision = store.modeRevision;
  const selectedModelId = store.selectedModelId;
  if (mode === "off") return;
  if (!selectedModelId) {
    store.setGlobalError("Choose a Copilot model before starting PR reviews.");
    return;
  }

  try {
    const [environment, availableModels] = await Promise.all([
      prReviewEnvironment(),
      listCopilotModels(),
    ]);
    usePrReviewStore.getState().setAvailableModels(availableModels);
    store.setEnvironment(environment);
    const selectedModel = availableModels.find((model) => model.id === selectedModelId);
    if (!selectedModel?.selectable) {
      store.setGlobalError(
        `The selected Copilot model "${selectedModelId}" is no longer available. Choose another model.`,
      );
      return;
    }

    const { repos } = useWorkspaceStore.getState();
    const modeStartedAt = Date.parse(usePrReviewStore.getState().modeStartedAt);
    let scannedRepoCount = 0;
    let openPrCount = 0;
    let reviewedCount = 0;

    for (const repo of repos) {
      if (!isCurrentAutoRun(mode, modeRevision, forceAllOpen)) return;
      if (isRepoExcluded(repo.path)) continue;
      scannedRepoCount++;
      try {
        const pullRequests = await listPullRequests(repo.path);
        usePrReviewStore.getState().setRepoError(repo.path, null);
        openPrCount += pullRequests.length;

        for (const pullRequest of pullRequests) {
          if (!isCurrentAutoRun(mode, modeRevision, forceAllOpen)) return;
          if (isRepoExcluded(repo.path)) continue;
          const key = `${pullRequest.repo}#${pullRequest.number}`;
          const currentStore = usePrReviewStore.getState();
          const previous = currentStore.history[key];
          if (
            mode === "allNew" &&
            Date.parse(pullRequest.createdAt) < modeStartedAt &&
            !previous
          ) {
            continue;
          }
          if (
            mode === "authoredByMe" &&
            pullRequest.author.toLowerCase() !== environment.githubUser.toLowerCase()
          ) {
            continue;
          }

          let resolvedThreads: string[];
          try {
            resolvedThreads = await resolvedReviewThreads(
              repo.path,
              pullRequest.repo,
              pullRequest.number,
            );
          } catch (error) {
            reportRepoError(repo.path, error, pullRequest.number);
            continue;
          }

          if (
            previous?.headSha === pullRequest.headSha &&
            sameStrings(previous.resolvedThreads, resolvedThreads)
          ) {
            continue;
          }
          const attempt = currentStore.attempts[key];
          if (
            !forceAllOpen &&
            attempt?.headSha === pullRequest.headSha &&
            sameStrings(attempt.resolvedThreads, resolvedThreads) &&
            Date.now() - Date.parse(attempt.attemptedAt) < REVIEW_RETRY_DELAY_MS
          ) {
            continue;
          }

          if (!isCurrentAutoRun(mode, modeRevision, forceAllOpen)) return;
          if (isRepoExcluded(repo.path)) continue;
          const attemptedAt = new Date().toISOString();
          usePrReviewStore.getState().recordAttempt(key, {
            headSha: pullRequest.headSha,
            resolvedThreads,
            attemptedAt,
          });
          usePrReviewStore.getState().setReviewing(key, true);
          try {
            const result = await reviewPullRequest(
              repo.path,
              pullRequest.number,
              selectedModelId,
            );
            usePrReviewStore.getState().recordReview(key, {
              ...result,
              title: pullRequest.title,
              reviewedAt: new Date().toISOString(),
            });
            usePrReviewStore.getState().clearAttempt(key);
            reviewedCount++;
          } catch (error) {
            usePrReviewStore.getState().recordAttempt(key, {
              headSha: pullRequest.headSha,
              resolvedThreads,
              attemptedAt,
            });
            reportRepoError(repo.path, error, pullRequest.number);
          } finally {
            usePrReviewStore.getState().setReviewing(key, false);
          }
        }
      } catch (error) {
        reportRepoError(repo.path, error, null);
      }
    }

    if (forceAllOpen) {
      if (reviewedCount > 0) {
        usePrReviewStore
          .getState()
          .setLastCycleSummary(
            `Check completed: successfully reviewed ${reviewedCount} pull request(s).`,
          );
      } else if (openPrCount === 0) {
        usePrReviewStore
          .getState()
          .setLastCycleSummary(
            `Check completed: scanned ${scannedRepoCount} repo(s). No open pull requests found.`,
          );
      } else {
        usePrReviewStore
          .getState()
          .setLastCycleSummary(
            `Check completed: scanned ${scannedRepoCount} repo(s) (${openPrCount} open PR(s) found; already reviewed or up to date).`,
          );
      }
    }
  } catch (error) {
    usePrReviewStore.getState().setEnvironment(null);
    const message = reviewErrorMessage(error);
    usePrReviewStore.getState().setGlobalError(message);
    usePrReviewStore.getState().recordDiagnostic(null, null, message);
  }
}

function reportRepoError(repoPath: string, error: unknown, prNumber: number | null) {
  const message = reviewErrorMessage(error);
  usePrReviewStore.getState().setRepoError(
    repoPath,
    prNumber === null ? message : `PR #${prNumber}: ${message}`,
  );
  usePrReviewStore.getState().recordDiagnostic(repoPath, prNumber, message);
}

function isCurrentAutoRun(mode: string, modeRevision: number, forceAllOpen: boolean): boolean {
  if (forceAllOpen) return true;
  const state = usePrReviewStore.getState();
  return state.mode === mode && state.modeRevision === modeRevision;
}

function isRepoExcluded(repoPath: string): boolean {
  return usePrReviewStore.getState().excludedRepos.includes(repoPath);
}

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
