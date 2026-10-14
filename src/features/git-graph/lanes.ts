import type { Commit } from "@/lib/ipc";

/**
 * Commit-graph lane assignment (the GitKraken-style swimlane algorithm).
 *
 * Input commits are ordered newest→oldest. We walk them top-to-bottom keeping a
 * set of "active lanes", each holding the SHA it currently expects next (i.e. the
 * commit that will sit in that column further down). Output is one self-contained
 * `GraphRow` per commit describing exactly what to draw in that row's cell — so
 * the renderer can virtualize and draw only visible rows (O(visible)).
 *
 * Lane columns are kept stable (freed lanes become reusable gaps, never shifted)
 * so pass-through lines are simple verticals.
 */

/** Vivid, GitKraken-like swimlane palette (used directly as SVG stroke colors). */
export const LANE_COLORS = [
  "#3fb950", // green
  "#2f81f7", // blue
  "#bc8cff", // purple
  "#f778ba", // pink
  "#e3b341", // amber
  "#39c5cf", // cyan
  "#ff7b72", // red
  "#a371f7", // violet
  "#db61a2", // magenta
  "#f0883e", // orange
];

export interface LaneLine {
  lane: number;
  color: string;
}

export interface GraphRow {
  commit: Commit;
  /** Column of this commit's node. */
  nodeLane: number;
  /** Node color (its lane's color). */
  color: string;
  /** Lanes passing straight through this row (vertical lines), excluding the node. */
  passLanes: LaneLine[];
  /** Lanes arriving from above that merge into the node (converging curves). */
  mergedFrom: LaneLine[];
  /** Lanes leaving the node downward for extra parents (diverging curves). */
  branchedTo: LaneLine[];
  /** Whether the node has an incoming edge from a newer commit above it. */
  hasTop: boolean;
  /** Whether the node's lane continues below (first parent); false for roots. */
  hasBottom: boolean;
}

export interface GraphLayout {
  rows: GraphRow[];
  laneCount: number;
}

export function assignLanes(commits: Commit[]): GraphLayout {
  const lanes: (string | null)[] = []; // expected SHA per lane (null = free)
  const colors: string[] = []; // color per lane
  let colorCounter = 0;
  const nextColor = () => LANE_COLORS[colorCounter++ % LANE_COLORS.length];

  const allocLane = (sha: string): number => {
    let idx = lanes.findIndex((l) => l === null);
    if (idx === -1) {
      idx = lanes.length;
      lanes.push(null);
      colors.push("");
    }
    lanes[idx] = sha;
    colors[idx] = nextColor();
    return idx;
  };

  const snapshot = (): Map<number, string> => {
    const m = new Map<number, string>();
    for (let i = 0; i < lanes.length; i++) if (lanes[i] !== null) m.set(i, colors[i]);
    return m;
  };

  const rows: GraphRow[] = [];
  let maxLane = 0;

  for (const commit of commits) {
    const { sha, parents } = commit;

    // Lanes that were waiting for this commit.
    const expecting: number[] = [];
    for (let i = 0; i < lanes.length; i++) if (lanes[i] === sha) expecting.push(i);

    const nodeLane = expecting.length > 0 ? expecting[0] : allocLane(sha);
    const nodeColor = colors[nodeLane];

    const top = snapshot(); // lanes entering this row (node lane included)

    // First parent continues the node's lane; a root frees it.
    lanes[nodeLane] = parents.length > 0 ? parents[0] : null;
    // Other lanes that expected this commit have merged in — free them.
    for (const l of expecting) if (l !== nodeLane) lanes[l] = null;

    // Extra parents fan out into existing or new lanes.
    const branchedTo: LaneLine[] = [];
    for (let p = 1; p < parents.length; p++) {
      const existing = lanes.findIndex((l) => l === parents[p]);
      const target = existing >= 0 ? existing : allocLane(parents[p]);
      branchedTo.push({ lane: target, color: colors[target] });
    }

    const bottom = snapshot(); // lanes leaving this row

    const passLanes: LaneLine[] = [];
    const mergedFrom: LaneLine[] = [];
    for (const [l, c] of top) {
      if (l === nodeLane) continue;
      if (bottom.has(l)) passLanes.push({ lane: l, color: c });
      else mergedFrom.push({ lane: l, color: c });
    }

    const rowMax = Math.max(
      nodeLane,
      ...passLanes.map((l) => l.lane),
      ...mergedFrom.map((l) => l.lane),
      ...branchedTo.map((l) => l.lane),
    );
    if (rowMax > maxLane) maxLane = rowMax;

    rows.push({
      commit,
      nodeLane,
      color: nodeColor,
      passLanes,
      mergedFrom,
      branchedTo,
      hasTop: expecting.length > 0,
      hasBottom: bottom.has(nodeLane),
    });
  }

  return { rows, laneCount: maxLane + 1 };
}
