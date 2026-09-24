import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, FolderSearch, GitFork, Trash2 } from "lucide-react";
import { Launchpad } from "@/features/launchpad/Launchpad";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { RepoMeta } from "@/lib/ipc";

export function HomeTab() {
  const { repos, addRepo, scanFolder, openTab, removeRepo } = useWorkspaceStore();
  const [scanning, setScanning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function pickRepo() {
    const dir = await open({ directory: true, multiple: false, title: "Open a Git repository" });
    if (typeof dir === "string") await addRepo(dir);
  }

  async function scanParentFolder() {
    const dir = await open({
      directory: true,
      multiple: false,
      title: "Scan a folder for Git repositories",
    });
    if (typeof dir !== "string") return;
    setScanning(true);
    try {
      const added = await scanFolder(dir);
      setToast(added > 0 ? `Added ${added} repositor${added === 1 ? "y" : "ies"}` : "No new repositories found");
    } finally {
      setScanning(false);
      setTimeout(() => setToast(null), 4000);
    }
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
        <h1 className="mr-2 text-base font-semibold text-fg">Workspace</h1>
        <button
          type="button"
          onClick={pickRepo}
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-sm hover:bg-bg-inset"
        >
          <FolderOpen size={15} /> Open Repo
        </button>
        <button
          type="button"
          onClick={scanParentFolder}
          disabled={scanning}
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-sm hover:bg-bg-inset disabled:opacity-50"
          title="Scan a folder and add every Git repository inside it"
        >
          <FolderSearch size={15} /> {scanning ? "Scanning…" : "Scan Folder"}
        </button>
        {toast && <span className="text-xs text-fg-muted">{toast}</span>}
        <span className="ml-auto text-xs text-fg-muted">{repos.length} repositories</span>
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr] gap-0 overflow-hidden lg:grid-cols-[20rem_1fr] lg:grid-rows-1">
        <RepoList repos={repos} onOpen={openTab} onRemove={removeRepo} />
        <div className="min-h-0 overflow-hidden border-t border-border lg:border-l lg:border-t-0">
          <Launchpad />
        </div>
      </div>
    </div>
  );
}

function RepoList({
  repos,
  onOpen,
  onRemove,
}: {
  repos: RepoMeta[];
  onOpen: (path: string) => void;
  onRemove: (path: string) => void;
}) {
  if (repos.length === 0) {
    return (
      <div className="flex items-center justify-center p-6 text-sm text-fg-muted">
        No repositories yet — use Open Repo or Scan Folder.
      </div>
    );
  }
  return (
    <ul className="min-h-0 overflow-y-auto p-2">
      {repos.map((r) => (
        <li
          key={r.path}
          className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-bg-inset"
        >
          <GitFork size={14} className="shrink-0 text-fg-muted" />
          <button
            type="button"
            onClick={() => onOpen(r.path)}
            className="flex min-w-0 flex-1 flex-col items-start text-left"
            title={r.path}
          >
            <span className="w-full truncate text-fg">{r.name}</span>
            <span className="w-full truncate text-xs text-fg-muted">{r.head ?? "detached"}</span>
          </button>
          <button
            type="button"
            onClick={() => onRemove(r.path)}
            className="shrink-0 rounded p-1 text-fg-muted opacity-0 hover:bg-bg-elevated hover:text-danger group-hover:opacity-100"
            aria-label={`Remove ${r.name}`}
            title="Remove from workspace"
          >
            <Trash2 size={14} />
          </button>
        </li>
      ))}
    </ul>
  );
}
