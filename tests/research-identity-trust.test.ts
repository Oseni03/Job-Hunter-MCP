import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	normalizeCompany,
	passesOfficialIdentity,
	researchCompany,
} from "@/lib/research-company.ts";
import type { FetchLike } from "@/lib/fetch-posting.ts";

function tempDir(): string {
	return mkdtempSync(join(tmpdir(), "research-identity-"));
}

function mockFetch(routes: Record<string, { status: number; body: string }>): {
	fetchImpl: FetchLike;
	calls: string[];
} {
	const calls: string[] = [];
	const fetchImpl: FetchLike = async (url) => {
		calls.push(url);
		return routes[url] ?? { status: 404, body: "not found" };
	};
	return { fetchImpl, calls };
}

describe("passesOfficialIdentity", () => {
	it("passes when the page names the company", () => {
		assert.equal(
			passesOfficialIdentity("Acme Corp builds widgets in Berlin.", "Acme Corp"),
			true,
		);
	});

	it("fails a wrong Acme that lacks the second company token", () => {
		assert.equal(
			passesOfficialIdentity("Acme Plumbing builds pipes in Texas.", "Acme Corp"),
			false,
		);
	});

	it("fails when the caller-pinned host does not match", () => {
		assert.equal(
			passesOfficialIdentity("Acme builds widgets.", "Acme", {
				pageUrl: "https://other.example/",
				expectedHost: "acme.example",
			}),
			false,
		);
	});
});

describe("researchCompany identity check", () => {
	it("drops the wrong Acme and verifies the next candidate", async () => {
		const { fetchImpl } = mockFetch({
			"https://html.duckduckgo.com/html/?q=Acme%20Corp": {
				status: 200,
				body: `<a href="x?uddg=https%3A%2F%2Fwrong-acme.example">w</a><a href="y?uddg=https%3A%2F%2Facme-corp.example">c</a>`,
			},
			"https://wrong-acme.example": {
				status: 200,
				body: "<html><head><title>Acme Plumbing</title></head><body><p>Acme Plumbing builds pipes in Texas.</p></body></html>",
			},
			"https://acme-corp.example": {
				status: 200,
				body: "<html><head><title>Acme Corp</title></head><body><p>Acme Corp builds widgets in Berlin for European payments.</p></body></html>",
			},
		});
		const result = await researchCompany({
			company: "Acme Corp",
			cacheDir: tempDir(),
			fetchImpl,
		});
		assert.equal(result.entry.sources.website?.url, "https://acme-corp.example");
		assert.ok(
			result.fetchSteps.includes("website:identity-mismatch-dropped"),
			`rejection recorded, got ${result.fetchSteps.join(",")}`,
		);
		const companyDomain = result.claims.filter((claim) => claim.sourcedFrom === "company-domain");
		assert.ok(companyDomain.length > 0, "verified site earns company-domain");
		for (const claim of companyDomain) {
			assert.equal(claim.sourceUrl, "https://acme-corp.example");
		}
	});
});

describe("researchCompany cache keying", () => {
	it("treats a different companyUrl host as a miss and records the new host", async () => {
		const dir = tempDir();
		const today = new Date().toISOString().slice(0, 10);
		writeFileSync(
			join(dir, "acme.json"),
			JSON.stringify({
				company: "Acme",
				fetched_date: today,
				officialHost: "old.example",
				sources: { website: { url: "https://old.example", notes: "old pack" } },
			}),
		);
		const { fetchImpl } = mockFetch({
			"https://new.example": {
				status: 200,
				body: "<html><head><title>Acme</title></head><body><p>Acme builds widgets in Berlin for European payments.</p></body></html>",
			},
		});
		const result = await researchCompany({
			company: "Acme",
			cacheDir: dir,
			fetchImpl,
			companyUrl: "https://new.example",
		});
		assert.equal(result.cached, false);
		assert.equal(result.entry.officialHost, "new.example");
		assert.equal(result.entry.sources.website?.url, "https://new.example");
	});

	it("hits the cache when the companyUrl host matches", async () => {
		const dir = tempDir();
		const today = new Date().toISOString().slice(0, 10);
		writeFileSync(
			join(dir, "acme.json"),
			JSON.stringify({
				company: "Acme",
				fetched_date: today,
				officialHost: "acme.example",
				sources: { website: { url: "https://acme.example", notes: "cached pack" } },
			}),
		);
		const { fetchImpl, calls } = mockFetch({});
		const result = await researchCompany({
			company: "Acme",
			cacheDir: dir,
			fetchImpl,
			companyUrl: "https://acme.example/about",
		});
		assert.equal(result.cached, true);
		assert.equal(calls.length, 0);
	});
});

describe("normalizeCompany non-Latin fallback", () => {
	it("maps distinct non-Latin names to distinct files", () => {
		const first = normalizeCompany("日本語企業");
		const second = normalizeCompany("中文公司");
		assert.ok(first.startsWith("company-"), `fallback slug, got ${first}`);
		assert.ok(second.startsWith("company-"), `fallback slug, got ${second}`);
		assert.notEqual(first, second);
	});

	it("keeps empty input empty", () => {
		assert.equal(normalizeCompany(""), "");
	});
});

describe("researchCompany search failures", () => {
	it("records broken category search as infrastructure, not nothing-found", async () => {
		const fetchImpl: FetchLike = async (url) => {
			if (url.startsWith("https://html.duckduckgo.com/")) {
				throw new Error("boom");
			}
			if (url === "https://acme.example") {
				return {
					status: 200,
					body: "<html><head><title>Acme</title></head><body><p>Acme builds widgets in Berlin for European payments.</p></body></html>",
				};
			}
			return { status: 404, body: "not found" };
		};
		const result = await researchCompany({
			company: "Acme",
			cacheDir: tempDir(),
			fetchImpl,
			companyUrl: "https://acme.example",
		});
		assert.ok(
			result.fetchSteps.some((step) => step.includes("search-failed")),
			`search error recorded, got ${result.fetchSteps.join(",")}`,
		);
		assert.ok(
			result.sourcing.notes.some((note) => note.includes("infrastructure broken")),
			"verification notes name broken infrastructure",
		);
	});

	it("records a broken official-site search instead of no-official-site", async () => {
		const fetchImpl: FetchLike = async (url) => {
			if (url.startsWith("https://html.duckduckgo.com/")) {
				return { status: 500, body: "oops" };
			}
			return { status: 404, body: "not found" };
		};
		const result = await researchCompany({
			company: "Acme",
			cacheDir: tempDir(),
			fetchImpl,
		});
		assert.ok(
			result.fetchSteps.some((step) => step.startsWith("official-search:error-")),
			`official search error recorded, got ${result.fetchSteps.join(",")}`,
		);
	});
});
