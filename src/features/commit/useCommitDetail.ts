import { commitDetail } from "@/lib/ipc";
import { useAsync } from "@/hooks/useAsync";

export function useCommitDetail(repoPath: string, sha: string | null) {
  const { data, error } = useAsync(
    sha ? () => commitDetail(repoPath, sha) : null,
    [repoPath, sha],
  );
  return { detail: data, error };
}
