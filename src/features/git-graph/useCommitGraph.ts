import { useCallback, useEffect, useRef, useState } from "react";
import { commitGraph, type Commit } from "@/lib/ipc";

const PAGE_SIZE = 300;

/**
 * Paginated commit-graph loader. Loads one page at a time and appends, so even
 * 50k+ commit repos never materialize fully in memory at once.
 */
export function useCommitGraph(repoPath: string, refreshKey = 0) {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cursor = useRef<string | null>(null);
  const loading = useRef(false);

  // A token that increments per repo so in-flight requests for an old repo are
  // discarded once a new repo becomes active.
  const token = useRef(0);

  const fetchPage = useCallback(
    async (path: string, requestToken: number) => {
      if (loading.current) return;
      loading.current = true;
      try {
        const page = await commitGraph(path, cursor.current, PAGE_SIZE);
        if (requestToken !== token.current) return; // stale repo, drop result
        cursor.current = page.nextCursor;
        setHasMore(page.nextCursor !== null);
        setCommits((prev) => prev.concat(page.commits));
      } catch (e) {
        if (requestToken === token.current) {
          setError(String(e));
          setHasMore(false);
        }
      } finally {
        loading.current = false;
      }
    },
    [],
  );

  // Reset and load the first page whenever the active repo changes, or when
  // `refreshKey` is bumped (e.g. after a new commit lands).
  useEffect(() => {
    void refreshKey; // referenced so a bump retriggers this effect
    token.current += 1;
    const myToken = token.current;
    cursor.current = null;
    loading.current = false;
    setCommits([]);
    setHasMore(true);
    setError(null);
    void fetchPage(repoPath, myToken);
  }, [repoPath, refreshKey, fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasMore) return;
    void fetchPage(repoPath, token.current);
  }, [repoPath, hasMore, fetchPage]);

  return { commits, hasMore, error, loadMore };
}
