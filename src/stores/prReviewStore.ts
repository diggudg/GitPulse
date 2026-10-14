import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  CopilotModelOption,
  PrReviewEnvironment,
  PullRequestReview,
} from "@/lib/ipc";

export type PrReviewMode = "off" | "allNew" | "authoredByMe" | "allOpen";

export interface ReviewHistoryEntry extends PullRequestReview {
  title: string;
  reviewedAt: string;
}

export interface ReviewAttempt {
  headSha: string;
  resolvedThreads: string[];
  attemptedAt: string;
}

export interface PrReviewDiagnostic {
  repoPath: string | null;
  prNumber: number | null;
  message: string;
  occurredAt: string;
}

interface PrReviewState {
  mode: PrReviewMode;
  modeRevision: number;
  modeStartedAt: string;
  selectedModelId: string | null;
  availableModels: CopilotModelOption[];
  modelsLoading: boolean;
  modelsError: string | null;
  excludedRepos: string[];
  history: Record<string, ReviewHistoryEntry>;
  attempts: Record<string, ReviewAttempt>;
  diagnostics: PrReviewDiagnostic[];
  reviewing: string[];
  githubUser: string | null;
  environment: PrReviewEnvironment | null;
  globalError: string | null;
  repoErrors: Record<string, string>;
  lastCycleSummary: string | null;

  setMode: (mode: PrReviewMode) => void;
  setSelectedModelId: (modelId: string | null) => void;
  setAvailableModels: (models: CopilotModelOption[]) => void;
  setModelsLoading: (loading: boolean) => void;
  setModelsError: (error: string | null) => void;
  setRepoExcluded: (path: string, excluded: boolean) => void;
  setEnvironment: (environment: PrReviewEnvironment | null) => void;
  setGlobalError: (error: string | null) => void;
  setRepoError: (path: string, error: string | null) => void;
  setLastCycleSummary: (summary: string | null) => void;
  setReviewing: (key: string, reviewing: boolean) => void;
  recordReview: (key: string, entry: ReviewHistoryEntry) => void;
  recordAttempt: (key: string, attempt: ReviewAttempt) => void;
  clearAttempt: (key: string) => void;
  recordDiagnostic: (repoPath: string | null, prNumber: number | null, message: string) => void;
  clearDiagnostics: () => void;
}

export const usePrReviewStore = create<PrReviewState>()(
  persist(
    (set) => ({
      mode: "off",
      modeRevision: 0,
      modeStartedAt: new Date().toISOString(),
      selectedModelId: null,
      availableModels: [],
      modelsLoading: false,
      modelsError: null,
      excludedRepos: [],
      history: {},
      attempts: {},
      diagnostics: [],
      reviewing: [],
      githubUser: null,
      environment: null,
      globalError: null,
      repoErrors: {},
      lastCycleSummary: null,

      setLastCycleSummary: (lastCycleSummary) => set({ lastCycleSummary }),

      setMode: (mode) =>
        set((state) => ({
          mode,
          modeRevision: state.mode === mode ? state.modeRevision : state.modeRevision + 1,
          modeStartedAt:
            mode === "allNew" && state.mode !== "allNew"
              ? new Date().toISOString()
              : state.modeStartedAt,
        })),
      setSelectedModelId: (selectedModelId) => set({ selectedModelId }),
      setAvailableModels: (availableModels) =>
        set({ availableModels, modelsError: null }),
      setModelsLoading: (modelsLoading) => set({ modelsLoading }),
      setModelsError: (modelsError) => set({ modelsError }),
      setRepoExcluded: (path, excluded) =>
        set((state) => {
          const excludedRepos = excluded
            ? state.excludedRepos.includes(path)
              ? state.excludedRepos
              : [...state.excludedRepos, path]
            : state.excludedRepos.filter((repoPath) => repoPath !== path);
          const repoErrors = { ...state.repoErrors };
          if (excluded) delete repoErrors[path];
          return { excludedRepos, repoErrors };
        }),
      setEnvironment: (environment) =>
        set({
          environment,
          githubUser: environment?.githubUser ?? null,
          globalError: null,
        }),
      setGlobalError: (globalError) => set({ globalError }),
      setRepoError: (path, error) =>
        set((state) => {
          const repoErrors = { ...state.repoErrors };
          if (error) repoErrors[path] = error;
          else delete repoErrors[path];
          return { repoErrors };
        }),
      setReviewing: (key, reviewing) =>
        set((state) => ({
          reviewing: reviewing
            ? state.reviewing.includes(key)
              ? state.reviewing
              : [...state.reviewing, key]
            : state.reviewing.filter((reviewKey) => reviewKey !== key),
        })),
      recordReview: (key, entry) =>
        set((state) => {
          const entries = Object.entries({ ...state.history, [key]: entry }).sort(
            ([, a], [, b]) => b.reviewedAt.localeCompare(a.reviewedAt),
          );
          return { history: Object.fromEntries(entries.slice(0, 500)) };
        }),
      recordAttempt: (key, attempt) =>
        set((state) => ({ attempts: { ...state.attempts, [key]: attempt } })),
      clearAttempt: (key) =>
        set((state) => {
          const attempts = { ...state.attempts };
          delete attempts[key];
          return { attempts };
        }),
      recordDiagnostic: (repoPath, prNumber, message) =>
        set((state) => ({
          diagnostics: [
            {
              repoPath,
              prNumber,
              message: redactTokens(message),
              occurredAt: new Date().toISOString(),
            },
            ...state.diagnostics,
          ].slice(0, 25),
        })),
      clearDiagnostics: () => set({ diagnostics: [] }),
    }),
    {
      name: "gitpulse-pr-review",
      version: 1,
      partialize: (state) => ({
        mode: state.mode,
        modeStartedAt: state.modeStartedAt,
        selectedModelId: state.selectedModelId,
        excludedRepos: state.excludedRepos,
        history: state.history,
        attempts: state.attempts,
        diagnostics: state.diagnostics,
      }),
    },
  ),
);

function redactTokens(message: string): string {
  return message.replace(/\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]+\b/g, "[redacted token]");
}
