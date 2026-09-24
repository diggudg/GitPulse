import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels";
import { X } from "lucide-react";
import { RefsPanel } from "@/features/refs/RefsPanel";
import { CommitGraph } from "@/features/git-graph/CommitGraph";
import { DetailPanel } from "@/features/commit/DetailPanel";
import { FileDiff } from "@/features/diff-viewer/DiffView";
import { TerminalPanel } from "@/features/terminal/TerminalPanel";
import { useSelection, useUiStore } from "@/stores/uiStore";
import { fetchRepo, type RepoMeta } from "@/lib/ipc";
import { useEffect } from "react";

export function RepoWorkspace({ repo }: { repo: RepoMeta }) {
  const { sha, file } = useSelection(repo.path);
  const selectFile = useUiStore((s) => s.selectFile);
  const terminalVisible = useUiStore((s) => s.terminalVisible);

  // Persist panel sizes across relaunches.
  const layout = useDefaultLayout({ id: "gitpulse-workspace", storage: localStorage });
  const verticalLayout = useDefaultLayout({ id: "gitpulse-workspace-v", storage: localStorage });

  // Auto-fetch in the background every 2 minutes
  useEffect(() => {
    let active = true;
    const autoFetch = async () => {
      try {
        await fetchRepo(repo.path);
        if (active) {
          useUiStore.getState().bumpRefresh();
        }
      } catch (e) {
        // Silently ignore background fetch errors
      }
    };

    const intervalId = setInterval(autoFetch, 120_000);
    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, [repo.path]);

  return (
    <Group
      orientation="vertical"
      className="h-full w-full"
      defaultLayout={verticalLayout.defaultLayout}
      onLayoutChanged={verticalLayout.onLayoutChanged}
    >
      <Panel id="top" defaultSize={70} minSize={30} className="min-h-0 flex-1">
        <Group
          orientation="horizontal"
          className="h-full w-full"
          defaultLayout={layout.defaultLayout}
          onLayoutChanged={layout.onLayoutChanged}
        >
          <Panel id="refs" defaultSize={18} minSize={12} className="min-h-0 overflow-hidden bg-bg-elevated">
            <RefsPanel repoPath={repo.path} />
          </Panel>
          <Separator className="w-1 bg-border transition-colors hover:bg-accent" />
          <Panel id="center" defaultSize={56} minSize={30} className="flex min-h-0 flex-col overflow-hidden">
            {file && sha ? (
              <>
                <div className="flex shrink-0 items-center gap-2 border-b border-border bg-bg-elevated px-3 py-1.5 text-sm">
                  <span className="truncate font-mono text-fg" title={file}>
                    {file}
                  </span>
                  <button
                    type="button"
                    onClick={() => selectFile(repo.path, null)}
                    className="ml-auto text-fg-muted hover:text-fg"
                    title="Close diff"
                  >
                    <X size={15} />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto">
                  <FileDiff repoPath={repo.path} sha={sha} file={file} />
                </div>
              </>
            ) : (
              <CommitGraph repo={repo} />
            )}
          </Panel>
          <Separator className="w-1 bg-border transition-colors hover:bg-accent" />
          <Panel id="detail" defaultSize={26} minSize={16} className="min-h-0 overflow-hidden">
            <DetailPanel repoPath={repo.path} />
          </Panel>
        </Group>
      </Panel>
      
      {terminalVisible && (
        <>
          <Separator className="h-1 bg-border transition-colors hover:bg-accent" />
          <Panel id="terminal" defaultSize={30} minSize={10} className="min-h-0 overflow-hidden">
            <TerminalPanel repoPath={repo.path} />
          </Panel>
        </>
      )}
    </Group>
  );
}
