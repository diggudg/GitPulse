import { DiffView, DiffModeEnum } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view.css";
import { convertFileSrc } from "@tauri-apps/api/core";
import { fileDiff } from "@/lib/ipc";
import { useAsync } from "@/hooks/useAsync";
import { useUiStore } from "@/stores/uiStore";

/** Resolve a file's patch text: inline payloads pass through; large payloads are
 *  streamed from disk via the asset protocol (never serialized as JSON). */
async function loadPatch(repoPath: string, sha: string, file: string): Promise<string> {
  const payload = await fileDiff(repoPath, sha, file);
  if (payload.kind === "inline") return payload.text;
  const res = await fetch(convertFileSrc(payload.url));
  return res.text();
}

export function FileDiff({ repoPath, sha, file }: { repoPath: string; sha: string; file: string }) {
  const theme = useUiStore((s) => s.theme);
  const { data: patch, error, loading } = useAsync(
    () => loadPatch(repoPath, sha, file),
    [repoPath, sha, file],
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
