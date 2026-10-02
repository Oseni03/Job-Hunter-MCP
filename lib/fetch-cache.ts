/**
 * Shared fetch cache (issue 15), stated narrowly: fetch results only
 * (normalized URL → text, status, escalation steps, fetchedAt) with a short
 * TTL for successes and a much shorter one for failures.
 *
 * - Key: normalized URL (fragment stripped, host lowercased, trimmed).
 * - Success TTL: 6 hours (named constant).
 * - Failure TTL: 15 minutes — a transient timeout must never become a
 *   long-lived `unavailable`.
 * - Home: in-memory per process, used by the rank scoring loop and the
 *   analyze-job fetch path. This preserves the no-server-state contract
 *   (caller-held seen stores, tracker, items stay host-side): the cache is
 *   a fetch perf layer only, with the documented limitation that it does
 *   not survive restarts or scale across instances.
 * - Failures still degrade per-item to `unavailable`, never to invented
 *   content.
 */

export const FETCH_CACHE_SUCCESS_TTL_MS = 6 * 60 * 60 * 1000;
export const FETCH_CACHE_FAILURE_TTL_MS = 15 * 60 * 1000;

export interface CachedFetch {
  ok: boolean;
  text: string | null;
  finalUrl: string;
  steps: string[];
  fetchedAt: number;
}

const store = new Map<string, CachedFetch>();

/** Normalized cache key: fragment stripped, host lowercased, trimmed. */
export function normalizeFetchKey(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();
    return parsed.toString();
  } catch {
    return trimmed.split("#")[0].trim().toLowerCase();
  }
}

export function getFetchCache(rawUrl: string, nowMs: number = Date.now()): CachedFetch | null {
  const key = normalizeFetchKey(rawUrl);
  const entry = store.get(key);
  if (!entry) {
    return null;
  }
  const ttl = entry.ok ? FETCH_CACHE_SUCCESS_TTL_MS : FETCH_CACHE_FAILURE_TTL_MS;
  if (nowMs - entry.fetchedAt > ttl) {
    store.delete(key);
    return null;
  }
  return entry;
}

export function setFetchCache(rawUrl: string, value: Omit<CachedFetch, "fetchedAt">, nowMs: number = Date.now()): void {
  const key = normalizeFetchKey(rawUrl);
  store.set(key, { ...value, fetchedAt: nowMs });
}

/** Test seam: clears the per-process cache. */
export function clearFetchCache(): void {
  store.clear();
}
