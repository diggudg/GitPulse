import { create } from "zustand";

export type Theme = "dark" | "light" | "high-contrast";
export type FileDiffSource = "commit" | "staged" | "worktree";

/** The Home tab is always present; repo tabs are keyed by their path. */
export const HOME_TAB = "home";

interface Selection {
  sha: string | null;
  file: string | null;
  diffSource: FileDiffSource | null;
}

interface UiState {
  theme: Theme;
  /** "home" or a repo path. */
  activeTabId: string;
  /** Per-repo commit/file selection so each tab remembers its own view. */
  selection: Record<string, Selection>;
  /** Bumped on data-changing events (e.g. a new commit) so views reload. */
  refreshKey: number;

  setTheme: (theme: Theme) => void;
  setActiveTab: (id: string) => void;
  selectCommit: (repoPath: string, sha: string | null) => void;
  selectFile: (repoPath: string, file: string | null) => void;
  selectWorkingTreeFile: (repoPath: string, file: string, source: "staged" | "worktree") => void;
  clearSelection: (repoPath: string) => void;
  bumpRefresh: () => void;
}

const EMPTY: Selection = { sha: null, file: null, diffSource: null };

export const useUiStore = create<UiState>((set) => ({
  theme: "dark",
  activeTabId: HOME_TAB,
  selection: {},
  refreshKey: 0,

  setTheme: (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    set({ theme });
  },
  setActiveTab: (activeTabId) => set({ activeTabId }),
  selectCommit: (repoPath, sha) =>
    set((s) => ({
      selection: { ...s.selection, [repoPath]: { sha, file: null, diffSource: null } },
    })),
  selectFile: (repoPath, file) =>
    set((s) => ({
      selection: {
        ...s.selection,
        [repoPath]: {
          sha: s.selection[repoPath]?.sha ?? null,
          file,
          diffSource: file ? "commit" : null,
        },
      },
    })),
  selectWorkingTreeFile: (repoPath, file, diffSource) =>
    set((s) => ({
      selection: {
        ...s.selection,
        [repoPath]: {
          sha: s.selection[repoPath]?.sha ?? null,
          file,
          diffSource,
        },
      },
    })),
  clearSelection: (repoPath) =>
    set((s) => {
      const next = { ...s.selection };
      delete next[repoPath];
      return { selection: next };
    }),
  bumpRefresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),
}));

/** Selection for a given repo (stable empty default). */
export const useSelection = (repoPath: string): Selection =>
  useUiStore((s) => s.selection[repoPath] ?? EMPTY);
