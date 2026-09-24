import { useEffect, useRef, useState } from "react";
import { workspaceSummary, type RepoSummary } from "@/lib/ipc";
import { useUiStore } from "@/stores/uiStore";

const POLL_MS = 5000;

/**
 * Periodically summarizes every workspace repo. The heavy scan runs in parallel
 * in Rust (rayon); this hook just drives it on an interval and on explicit
 * refresh signals, and discards results for a superseded repo set.
 */
export function useWorkspaceSummary(paths: string[]) {
  const [summaries, setSummaries] = useState<RepoSummary[]>([]);
  const refreshKey = useUiStore((s) => s.refreshKey);

  // Stable key so the effect only resubscribes when the set of repos changes,
  // not on every render's new array identity.
  const pathsKey = paths.join("\n");
  const inFlight = useRef(false);

  useEffect(() => {
    if (paths.length === 0) {
      setSummaries([]);
      return;
    }
    let cancelled = false;

    const poll = async () => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        const result = await workspaceSummary(paths);
        if (!cancelled) setSummaries(result);
      } catch {
        // Transient failures are ignored; the next tick retries.
      } finally {
        inFlight.current = false;
      }
    };

    void poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathsKey, refreshKey]);

  return summaries;
}
