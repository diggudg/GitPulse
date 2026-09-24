import { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { assignLanes, type GraphRow } from "./lanes";
import { useCommitGraph } from "./useCommitGraph";
import { Avatar } from "@/features/commit/Avatar";
import { useSelection, useUiStore } from "@/stores/uiStore";
import type { RepoMeta, RefLabel } from "@/lib/ipc";

const ROW_H = 32;
const LANE_W = 16;
const NODE_R = 4.5;

export function CommitGraph({ repo }: { repo: RepoMeta }) {
  const refreshKey = useUiStore((s) => s.refreshKey);
  const selectCommit = useUiStore((s) => s.selectCommit);
  const { sha: selectedSha } = useSelection(repo.path);
  const { commits, hasMore, error, loadMore } = useCommitGraph(repo.path, refreshKey);

  const { rows, laneCount } = useMemo(() => assignLanes(commits), [commits]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 20,
  });

  // Infinite scroll: load the next page as the last row approaches.
  const items = virtualizer.getVirtualItems();
  const lastIndex = items.length ? items[items.length - 1].index : 0;
  useEffect(() => {
    if (hasMore && lastIndex >= rows.length - 25) loadMore();
  }, [lastIndex, hasMore, rows.length, loadMore]);

  const graphWidth = Math.max(laneCount * LANE_W + LANE_W, LANE_W * 2);

  if (error) return <div className="p-4 text-sm text-danger">Failed to load history: {error}</div>;
  if (commits.length === 0)
    return <div className="p-4 text-sm text-fg-muted">Loading history…</div>;

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {items.map((vi) => {
          const row = rows[vi.index];
          return (
            <button
              type="button"
              key={row.commit.sha}
              aria-label={row.commit.summary}
              className={`absolute left-0 right-0 flex cursor-pointer items-center text-left text-sm ${
                selectedSha === row.commit.sha ? "bg-bg-inset" : "hover:bg-bg-elevated"
              }`}
              style={{ top: vi.start, height: ROW_H }}
              onClick={() => selectCommit(repo.path, row.commit.sha)}
            >
              <LaneCell row={row} width={graphWidth} />
              <RowContent row={row} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** SVG cell drawing this row's swimlane segments and node. */
function LaneCell({ row, width }: { row: GraphRow; width: number }) {
  const x = (lane: number) => lane * LANE_W + LANE_W / 2;
  const nodeX = x(row.nodeLane);
  const mid = ROW_H / 2;

  return (
    <svg width={width} height={ROW_H} className="shrink-0" style={{ display: "block" }}>
      {/* Pass-through lanes: straight verticals. */}
      {row.passLanes.map((l) => (
        <line key={`p${l.lane}`} x1={x(l.lane)} y1={0} x2={x(l.lane)} y2={ROW_H} stroke={l.color} strokeWidth={2} />
      ))}
      {/* Node's lane to the top edge. */}
      <line x1={nodeX} y1={0} x2={nodeX} y2={mid} stroke={row.color} strokeWidth={2} />
      {/* Node's lane continuing below (first parent). */}
      {row.hasBottom && (
        <line x1={nodeX} y1={mid} x2={nodeX} y2={ROW_H} stroke={row.color} strokeWidth={2} />
      )}
      {/* Lanes merging into the node from above (curves). */}
      {row.mergedFrom.map((l) => (
        <path
          key={`m${l.lane}`}
          d={`M ${x(l.lane)} 0 C ${x(l.lane)} ${mid}, ${nodeX} ${mid}, ${nodeX} ${mid}`}
          fill="none"
          stroke={l.color}
          strokeWidth={2}
        />
      ))}
      {/* Lanes branching out of the node downward (curves). */}
      {row.branchedTo.map((l) => (
        <path
          key={`b${l.lane}`}
          d={`M ${nodeX} ${mid} C ${nodeX} ${mid}, ${x(l.lane)} ${mid}, ${x(l.lane)} ${ROW_H}`}
          fill="none"
          stroke={l.color}
          strokeWidth={2}
        />
      ))}
      <circle cx={nodeX} cy={mid} r={NODE_R} fill={row.color} stroke="var(--color-bg)" strokeWidth={1.5} />
    </svg>
  );
}

function RowContent({ row }: { row: GraphRow }) {
  const c = row.commit;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 pr-3">
      <div className="flex shrink-0 gap-1">
        {c.refs.map((r) => (
          <RefPill key={r.kind + r.name} refLabel={r} />
        ))}
      </div>
      <span className="min-w-0 flex-1 truncate text-fg" title={c.summary}>
        {c.summary}
      </span>
      <Avatar name={c.author} email={c.email} size={18} />
      <span
        className="hidden w-28 shrink-0 truncate text-xs text-fg-muted lg:block"
        title={c.author || undefined}
      >
        {c.author}
      </span>
      <span className="w-20 shrink-0 text-right text-xs text-fg-muted">{relativeTime(c.time)}</span>
      <code className="w-14 shrink-0 text-right text-xs text-fg-muted">{c.sha.slice(0, 7)}</code>
    </div>
  );
}

function RefPill({ refLabel }: { refLabel: RefLabel }) {
  const styles: Record<RefLabel["kind"], string> = {
    head: "border-ref-head text-ref-head",
    localBranch: "border-ref-branch text-ref-branch",
    remoteBranch: "border-ref-branch/70 text-ref-branch/90",
    tag: "border-ref-tag text-ref-tag",
  };
  return (
    <span
      className={`max-w-[10rem] truncate rounded-full border px-1.5 text-[11px] leading-5 ${styles[refLabel.kind]}`}
      title={refLabel.name}
    >
      {refLabel.name}
    </span>
  );
}

function relativeTime(unixSeconds: number): string {
  const diff = Date.now() / 1000 - unixSeconds;
  const d = Math.floor(diff / 86400);
  if (d > 365) return `${Math.floor(d / 365)}y`;
  if (d > 30) return `${Math.floor(d / 30)}mo`;
  if (d >= 1) return `${d}d`;
  const h = Math.floor(diff / 3600);
  if (h >= 1) return `${h}h`;
  const m = Math.floor(diff / 60);
  return m >= 1 ? `${m}m` : "now";
}
