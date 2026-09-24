import { FileEdit, GitBranch, ArrowUp } from "lucide-react";
import { useWorkspaceSummary } from "./useWorkspaceSummary";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import type { RepoSummary } from "@/lib/ipc";

/**
 * Launchpad dashboard. Buckets are driven by live, parallel-polled workspace
 * summaries: uncommitted work, active branches, and unpushed commits. (Remote
 * PR/Issue buckets are a later phase.)
 */
export function Launchpad() {
  const repos = useWorkspaceStore((s) => s.repos);
  const summaries = useWorkspaceSummary(repos.map((r) => r.path));

  const wip = summaries.filter((s) => s.wipCount > 0);
  const unpushed = summaries.filter((s) => s.ahead > 0);

  return (
    <div className="grid flex-1 grid-cols-1 gap-3 overflow-auto p-4 md:grid-cols-3">
      <Bucket
        icon={<FileEdit size={16} />}
        title="Work in Progress"
        empty="No uncommitted work."
        items={wip}
        render={(s) => <Trailing value={`${s.wipCount} change${s.wipCount === 1 ? "" : "s"}`} />}
      />
      <Bucket
        icon={<GitBranch size={16} />}
        title="Active Branches"
        empty="No repositories."
        items={summaries}
        render={(s) => <Trailing value={s.head ?? "detached"} muted />}
      />
      <Bucket
        icon={<ArrowUp size={16} />}
        title="Unpushed Commits"
        empty="Everything is pushed."
        items={unpushed}
        render={(s) => <Trailing value={`${s.ahead} ahead`} />}
      />
    </div>
  );
}

function Bucket({
  icon,
  title,
  empty,
  items,
  render,
}: {
  icon: React.ReactNode;
  title: string;
  empty: string;
  items: RepoSummary[];
  render: (s: RepoSummary) => React.ReactNode;
}) {
  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-border bg-bg-elevated">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm font-semibold text-fg">
        {icon}
        {title}
        <span className="ml-auto rounded-full bg-bg-inset px-2 text-xs text-fg-muted">
          {items.length}
        </span>
      </header>
      {items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-6 text-sm text-fg-muted">
          {empty}
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {items.map((s) => (
            <RepoRow key={s.path} summary={s} trailing={render(s)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RepoRow({ summary, trailing }: { summary: RepoSummary; trailing: React.ReactNode }) {
  const openTab = useWorkspaceStore((s) => s.openTab);

  return (
    <li>
      <button
        type="button"
        onClick={() => openTab(summary.path)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-bg-inset"
      >
        <span className="min-w-0 flex-1 truncate text-fg">{summary.name}</span>
        {trailing}
      </button>
    </li>
  );
}

function Trailing({ value, muted }: { value: string; muted?: boolean }) {
  return (
    <span className={`shrink-0 text-xs ${muted ? "text-fg-muted" : "text-accent"}`}>{value}</span>
  );
}
