import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { normalizeCompany, readResearchCache, researchCompany } from "../research-company.ts";
import type { FetchLike } from "../fetch-posting.ts";

function tempDir(): string {
	return mkdtempSync(join(tmpdir(), "research-test-"));
}

function daysAgo(days: number): string {
	const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
	return date.toISOString().slice(0, 10);
}

function mockFetch(routes: Record<string, { status: number; body: string }>): {
	fetchImpl: FetchLike;
	calls: string[];
} {
	const calls: string[] = [];
	const fetchImpl: FetchLike = async (url, headers = {}) => {
		void headers;
		calls.push(url);
		return routes[url] ?? { status: 404, body: "not found" };
	};
	return { fetchImpl, calls };
}

describe("normalizeCompany", () => {
	it("lowercases and hyphenates for the cache filename", () => {
		assert.equal(normalizeCompany("Acme Corp"), "acme-corp");
	});
});

describe("readResearchCache", () => {
	it("hits a fresh cache entry without fetching", () => {
		const dir = tempDir();
		writeFileSync(
			join(dir, "acme-corp.json"),
			JSON.stringify({ company: "Acme Corp", fetched_date: daysAgo(5), sources: {} }),
		);
		const result = readResearchCache(dir, "Acme Corp", new Date());
		assert.equal(result.hit, true);
		assert.equal(result.entry?.company, "Acme Corp");
	});

	it("treats a recent entry as fresh and a 31-day-old one as stale", () => {
		const dir = tempDir();
		writeFileSync(
			join(dir, "acme-corp.json"),
			JSON.stringify({ company: "Acme Corp", fetched_date: daysAgo(29), sources: {} }),
		);
		assert.equal(readResearchCache(dir, "Acme Corp", new Date()).hit, true);
		writeFileSync(
			join(dir, "acme-corp.json"),
			JSON.stringify({ company: "Acme Corp", fetched_date: daysAgo(31), sources: {} }),
		);
		const stale = readResearchCache(dir, "Acme Corp", new Date());
		assert.equal(stale.hit, false);
		assert.equal(stale.stale, true);
	});

	it("misses when no cache file exists", () => {
		const result = readResearchCache(tempDir(), "Acme Corp", new Date());
		assert.equal(result.hit, false);
		assert.equal(result.stale, false);
	});
});

describe("researchCompany", () => {
	it("returns the fresh cache entry and fetches nothing", async () => {
		const dir = tempDir();
		writeFileSync(
			join(dir, "acme-corp.json"),
			JSON.stringify({
				company: "Acme Corp",
				fetched_date: daysAgo(2),
				sources: { website: { url: "https://acme.com", notes: "cached" } },
			}),
		);
		const { fetchImpl, calls } = mockFetch({});
		const result = await researchCompany({ company: "Acme Corp", cacheDir: dir, fetchImpl });
		assert.equal(result.cached, true);
		assert.equal(result.entry.sources.website?.notes, "cached");
		assert.equal(calls.length, 0);
	});

	it("researches the official site from the company name when the cache is stale", async () => {
		const dir = tempDir();
		writeFileSync(
			join(dir, "acme-corp.json"),
			JSON.stringify({ company: "Acme Corp", fetched_date: daysAgo(60), sources: {} }),
		);
		const { fetchImpl, calls } = mockFetch({
			"https://html.duckduckgo.com/html/?q=Acme%20Corp": {
				status: 200,
				body: `<a href="https://acme.com?uddg=https%3A%2F%2Facme.com">Acme</a>`,
			},
			"https://acme.com": {
				status: 200,
				body: "<html><head><title>Acme Corp</title></head><body><p>We build widgets.</p></body></html>",
			},
		});
		const result = await researchCompany({ company: "Acme Corp", cacheDir: dir, fetchImpl });
		assert.equal(result.cached, false);
		assert.equal(result.entry.sources.website?.url, "https://acme.com");
		assert.match(result.entry.sources.website?.notes ?? "", /widgets/);
		assert.equal(result.cacheFile, join(dir, "acme-corp.json"));
		for (const url of calls) {
			assert.ok(
				url.includes("acme.com") || url.includes("duckduckgo"),
				`only company-derived URLs may be fetched, got ${url}`,
			);
		}
	});

	it("uses a caller-supplied official URL without searching", async () => {
		const { fetchImpl, calls } = mockFetch({
			"https://acme.example": {
				status: 200,
				body: "<html><head><title>Acme</title></head><body><p>Official site.</p></body></html>",
			},
		});
		const result = await researchCompany({
			company: "Acme",
			cacheDir: tempDir(),
			fetchImpl,
			companyUrl: "https://acme.example",
		});
		assert.equal(result.cached, false);
		assert.equal(result.entry.sources.website?.url, "https://acme.example");
		assert.ok(!calls.some((url) => url.includes("duckduckgo")));
	});
});
