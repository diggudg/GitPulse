import { useState } from "react";
import { ArrowDown, ArrowUp, RefreshCw, ChevronDown } from "lucide-react";
import { useWorkspaceSummary } from "@/features/launchpad/useWorkspaceSummary";
import { fetchRepo, pullRepo } from "@/lib/ipc";
import { useUiStore } from "@/stores/uiStore";

export function SyncButton({ repoPath }: { repoPath: string }) {
  const summaries = useWorkspaceSummary([repoPath]);
  const summary = summaries[0];
  const bumpRefresh = useUiStore((s) => s.bumpRefresh);
  
  const [isOpen, setIsOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  if (!summary || !summary.hasUpstream) return null;

  const handleFetch = async () => {
    setIsSyncing(true);
    try {
      await fetchRepo(repoPath);
      bumpRefresh();
    } catch (e) {
      console.error("Fetch failed", e);
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePull = async (rebase: boolean) => {
    setIsOpen(false);
    setIsSyncing(true);
    try {
      await pullRepo(repoPath, rebase);
      bumpRefresh();
    } catch (e) {
      console.error("Pull failed", e);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center rounded-md border border-border bg-bg-elevated text-sm">
        <button
          type="button"
          onClick={handleFetch}
          disabled={isSyncing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-fg hover:bg-accent hover:text-accent-fg disabled:opacity-50"
          title="Fetch"
        >
          <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
          {(summary.ahead > 0 || summary.behind > 0) ? (
            <span className="flex items-center gap-2 font-mono text-xs">
              {summary.behind > 0 && (
                <span className="flex items-center text-blue-400">
                  {summary.behind} <ArrowDown size={12} />
                </span>
              )}
              {summary.ahead > 0 && (
                <span className="flex items-center text-green-400">
                  {summary.ahead} <ArrowUp size={12} />
                </span>
              )}
            </span>
          ) : (
            <span>Sync</span>
          )}
        </button>
        
        <div className="h-4 w-px bg-border" />
        
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center px-1.5 py-1.5 text-fg-muted hover:bg-accent hover:text-accent-fg"
        >
          <ChevronDown size={14} />
        </button>
      </div>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-32 rounded-md border border-border bg-bg-elevated py-1 shadow-lg">
          <button
            type="button"
            onClick={() => handlePull(false)}
            className="w-full px-3 py-1.5 text-left text-sm text-fg hover:bg-accent hover:text-accent-fg"
          >
            Pull (Fast-forward)
          </button>
          <button
            type="button"
            onClick={() => handlePull(true)}
            className="w-full px-3 py-1.5 text-left text-sm text-fg hover:bg-accent hover:text-accent-fg"
          >
            Pull (Rebase)
          </button>
        </div>
      )}
    </div>
  );
}
