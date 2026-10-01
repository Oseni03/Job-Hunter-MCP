/**
 * Bounded fetch concurrency (issue 15). Per-item results are collected per
 * input index and emitted in input order, never completion order —
 * deterministic output is load-bearing and parallelism must not quietly
 * break it. Per-item timeouts bound the worst case.
 *
 * Home: the rank scoring loop and the research category loop ride this
 * bound.
 */

/** Max parallel fetches per plan call; politeness + determinism over speed. */
export const FETCH_CONCURRENCY = 3;
/** Per-item wall-clock bound; a slow posting degrades to unavailable, never hangs the run. */
export const FETCH_ITEM_TIMEOUT_MS = 15000;

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  }) as Promise<T>;
}

/**
 * Runs `fn` over `items` with at most `limit` in flight. Results are placed
 * by input index, so output order always matches input order regardless of
 * completion order or jittered timing.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const capped = Math.max(1, Math.min(limit, items.length === 0 ? 1 : items.length));
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await fn(items[index], index);
    }
  }
  const workers = Array.from({ length: Math.min(capped, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
