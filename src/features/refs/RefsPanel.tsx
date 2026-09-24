import { useState } from "react";
import { ChevronDown, ChevronRight, GitBranch, Cloud, Tag, Archive } from "lucide-react";
import { useRefs } from "./useRefs";
import { useUiStore } from "@/stores/uiStore";
import type { RefEntry, StashEntry } from "@/lib/ipc";

/**
 * Left panel: the active repo's refs (GitKraken-style). Display + select for now;
 * clicking a branch/tag selects its head commit. Checkout/merge are follow-ups.
 */
export function RefsPanel({ repoPath }: { repoPath: string }) {
  const { refs, error, loading } = useRefs(repoPath);
  const selectCommit = useUiStore((s) => s.selectCommit);

  if (error) return <div className="p-3 text-sm text-danger">{error}</div>;
  if (loading || !refs)
    return <div className="p-3 text-sm text-fg-muted">Loading refs…</div>;

  const onPick = (sha: string) => selectCommit(repoPath, sha);

  return (
    <div className="h-full overflow-y-auto py-1 text-sm">
      <Section icon={<GitBranch size={14} />} title="Local" count={refs.localBranches.length}>
        {refs.localBranches.map((b) => (
          <BranchRow key={b.fullName} entry={b} onPick={onPick} />
        ))}
      </Section>
      <Section icon={<Cloud size={14} />} title="Remote" count={refs.remoteBranches.length} defaultOpen={false}>
        {refs.remoteBranches.map((b) => (
          <BranchRow key={b.fullName} entry={b} onPick={onPick} />
        ))}
      </Section>
      <Section icon={<Tag size={14} />} title="Tags" count={refs.tags.length} defaultOpen={false}>
        {refs.tags.map((t) => (
          <BranchRow key={t.fullName} entry={t} onPick={onPick} />
        ))}
      </Section>
      <Section icon={<Archive size={14} />} title="Stashes" count={refs.stashes.length} defaultOpen={false}>
        {refs.stashes.map((s) => (
          <StashRow key={s.sha} entry={s} onPick={onPick} />
        ))}
      </Section>
    </div>
  );
}

function Section({
  icon,
  title,
  count,
  defaultOpen = true,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-fg-muted hover:text-fg"
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {icon}
        <span>{title}</span>
        <span className="ml-auto text-fg-muted">{count}</span>
      </button>
      {open && count > 0 && <div>{children}</div>}
    </div>
  );
}

function BranchRow({ entry, onPick }: { entry: RefEntry; onPick: (sha: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(entry.targetSha)}
      className={`flex w-full items-center gap-1.5 py-1 pl-7 pr-2 text-left hover:bg-bg-inset ${
        entry.isHead ? "text-ref-head" : "text-fg"
      }`}
      title={entry.name}
    >
      <span className="min-w-0 flex-1 truncate">{entry.name}</span>
      {entry.isHead && <span className="shrink-0 text-[10px] uppercase text-ref-head">HEAD</span>}
    </button>
  );
}

function StashRow({ entry, onPick }: { entry: StashEntry; onPick: (sha: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(entry.sha)}
      className="flex w-full items-center gap-1.5 py-1 pl-7 pr-2 text-left text-fg hover:bg-bg-inset"
      title={entry.message}
    >
      <span className="min-w-0 flex-1 truncate">{entry.message}</span>
    </button>
  );
}
