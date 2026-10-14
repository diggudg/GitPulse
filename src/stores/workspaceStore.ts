import { create } from "zustand";
import { persist } from "zustand/middleware";
import { openRepo, discoverRepos, type RepoMeta } from "@/lib/ipc";
import { useUiStore, HOME_TAB } from "@/stores/uiStore";

interface WorkspaceState {
  /** Repos imported into the workspace, in display order. */
  repos: RepoMeta[];
  /** Paths of repos currently open as tabs, in tab order. */
  openTabs: string[];
  /** Path of the currently active repo, or null. */
  activeRepoPath: string | null;
  error: string | null;

  addRepo: (path: string) => Promise<void>;
  /** Discover and add every repo under a parent folder. Returns the count added. */
  scanFolder: (root: string) => Promise<number>;
  /** Open a repo as a tab and activate it. */
  openTab: (path: string) => void;
  /** Close a repo tab (keeps it in the workspace). */
  closeTab: (path: string) => void;
  /** Remove a repo from the workspace entirely (and close its tab). */
  removeRepo: (path: string) => void;
  setActiveRepo: (path: string) => void;
  reorderRepos: (repos: RepoMeta[]) => void;
}

/** Append new repos, ignoring any already present (by path), preserving order. */
function mergeRepos(existing: RepoMeta[], incoming: RepoMeta[]): RepoMeta[] {
  const seen = new Set(existing.map((r) => r.path));
  const additions = incoming.filter((r) => !seen.has(r.path));
  return additions.length ? [...existing, ...additions] : existing;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      repos: [],
      openTabs: [],
      activeRepoPath: null,
      error: null,

      addRepo: async (path) => {
        try {
          const meta = await openRepo(path);
          set((s) => ({
            repos: mergeRepos(s.repos, [meta]),
            error: null,
          }));
        } catch (e) {
          set({ error: String(e) });
        }
      },

      scanFolder: async (root) => {
        try {
          const found = await discoverRepos(root);
          let added = 0;
          set((s) => {
            const repos = mergeRepos(s.repos, found);
            added = repos.length - s.repos.length;
            return { repos, error: null };
          });
          return added;
        } catch (e) {
          set({ error: String(e) });
          return 0;
        }
      },

      openTab: (path) => {
        set((s) => ({
          openTabs: s.openTabs.includes(path) ? s.openTabs : [...s.openTabs, path],
          activeRepoPath: path,
        }));
        useUiStore.getState().setActiveTab(path);
      },

      closeTab: (path) =>
        set((s) => {
          const openTabs = s.openTabs.filter((p) => p !== path);
          // If the closed tab was active, fall back to the last open tab or Home.
          if (useUiStore.getState().activeTabId === path) {
            const next = openTabs[openTabs.length - 1] ?? HOME_TAB;
            useUiStore.getState().setActiveTab(next);
          }
          const activeRepoPath = openTabs.includes(s.activeRepoPath ?? "")
            ? s.activeRepoPath
            : (openTabs[openTabs.length - 1] ?? null);
          return { openTabs, activeRepoPath };
        }),

      removeRepo: (path) =>
        set((s) => {
          const repos = s.repos.filter((r) => r.path !== path);
          const openTabs = s.openTabs.filter((p) => p !== path);
          if (useUiStore.getState().activeTabId === path) {
            useUiStore.getState().setActiveTab(openTabs[openTabs.length - 1] ?? HOME_TAB);
          }
          useUiStore.getState().clearSelection(path);
          const activeRepoPath =
            s.activeRepoPath === path ? (openTabs[openTabs.length - 1] ?? null) : s.activeRepoPath;
          return { repos, openTabs, activeRepoPath };
        }),

      setActiveRepo: (path) => set({ activeRepoPath: path }),

      reorderRepos: (repos) => set({ repos }),
    }),
    {
      name: "gitpulse-workspace",
      version: 1,
      partialize: (state) => ({ repos: state.repos }),
    },
  ),
);

export const useActiveRepo = (): RepoMeta | null => {
  const { repos, activeRepoPath } = useWorkspaceStore();
  return repos.find((r) => r.path === activeRepoPath) ?? null;
};

/** RepoMeta for a given path (used by repo tabs). */
export const useRepo = (path: string): RepoMeta | null =>
  useWorkspaceStore((s) => s.repos.find((r) => r.path === path) ?? null);
