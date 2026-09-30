import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { McpServer } from "@modelcontextprotocol/server";

import { registerResearchCompany } from "@/lib/mcp/tools/research-company.ts";
import { normalizeCompany, readResearchCache, researchCompany } from "@/lib/research-company.ts";
import type { FetchLike } from "@/lib/fetch-posting.ts";

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
				url.startsWith("https://"),
				`only company-derived searches and fetches may run, got ${url}`,
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
		assert.ok(
			!calls.includes("https://html.duckduckgo.com/html/?q=Acme"),
			"caller-supplied official URL skips the official-site discovery search",
		);
	});
});

describe("researchCompany verification (ticket 09)", () => {
	function categoryRoutes(): Record<string, { status: number; body: string }> {
		return {
			"https://html.duckduckgo.com/html/?q=Acme%20Corp": {
				status: 200,
				body: `<a href="https://acme.com?uddg=https%3A%2F%2Facme.com">Acme</a>`,
			},
			"https://acme.com": {
				status: 200,
				body: "<html><head><title>Acme Corp</title></head><body><p>Acme Corp builds widgets for European payments. Founded 2010 in Berlin.</p></body></html>",
			},
			"https://html.duckduckgo.com/html/?q=Acme%20Corp%20reviews": {
				status: 200,
				body: `<a href="https://reviews.example/acme?uddg=https%3A%2F%2Freviews.example%2Facme">reviews</a>`,
			},
			"https://reviews.example/acme": {
				status: 200,
				body: "<html><head><title>Acme reviews</title></head><body><p>Employees rate Acme Corp 4.1 for work life balance.</p></body></html>",
			},
			"https://html.duckduckgo.com/html/?q=Acme%20Corp%20team": {
				status: 200,
				body: `<a href="https://linkedin.example/company/acme?uddg=https%3A%2F%2Flinkedin.example%2Fcompany%2Facme">team</a>`,
			},
			"https://linkedin.example/company/acme": {
				status: 200,
				body: "<html><head><title>Acme team</title></head><body><p>Acme Corp payments team hires ML engineers in Berlin.</p></body></html>",
			},
			"https://html.duckduckgo.com/html/?q=Acme%20Corp%20news": {
				status: 200,
				body: `<a href="https://media.example/acme-launch?uddg=https%3A%2F%2Fmedia.example%2Facme-launch">news</a>`,
			},
			"https://media.example/acme-launch": {
				status: 200,
				body: "<html><head><title>Acme news</title></head><body><p>Acme Corp launched a fraud detection product in 2025.</p></body></html>",
			},
		};
	}

	it("researches website, reviews, team signals, and media from the company name and official site only", async () => {
		const { fetchImpl, calls } = mockFetch(categoryRoutes());
		const result = await researchCompany({ company: "Acme Corp", cacheDir: tempDir(), fetchImpl });
		assert.equal(result.cached, false);
		for (const category of ["website", "reviews", "linkedin", "media"] as const) {
			assert.ok(result.entry.sources[category]?.url, `missing ${category} source`);
			assert.ok((result.entry.sources[category]?.notes ?? "").length > 0, `missing ${category} notes`);
		}
		for (const url of calls) {
			assert.ok(
				url.startsWith("https://"),
				`only company-derived searches and fetches may run, got ${url}`,
			);
		}
	});

	it("verifies every claim against a fetched page, treating snippets as leads only", async () => {
		const { fetchImpl } = mockFetch(categoryRoutes());
		const result = await researchCompany({ company: "Acme Corp", cacheDir: tempDir(), fetchImpl });
		assert.ok(result.claims.length > 0, "expected verified claims");
		for (const claim of result.claims) {
			assert.equal(claim.verified, true);
			assert.ok(claim.text.length > 10, "claim carries text");
			assert.ok(claim.sourceUrl.startsWith("https://"), "claim traces to a fetched page");
		}
		assert.ok(result.verification.verifiedCount >= 1);
		assert.ok(typeof result.verification.droppedCount === "number");
	});

	it("records source URLs plus interviewer notes as data, never instructions", async () => {
		const { fetchImpl } = mockFetch(categoryRoutes());
		const result = await researchCompany({ company: "Acme Corp", cacheDir: tempDir(), fetchImpl });
		assert.ok((result.entry.interviewer_notes ?? "").length > 0, "interviewer angle present");
		assert.ok(
			(result.entry.network_contacts_note ?? "").length > 0 || result.entry.sources.linkedin,
			"team-signal note present",
		);
		const blob = JSON.stringify(result.entry).toLowerCase();
		assert.ok(!blob.includes("follow these instructions"), "research stores data, never instructions");
	});

	it("returns cache file plus text with fresh fetch date for the host write", async () => {
		const { fetchImpl } = mockFetch(categoryRoutes());
		const dir = tempDir();
		const result = await researchCompany({ company: "Acme Corp", cacheDir: dir, fetchImpl });
		assert.equal(result.cacheFile, join(dir, "acme-corp.json"));
		assert.ok(result.cacheText.includes("acme-corp") || result.cacheText.includes("Acme Corp"));
		assert.match(result.entry.fetched_date, /^\d{4}-\d{2}-\d{2}$/);
		const parsed = JSON.parse(result.cacheText) as { fetched_date: string };
		assert.equal(parsed.fetched_date, result.entry.fetched_date);
	});

	it("reports what was verified and from where within the trust boundary", async () => {
		const { fetchImpl } = mockFetch(categoryRoutes());
		const result = await researchCompany({ company: "Acme Corp", cacheDir: tempDir(), fetchImpl });
		assert.ok(result.trustNote.includes("untrusted"), "trust boundary stated");
		assert.ok(result.fetchSteps.length > 0, "fetch escalation reported");
		assert.ok(
			result.verification.sources.length > 0,
			"verification lists the fetched source URLs",
		);
	});
});

describe("research-company tool", () => {
	type ToolResult = {
		content: { type: string; text: string }[];
		structuredContent?: Record<string, unknown>;
		isError?: boolean;
	};
	type LooseHandler = (input: Record<string, unknown>, extra: unknown) => Promise<ToolResult>;

	function registered(): { name: string; handler: unknown }[] {
		const captured: { name: string; handler: unknown }[] = [];
		const server = {
			registerTool(name: string, _config: unknown, handler: unknown) {
				captured.push({ name, handler });
			},
		} as unknown as McpServer;
		registerResearchCompany(server);
		return captured;
	}

	it("registers under research-company", () => {
		const tools = registered();
		assert.equal(tools.length, 1);
		assert.equal(tools[0].name, "research-company");
	});

	it("researches with cache-first verification and host-owned cache write", async () => {
		const tools = registered();
		const realCwd = process.cwd();
		const dir = mkdtempSync(join(tmpdir(), "research-tool-"));
		process.chdir(dir);
		try {
			const result = await (tools[0].handler as LooseHandler)(
				{
					company: "Acme Corp",
					companyUrl: "https://acme.example",
					cacheText: JSON.stringify({
						company: "Acme Corp",
						fetched_date: new Date().toISOString().slice(0, 10),
						sources: { website: { url: "https://acme.example", notes: "cached discovery" } },
					}),
				},
				{},
			);
			assert.equal(result.isError, undefined);
			const structured = result.structuredContent as Record<string, unknown>;
			assert.equal(structured["cached"], true);
			assert.ok((structured["cacheFile"] as string).endsWith("acme-corp.json"));
			assert.ok((structured["cacheText"] as string).includes("Acme Corp"));
			assert.ok(result.content[0].text.includes("untrusted"));
		} finally {
			process.chdir(realCwd);
		}
	});
});
