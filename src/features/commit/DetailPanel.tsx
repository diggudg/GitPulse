import { useCommitDetail } from "./useCommitDetail";
import { Avatar } from "./Avatar";
import { WorkingTree } from "./WorkingTree";
import { FileStatusBadge } from "./FileStatusBadge";
import { useSelection, useUiStore } from "@/stores/uiStore";

export function DetailPanel({ repoPath }: { repoPath: string }) {
  const selectFile = useUiStore((s) => s.selectFile);
  const { sha: selectedSha, file: selectedFile, diffSource } = useSelection(repoPath);
  const { detail, error } = useCommitDetail(repoPath, selectedSha);

  return (
    <aside className="flex h-full min-w-0 flex-col bg-bg-elevated">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {selectedSha ? (
          error ? (
            <div className="p-3 text-sm text-danger">{error}</div>
          ) : !detail ? (
            <div className="p-3 text-sm text-fg-muted">Loading commit…</div>
          ) : (
            <div className="p-3">
              <div className="mb-2 flex items-center gap-2">
                <Avatar name={detail.author} email={detail.email} />
                <div className="min-w-0">
                  <div className="truncate text-sm text-fg">{detail.author}</div>
                  <div className="text-xs text-fg-muted">
                    {new Date(detail.time * 1000).toLocaleString()}
                  </div>
                </div>
                <code className="ml-auto rounded bg-bg-inset px-1.5 py-0.5 text-xs text-fg-muted">
                  {detail.sha.slice(0, 7)}
                </code>
              </div>

              <p className="mb-3 whitespace-pre-wrap break-words text-sm text-fg">
                {detail.message}
              </p>

              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-fg-muted">
                {detail.files.length} changed file{detail.files.length === 1 ? "" : "s"}
              </div>
              <ul>
                {detail.files.map((f) => (
                  <li key={f.path}>
                    <button
                      type="button"
                      onClick={() => selectFile(repoPath, f.path)}
                      className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm hover:bg-bg-inset ${
                        diffSource === "commit" && selectedFile === f.path ? "bg-bg-inset" : ""
                      }`}
                    >
                      <FileStatusBadge status={f.status} />
                      <span className="min-w-0 flex-1 truncate" title={f.path}>
                        {f.path}
                      </span>
                      <span className="shrink-0 text-xs text-success">+{f.additions}</span>
                      <span className="shrink-0 text-xs text-danger">-{f.deletions}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        ) : (
          <div className="p-3 text-sm text-fg-muted">
            Select a commit in the graph to see its details.
          </div>
        )}
      </div>

      <WorkingTree repoPath={repoPath} />
    </aside>
  );
}
