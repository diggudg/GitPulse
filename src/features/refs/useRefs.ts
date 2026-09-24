import { repoRefs } from "@/lib/ipc";
import { useAsync } from "@/hooks/useAsync";
import { useUiStore } from "@/stores/uiStore";

/** Load a repo's refs (branches/tags/stashes), reloading on refresh signals. */
export function useRefs(repoPath: string) {
  const refreshKey = useUiStore((s) => s.refreshKey);
  const { data, error, loading } = useAsync(
    () => repoRefs(repoPath),
    [repoPath, refreshKey],
  );
  return { refs: data, error, loading };
}
