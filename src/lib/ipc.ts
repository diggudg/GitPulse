import { invoke } from "@tauri-apps/api/core";

/**
 * Typed wrappers around the Rust `#[tauri::command]` handlers. The TypeScript
 * types here mirror the serde structs in `src-tauri/src/git/*`. Keep them in sync.
 */

export interface RepoMeta {
  /** Absolute path to the repository working directory. */
  path: string;
  /** Display name (the directory's base name). */
  name: string;
  /** Current HEAD branch name, or null when detached. */
  head: string | null;
}

export type RefKind = "head" | "localBranch" | "remoteBranch" | "tag";

export interface RefLabel {
  name: string;
  kind: RefKind;
}

export interface Commit {
  sha: string;
  parents: string[];
  author: string;
  email: string;
  /** Unix seconds. */
  time: number;
  summary: string;
  refs: RefLabel[];
}

export interface CommitPage {
  commits: Commit[];
  /** Opaque cursor for the next page, or null when history is exhausted. */
  nextCursor: string | null;
}

export type FileStatus = "added" | "modified" | "deleted" | "renamed";

export interface FileChange {
  path: string;
  oldPath: string | null;
  status: FileStatus;
  additions: number;
  deletions: number;
}

export interface CommitDetail {
  sha: string;
  author: string;
  email: string;
  time: number;
  message: string;
  files: FileChange[];
}

/** A diff is returned inline for small patches, or as an asset URL for large ones. */
export type DiffPayload =
  | { kind: "inline"; text: string }
  | { kind: "asset"; url: string; bytes: number };

export interface RepoStatus {
  staged: FileChange[];
  unstaged: FileChange[];
  untracked: string[];
}

export interface RefEntry {
  name: string;
  fullName: string;
  targetSha: string;
  isHead: boolean;
}

export interface StashEntry {
  index: number;
  message: string;
  sha: string;
}

export interface RepoRefs {
  head: string | null;
  localBranches: RefEntry[];
  remoteBranches: RefEntry[];
  tags: RefEntry[];
  stashes: StashEntry[];
}

export interface RepoSummary {
  path: string;
  name: string;
  head: string | null;
  /** staged + unstaged + untracked count. */
  wipCount: number;
  ahead: number;
  behind: number;
  hasUpstream: boolean;
}

export interface GithubAuthStatus {
  hasToken: boolean;
  source: string;
}

export interface PrReviewEnvironment {
  githubUser: string;
  authSource: string;
}

export interface CopilotModelOption {
  id: string;
  name: string;
  provider: string | null;
  category: string | null;
  priceCategory: string | null;
  policyState: string | null;
  warnings: string[];
  dataRetentionWarning: string | null;
  selectable: boolean;
}

export interface PullRequest {
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  authorType: string;
  headSha: string;
  createdAt: string;
  updatedAt: string;
  isDraft: boolean;
  baseBranch: string;
  headBranch: string;
}

export interface ReviewFinding {
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  body: string;
  path: string | null;
  line: number | null;
}

export interface PullRequestReview {
  repo: string;
  number: number;
  headSha: string;
  modelId: string;
  event: "APPROVE" | "COMMENT";
  reviewUrl: string;
  summary: string;
  findings: ReviewFinding[];
  resolvedThreads: string[];
}

// --- Command wrappers -------------------------------------------------------

export const openRepo = (path: string) =>
  invoke<RepoMeta>("open_repo", { path });

export const discoverRepos = (root: string, maxDepth?: number) =>
  invoke<RepoMeta[]>("discover_repos", { root, maxDepth: maxDepth ?? null });

export const commitGraph = (path: string, cursor: string | null, limit: number) =>
  invoke<CommitPage>("commit_graph", { path, cursor, limit });

export const commitDetail = (path: string, sha: string) =>
  invoke<CommitDetail>("commit_detail", { path, sha });

export const fileDiff = (path: string, sha: string, file: string) =>
  invoke<DiffPayload>("file_diff", { path, sha, file });

export const workingFileDiff = (path: string, file: string, staged: boolean) =>
  invoke<DiffPayload>("working_file_diff", { path, file, staged });

export const repoStatus = (path: string) =>
  invoke<RepoStatus>("repo_status", { path });

export const repoRefs = (path: string) =>
  invoke<RepoRefs>("repo_refs", { path });

export const workspaceSummary = (paths: string[]) =>
  invoke<RepoSummary[]>("workspace_summary", { paths });

export const stage = (path: string, paths: string[]) =>
  invoke<void>("stage", { path, paths });

export const unstage = (path: string, paths: string[]) =>
  invoke<void>("unstage", { path, paths });

export const commit = (path: string, message: string) =>
  invoke<string>("commit", { path, message });

export const fetchRepo = (path: string) =>
  invoke<void>("fetch_repo", { path });

export const pullRepo = (path: string, rebase: boolean) =>
  invoke<void>("pull_repo", { path, rebase });

export const prReviewEnvironment = () =>
  invoke<PrReviewEnvironment>("pr_review_environment");

export const listCopilotModels = () =>
  invoke<CopilotModelOption[]>("list_copilot_models");

export const listPullRequests = (path: string) =>
  invoke<PullRequest[]>("list_pull_requests", { path });

export const resolvedReviewThreads = (path: string, repo: string, number: number) =>
  invoke<string[]>("resolved_review_threads", { path, repo, number });

export const reviewPullRequest = (
  path: string,
  number: number,
  modelId: string,
) =>
  invoke<PullRequestReview>("review_pull_request", {
    path,
    number,
    modelId,
  });

export const getGithubAuthStatus = () =>
  invoke<GithubAuthStatus>("get_github_auth_status");

export const saveGithubToken = (token: string) =>
  invoke<void>("save_github_token", { token });

export const clearGithubToken = () =>
  invoke<void>("clear_github_token");

export const copilotOpenLogin = () =>
  invoke<void>("copilot_open_login");

export const githubOpenLogin = () =>
  invoke<string>("github_open_login");

export const openSystemTerminal = (path: string) =>
  invoke<void>("open_system_terminal", { path });

