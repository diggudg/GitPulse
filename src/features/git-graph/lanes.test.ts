import { describe, it, expect } from "vitest";
import { assignLanes } from "./lanes";
import type { Commit } from "@/lib/ipc";

/** Build a minimal Commit for layout tests (only sha + parents matter). */
function c(sha: string, parents: string[]): Commit {
  return { sha, parents, author: "", email: "", time: 0, summary: sha, refs: [] };
}

describe("assignLanes", () => {
  it("lays linear history in a single lane", () => {
    const { rows, laneCount } = assignLanes([c("A", ["B"]), c("B", ["C"]), c("C", [])]);
    expect(laneCount).toBe(1);
    expect(rows.map((r) => r.nodeLane)).toEqual([0, 0, 0]);
    expect(rows[0].hasBottom).toBe(true);
    expect(rows[2].hasBottom).toBe(false); // root has no continuation
  });

  it("handles a branch and a merge", () => {
    // M merges A and B; both descend from root C.
    const { rows, laneCount } = assignLanes([
      c("M", ["A", "B"]),
      c("A", ["C"]),
      c("B", ["C"]),
      c("C", []),
    ]);
    expect(laneCount).toBe(2);

    const M = rows[0];
    expect(M.branchedTo).toHaveLength(1); // B fans out to a second lane

    const C = rows[3];
    expect(C.mergedFrom).toHaveLength(1); // the two lanes converge into the root
    expect(C.hasBottom).toBe(false);
  });

  it("fans out an octopus merge to multiple lanes", () => {
    const { rows } = assignLanes([
      c("O", ["P1", "P2", "P3"]),
      c("P1", []),
      c("P2", []),
      c("P3", []),
    ]);
    expect(rows[0].branchedTo).toHaveLength(2); // first parent keeps the lane, two fan out
  });

  it("keeps the node lane stable through a pass-through", () => {
    // X is on lane 0; a side branch Y sits on lane 1 and passes through X's row.
    const { rows } = assignLanes([
      c("X", ["W"]),
      c("Y", ["W"]),
      c("W", []),
    ]);
    // Row for Y should show lane 0 (X's continuation toward W) passing through.
    const Yrow = rows[1];
    expect(Yrow.passLanes.some((l) => l.lane === 0)).toBe(true);
  });
});
