import { DiffView, DiffModeEnum } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view.css";
import { convertFileSrc } from "@tauri-apps/api/core";
import { fileDiff, workingFileDiff, type DiffPayload } from "@/lib/ipc";
import { useAsync } from "@/hooks/useAsync";
import { useUiStore } from "@/stores/uiStore";

/** Resolve a file's patch text: inline payloads pass through; large payloads are
 *  streamed from disk via the asset protocol (never serialized as JSON). */
async function readPayload(payload: DiffPayload): Promise<string> {
  if (payload.kind === "inline") return payload.text;
  const res = await fetch(convertFileSrc(payload.url));
  if (!res.ok) throw new Error(`Could not load diff (${res.status})`);
  return res.text();
}

export function FileDiff({
  repoPath,
  sha,
  file,
  source,
}: {
  repoPath: string;
  sha: string | null;
  file: string;
  source: "commit" | "staged" | "worktree";
}) {
  const theme = useUiStore((s) => s.theme);
  const { data: patch, error, loading } = useAsync(
    async () => {
      if (source === "commit") {
        if (!sha) throw new Error("Select a commit before viewing its diff");
        return readPayload(await fileDiff(repoPath, sha, file));
      }
      const payload = await workingFileDiff(repoPath, file, source === "staged");
      return readPayload(payload);
    },
    [repoPath, sha, file, source],
  );

  if (error) return <div className="p-3 text-sm text-danger">{error}</div>;
  if (loading || patch === null) return <div className="p-3 text-sm text-fg-muted">Loading diff…</div>;
  if (patch.trim() === "")
    return <div className="p-3 text-sm text-fg-muted">No textual changes.</div>;

  return (
    <DiffView
      data={{ hunks: [patch] }}
      diffViewMode={DiffModeEnum.Unified}
      diffViewHighlight
      diffViewWrap
      diffViewTheme={theme === "light" ? "light" : "dark"}
      diffViewFontSize={12}
    />
  );
}
