import { useEffect, useState, type DependencyList } from "react";

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/**
 * Run an async function on dependency change, with automatic cancellation so a
 * result from a superseded/unmounted call never lands in state. Centralizes the
 * fetch-with-cleanup pattern shared by the data-loading hooks (DRY).
 *
 * Pass `null` as `fn` to represent "nothing to load" (returns idle state).
 */
export function useAsync<T>(
  fn: (() => Promise<T>) | null,
  deps: DependencyList,
): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    error: null,
    loading: fn !== null,
  });

  useEffect(() => {
    if (!fn) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    let cancelled = false;
    setState({ data: null, error: null, loading: true });
    fn()
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((e) => {
        if (!cancelled) setState({ data: null, error: String(e), loading: false });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
