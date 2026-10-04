const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1_000;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_USER_AGENT =
  process.env.SCRAPER_USER_AGENT ??
  "JobHuntingToolkit/1.0 (+https://example.com/contact)";

import { readDiskCache, writeDiskCache } from "./cache.ts";

interface GetOptions {
  json?: boolean;
  timeoutMs?: number;
  retries?: number;
  cacheTtlMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
  cache?: boolean;
}

interface CacheEntry {
  expiresAt: number;
  value: unknown;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;
  readonly body: string;

  constructor(status: number, url: string, body: string) {
    super(`HTTP ${status} for ${url}`);
    this.name = "HttpError";
    this.status = status;
    this.url = url;
    this.body = body;
  }
}

export async function get<T = unknown>(url: string, opts: GetOptions & { json: true }): Promise<T>;
export async function get(url: string, opts?: GetOptions & { json?: false }): Promise<string>;
export async function get<T = unknown>(url: string, opts: GetOptions = {}): Promise<T | string> {
  const {
    json = false,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    cacheTtlMs = DEFAULT_CACHE_TTL_MS,
    maxBytes = DEFAULT_MAX_BYTES,
    headers = {},
    cache: useCache = true,
  } = opts;

  const cacheKey = `${json ? "json" : "text"}:${url}`;
  const now = Date.now();

  if (useCache) {
    const hit = cache.get(cacheKey);
    if (hit && hit.expiresAt > now) {
      return hit.value as T | string;
    }
    if (hit) cache.delete(cacheKey);

    // Persistent layer: repeat CLI runs reuse bodies until their TTL lapses.
    try {
      const disk = await readDiskCache(cacheKey);
      if (disk !== undefined) {
        const value = (json ? JSON.parse(disk) : disk) as T | string;
        cache.set(cacheKey, { expiresAt: Date.now() + cacheTtlMs, value });
        return value;
      }
    } catch {
      // corrupt disk entry counts as a miss
    }

    const pending = inFlight.get(cacheKey);
    if (pending) return (await pending) as T | string;
  }

  const request = fetchWithRetry(url, {
    json,
    timeoutMs,
    retries,
    maxBytes,
    headers,
  });

  if (useCache) inFlight.set(cacheKey, request as Promise<unknown>);

  try {
    const value = await request;
    if (useCache) {
      cache.set(cacheKey, {
        expiresAt: Date.now() + cacheTtlMs,
        value,
      });
      try {
        await writeDiskCache(cacheKey, json ? JSON.stringify(value) : String(value), cacheTtlMs);
      } catch {
        // disk cache is best-effort
      }
    }
    return value as T | string;
  } finally {
    if (useCache) inFlight.delete(cacheKey);
  }
}

async function fetchWithRetry(
  url: string,
  options: {
    json: boolean;
    timeoutMs: number;
    retries: number;
    maxBytes: number;
    headers: Record<string, string>;
  },
): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= options.retries; attempt += 1) {
    try {
      const response = await fetchOnce(url, options);

      if (!shouldRetryStatus(response.status) || attempt === options.retries) {
        return parseResponse(response, options.json, options.maxBytes);
      }

      const delayMs = getRetryDelay(response.headers.get("retry-after"), attempt);
      await sleep(delayMs);
    } catch (error) {
      lastError = error;
      if (attempt === options.retries) throw error;
      await sleep(getBackoffDelay(attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("HTTP request failed");
}

async function fetchOnce(
  url: string,
  options: {
    json: boolean;
    timeoutMs: number;
    headers: Record<string, string>;
  },
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    return await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        Accept: options.json ? "application/json, text/plain;q=0.9, */*;q=0.8" : "text/html, application/xml, text/xml, */*;q=0.8",
        "User-Agent": DEFAULT_USER_AGENT,
        ...options.headers,
      },
      redirect: "follow",
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseResponse(response: Response, json: boolean, maxBytes: number): Promise<unknown> {
  const body = await readBody(response, maxBytes);

  if (!response.ok) {
    throw new HttpError(response.status, response.url, body);
  }

  if (json) {
    try {
      return JSON.parse(body) as unknown;
    } catch {
      throw new Error(`Expected JSON from ${response.url}`);
    }
  }

  return body;
}

async function readBody(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let body = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`Response exceeded ${maxBytes} bytes`);
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return body;
  } finally {
    reader.releaseLock();
  }
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function getBackoffDelay(attempt: number): number {
  return 500 * 2 ** attempt;
}

function getRetryDelay(retryAfter: string | null, attempt: number): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1_000, 10_000);
    }

    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) {
      return Math.max(0, Math.min(retryAt - Date.now(), 10_000));
    }
  }

  return getBackoffDelay(attempt);
}

export function clearHttpCache(): void {
  cache.clear();
}

export function httpCacheStats(): { entries: number; inFlight: number } {
  return { entries: cache.size, inFlight: inFlight.size };
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
