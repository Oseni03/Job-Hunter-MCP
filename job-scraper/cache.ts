import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Persistent HTTP body cache shared by every scraper adapter (via http.ts).
 * Entries honor the per-request TTL passed to http.get; memory stays the
 * fast path and disk makes repeat CLI runs instant. Best-effort: any disk
 * failure degrades to a plain network fetch, never an error.
 *
 * Layout: one JSON file per URL ({ expiresAt, body }), keyed by sha256.
 * Env: SCRAPER_CACHE_DIR overrides the directory,
 * SCRAPER_CACHE_DISABLE=1 bypasses disk entirely (used by tests).
 */

export const SEARCH_CACHE_TTL_MS = 30 * 60_000;
export const DETAIL_CACHE_TTL_MS = 7 * 24 * 3_600_000;
const MAX_FILES = 2000;
const PRUNE_TO = 1500;

export function cacheDir(): string | undefined {
	if (process.env.SCRAPER_CACHE_DISABLE === "1") return undefined;
	return process.env.SCRAPER_CACHE_DIR ?? path.join(process.cwd(), ".scratch", "scrape-cache");
}

function keyPath(dir: string, cacheKey: string): string {
	return path.join(dir, `${createHash("sha256").update(cacheKey).digest("hex")}.json`);
}

export async function readDiskCache(cacheKey: string): Promise<string | undefined> {
	const dir = cacheDir();
	if (!dir) return undefined;
	try {
		const raw = await readFile(keyPath(dir, cacheKey), "utf8");
		const entry = JSON.parse(raw) as { expiresAt?: unknown; body?: unknown };
		if (typeof entry.expiresAt !== "number" || typeof entry.body !== "string") {
			await unlink(keyPath(dir, cacheKey)).catch(() => undefined);
			return undefined;
		}
		if (entry.expiresAt <= Date.now()) {
			await unlink(keyPath(dir, cacheKey)).catch(() => undefined);
			return undefined;
		}
		return entry.body;
	} catch {
		return undefined;
	}
}

export async function writeDiskCache(cacheKey: string, body: string, ttlMs: number): Promise<void> {
	const dir = cacheDir();
	if (!dir || ttlMs <= 0) return;
	try {
		await mkdir(dir, { recursive: true });
		const target = keyPath(dir, cacheKey);
		const tmp = `${target}.${process.pid}.tmp`;
		await writeFile(tmp, JSON.stringify({ expiresAt: Date.now() + ttlMs, body }), "utf8");
		await rename(tmp, target);
		await prune(dir).catch(() => undefined);
	} catch {
		// best-effort: ignore disk failures
	}
}

async function prune(dir: string): Promise<void> {
	const files = await readdir(dir);
	if (files.length <= MAX_FILES) return;
	const withTime = await Promise.all(
		files.map(async (file) => {
			try {
				const info = await stat(path.join(dir, file));
				return { file, mtime: info.mtimeMs };
			} catch {
				return { file, mtime: 0 };
			}
		}),
	);
	withTime.sort((a, b) => a.mtime - b.mtime);
	const excess = withTime.slice(0, withTime.length - PRUNE_TO);
	await Promise.all(excess.map(({ file }) => unlink(path.join(dir, file)).catch(() => undefined)));
}
