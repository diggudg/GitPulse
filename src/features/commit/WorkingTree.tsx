import { useCallback, useEffect, useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import {
  repoStatus,
  stage,
  unstage,
  commit as commitCmd,
  type RepoStatus,
} from "@/lib/ipc";
import { useUiStore } from "@/stores/uiStore";
import { FileStatusBadge } from "./FileStatusBadge";

export function WorkingTree({ repoPath }: { repoPath: string }) {
  const [status, setStatus] = useState<RepoStatus | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bumpRefresh = useUiStore((s) => s.bumpRefresh);

  const refresh = useCallback(async () => {
    try {
      setStatus(await repoStatus(repoPath));
    } catch (e) {
      setError(String(e));
    }
  }, [repoPath]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function doCommit() {
    await run(async () => {
      await commitCmd(repoPath, message);
      setMessage("");
      bumpRefresh(); // new commit -> reload the graph
    });
  }

  const stagedCount = status?.staged.length ?? 0;

  return (
    <div className="shrink-0 border-t border-border">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">
        Working Tree
      </div>

      <div className="max-h-56 overflow-y-auto px-2 text-sm">
        {status && (
          <>
            <Section
              title={`Staged (${status.staged.length})`}
              files={status.staged.map((f) => ({ path: f.path, status: f.status }))}
              actionIcon={<Minus size={13} />}
              onAction={(p) => run(() => unstage(repoPath, [p]))}
              disabled={busy}
            />
            <Section
              title={`Changes (${status.unstaged.length + status.untracked.length})`}
              files={[
                ...status.unstaged.map((f) => ({ path: f.path, status: f.status })),
                ...status.untracked.map((p) => ({ path: p, status: "added" as const })),
              ]}
              actionIcon={<Plus size={13} />}
              onAction={(p) => run(() => stage(repoPath, [p]))}
              disabled={busy}
            />
          </>
        )}
      </div>

      <div className="border-t border-border p-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Commit message"
          rows={2}
          className="w-full resize-none rounded-md border border-border bg-bg-inset px-2 py-1.5 text-sm text-fg outline-none placeholder:text-fg-muted focus:border-accent"
        />
        <button
          onClick={doCommit}
          disabled={busy || stagedCount === 0 || message.trim() === ""}
          className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md bg-accent px-2 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          <Check size={14} /> Commit {stagedCount > 0 ? `(${stagedCount})` : ""}
        </button>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
    </div>
  );
}

function Section({
  title,
  files,
  actionIcon,
  onAction,
  disabled,
}: {
  title: string;
  files: { path: string; status: "added" | "modified" | "deleted" | "renamed" }[];
  actionIcon: React.ReactNode;
  onAction: (path: string) => void;
  disabled: boolean;
}) {
  if (files.length === 0) return null;
  return (
    <div className="mb-2">
      <div className="px-1 py-0.5 text-xs text-fg-muted">{title}</div>
      <ul>
        {files.map((f) => (
          <li
            key={f.path}
            className="group flex items-center gap-2 rounded px-1.5 py-1 hover:bg-bg-inset"
          >
            <FileStatusBadge status={f.status} />
            <span className="min-w-0 flex-1 truncate" title={f.path}>
              {f.path}
            </span>
            <button
              onClick={() => onAction(f.path)}
              disabled={disabled}
              className="shrink-0 text-fg-muted opacity-0 hover:text-fg group-hover:opacity-100"
            >
              {actionIcon}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
