import assert from "node:assert/strict";
import test, { after } from "node:test";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dedupeJobs, normalizeUrl, jobMatchesQuery, sortNewestFirst, splitHeadline, htmlToText, decodeEntitiesTwice } from "@/host/job-hunter/scraper/helpers.ts";
import type { Job } from "@/host/job-hunter/scraper/types.ts";
import { adapters, searchSource } from "@/host/job-hunter/scraper/index.ts";
import { extractDetailText } from "@/host/job-hunter/scraper/detail.ts";
import { cacheDir, readDiskCache, writeDiskCache } from "@/host/job-hunter/scraper/cache.ts";
import { clearHttpCache } from "@/host/job-hunter/scraper/http.ts";
import { remoteok } from "@/host/job-hunter/scraper/adapters/remoteok.ts";
import { extractHtmlJobs, type HtmlAdapterConfig } from "@/host/job-hunter/scraper/html.ts";
import { JOBBERMAN_SELECTORS } from "@/host/job-hunter/scraper/adapters/jobberman.ts";
import { MYJOBMAG_SELECTORS, repairHeadline } from "@/host/job-hunter/scraper/adapters/myjobmag.ts";

const makeJob = (overrides: Partial<Job> = {}): Job => ({
	id: "x:1",
	source: "x",
	title: "Software Engineer",
	company: "Acme",
	url: "https://example.com/jobs/1",
	...overrides,
});

// Isolate the disk cache for this file: stubbed-network tests must never
// read or write the developer's real .scratch/scrape-cache.
const suiteCacheDir = mkdtempSync(join(tmpdir(), "scrape-cache-suite-"));
const savedCacheDir = process.env.SCRAPER_CACHE_DIR;
const savedCacheDisable = process.env.SCRAPER_CACHE_DISABLE;
process.env.SCRAPER_CACHE_DIR = suiteCacheDir;
delete process.env.SCRAPER_CACHE_DISABLE;
after(() => {
	if (savedCacheDir === undefined) delete process.env.SCRAPER_CACHE_DIR;
	else process.env.SCRAPER_CACHE_DIR = savedCacheDir;
	if (savedCacheDisable !== undefined) process.env.SCRAPER_CACHE_DISABLE = savedCacheDisable;
	rmSync(suiteCacheDir, { recursive: true, force: true });
});

test("normalizeUrl removes tracking parameters and hash", () => {
	assert.equal(
		normalizeUrl("https://example.com/jobs/1?utm_source=test&x=1#apply"),
		"https://example.com/jobs/1?x=1",
	);
});

test("dedupeJobs removes duplicate URL and title/company pairs", () => {
	const jobs = [
		makeJob({ id: "x:1", url: "https://example.com/jobs/1?utm_source=foo" }),
		makeJob({ id: "y:1", source: "y", url: "https://another.example/jobs/77" }),
		makeJob({ id: "z:2", title: "Other", url: "https://example.com/jobs/2" }),
	];

	assert.equal(dedupeJobs(jobs).length, 2);
});

test("query matching handles keywords, location and remote-only", () => {
	const job = makeJob({
		title: "Backend Software Engineer",
		location: "Lagos, Nigeria",
		remote: true,
		description: "Python PostgreSQL APIs",
	});

	assert.equal(jobMatchesQuery(job, { keywords: "python backend", location: "lagos", remoteOnly: true }), true);
	assert.equal(jobMatchesQuery(job, { keywords: "java" }), false);
});

test("location matches on the city part of a City, Country query", () => {
	const berlinJob = makeJob({ title: "Frontend Developer", location: "Berlin" });
	const lagosJob = makeJob({
		title: "Backend Software Engineer",
		location: "Ikeja, Lagos",
		description: "Python PostgreSQL APIs",
	});

	assert.equal(jobMatchesQuery(berlinJob, { keywords: "frontend", location: "Berlin, Germany" }), true);
	assert.equal(jobMatchesQuery(lagosJob, { keywords: "backend", location: "Lagos, Nigeria" }), true);
	assert.equal(jobMatchesQuery(berlinJob, { keywords: "frontend", location: "Lagos, Nigeria" }), false);
});

test("country-only and empty locations keep working", () => {
	const job = makeJob({ title: "Designer", location: "Munich, Germany" });

	assert.equal(jobMatchesQuery(job, { keywords: "designer", location: "Germany" }), true);
	assert.equal(jobMatchesQuery(job, { keywords: "designer", location: "  " }), true);
	assert.equal(jobMatchesQuery(job, { keywords: "designer" }), true);
});

test("sortNewestFirst places missing dates last", () => {
	const oldJob = makeJob({ id: "x:old", postedAt: new Date("2025-01-01"), url: "https://e/old" });
	const newJob = makeJob({ id: "x:new", postedAt: new Date("2026-01-01"), url: "https://e/new" });
	const undated = makeJob({ id: "x:none", url: "https://e/none" });
	assert.deepEqual(sortNewestFirst([oldJob, undated, newJob]).map((j) => j.id), ["x:new", "x:old", "x:none"]);
});

test("adapter registry exposes every source and rejects unknown names", () => {
	assert.deepEqual(
		adapters.map((adapter) => adapter.name).sort(),
		["hn", "indeed", "jobberman", "linkedin", "myjobmag", "remoteok", "remotive", "wwr"],
	);
	assert.throws(() => searchSource("monster", { keywords: "x" }), /Unknown scraper adapter/);
});

test("splitHeadline splits Role at Company headlines", () => {
	assert.deepEqual(splitHeadline("Frontend Developer at Acme Ltd"), {
		title: "Frontend Developer",
		company: "Acme Ltd",
	});
	assert.deepEqual(splitHeadline("Backend Engineer"), { title: "Backend Engineer" });
	assert.deepEqual(splitHeadline(" at "), { title: "at" });
});

test("extractHtmlJobs climbs title-only wrappers to sibling fields (jobberman)", () => {
	const config: HtmlAdapterConfig = {
		source: "jobberman",
		baseUrl: "https://www.jobberman.com",
		jobLinkSelector: "a[data-cy='listing-title-link'], a[href*='/listings/']",
		selectors: JOBBERMAN_SELECTORS,
		buildSearchUrl: () => "https://www.jobberman.com/jobs",
		maxPages: 1,
	};
	const html = [
		'<div class="w-full">',
		'<div class="flex items-center">',
		'<a href="https://www.jobberman.com/listings/sawmill-ops-x1" data-cy="listing-title-link">',
		'<p class="text-lg">Sawmill Manager</p></a>',
		"</div>",
		'<p class="text-sm text-blue-700">Anonymous Employer</p>',
		'<div class="flex flex-wrap"><span>Rest of Nigeria (Cross River)</span><span>Full Time</span></div>',
		'<p class="text-sm text-gray-500">Management</p>',
		"</div>",
	].join("");
	const jobs = extractHtmlJobs(html, config);
	assert.equal(jobs.length, 1);
	assert.equal(jobs[0]?.title, "Sawmill Manager");
	assert.equal(jobs[0]?.company, "Anonymous Employer");
	assert.equal(jobs[0]?.location, "Rest of Nigeria (Cross River)");
});

test("extractHtmlJobs splits Role at Company headlines (myjobmag)", () => {
	const config: HtmlAdapterConfig = {
		source: "myjobmag",
		baseUrl: "https://www.myjobmag.com",
		jobLinkSelector: "a[href^='/job/'], a[href^='/jobs/']",
		selectors: MYJOBMAG_SELECTORS,
		buildSearchUrl: () => "https://www.myjobmag.com/jobs",
		maxPages: 1,
	};
	const html = [
		'<ul><li class="job-info">',
		'<h2><a href="/job/frontend-dev-acme">Frontend Developer at Acme Ltd</a></h2>',
		"<p>Build and maintain customer-facing web applications with a modern stack",
		" across a distributed team delivering school management software.</p>",
		"</li></ul>",
	].join("");
	const jobs = extractHtmlJobs(html, config);
	assert.equal(jobs.length, 1);
	// The generic extractor copies the headline or a text blob into company;
	// the adapter repairs that via repairHeadline before filtering.
	const blobCompany = `${jobs[0]?.title ?? ""} Lagos ${"filler ".repeat(30)}`;
	const repaired = repairHeadline({ ...(jobs[0] as Job), company: blobCompany });
	assert.equal(repaired.title, "Frontend Developer");
	assert.equal(repaired.company, "Acme Ltd");
});

test("repairHeadline leaves clean companies alone", () => {
	const clean = makeJob({ title: "Frontend Developer", company: "Acme Ltd" });
	assert.deepEqual(repairHeadline(clean), clean);
	const noSplit = makeJob({ title: "Backend Engineer", company: `Backend Engineer ${"filler ".repeat(30)}` });
	assert.equal(repairHeadline(noSplit).title, "Backend Engineer");
	assert.ok(repairHeadline(noSplit).company.length > 120);
});

test("remoteok fetches the whole board (no server-side tags filter)", async () => {
	clearHttpCache();
	const originalFetch = globalThis.fetch;
	const seen: string[] = [];
	globalThis.fetch = (async (url: unknown) => {
		seen.push(String(url));
		return new Response(
			JSON.stringify([
				{ legal: "terms" },
				{
					id: 1,
					slug: "frontend-dev",
					position: "Frontend Developer",
					company: "Acme",
					location: "Worldwide",
					url: "https://remoteok.com/remote-jobs/frontend-dev",
					date: "2026-10-01T00:00:00",
				},
			]),
			{ status: 200, headers: { "content-type": "application/json" } },
		);
	}) as unknown as typeof fetch;
	try {
		const jobs = await remoteok.search({ keywords: "frontend" });
		assert.deepEqual(seen, ["https://remoteok.com/api"]);
		assert.equal(jobs.length, 1);
		assert.equal(jobs[0]?.title, "Frontend Developer");
		assert.equal(jobs[0]?.company, "Acme");
	} finally {
		globalThis.fetch = originalFetch;
		clearHttpCache();
	}
});

test("htmlToText strips tags and decodes entities", () => {
	assert.equal(htmlToText("<p>Hello <b>World</b></p><p>Line2</p>"), "Hello World\nLine2");
	assert.equal(htmlToText("<script>alert(1)</script><p>Hi</p>"), "Hi");
	assert.equal(htmlToText("Fish &lt;tag&gt; &amp; Chips&nbsp;here"), "Fish <tag> & Chips here");
	assert.equal(htmlToText("a<br>b"), "a\nb");
});

test("decodeEntitiesTwice unwraps double-encoded content", () => {
	assert.equal(decodeEntitiesTwice("&lt;p&gt;Build &amp;amp; APIs&lt;/p&gt;"), "<p>Build & APIs</p>");
});

test("extractDetailText scopes to per-source containers", () => {
	const myjobmag = extractDetailText(
		'<div class="job-details"><p>Hands-on work.</p></div><div class="ads">junk junk junk</div>',
		"myjobmag",
	);
	assert.equal(myjobmag, "Hands-on work.");
	const jobberman = extractDetailText(
		"<article><h1>Role</h1><p>Do things well.</p></article>",
		"jobberman",
	);
	assert.ok(jobberman.includes("Do things well."));
	const page = extractDetailText(
		"<html><body><main><p>Main text here.</p></main></body></html>",
		"page",
	);
	assert.equal(page, "Main text here.");
});

function withTempCacheDir(run: (dir: string) => Promise<void>): Promise<void> {
	const previous = process.env.SCRAPER_CACHE_DIR;
	const dir = mkdtempSync(join(tmpdir(), "scrape-cache-test-"));
	process.env.SCRAPER_CACHE_DIR = dir;
	delete process.env.SCRAPER_CACHE_DISABLE;
	return run(dir).finally(() => {
		if (previous === undefined) delete process.env.SCRAPER_CACHE_DIR;
		else process.env.SCRAPER_CACHE_DIR = previous;
		rmSync(dir, { recursive: true, force: true });
	});
}

test("disk cache round-trips bodies until TTL expiry", async () => {
	await withTempCacheDir(async () => {
		assert.equal(await readDiskCache("test:roundtrip"), undefined);
		await writeDiskCache("test:roundtrip", "hello", 60_000);
		assert.equal(await readDiskCache("test:roundtrip"), "hello");
		await writeDiskCache("test:expired", "old", 1);
		await new Promise((resolve) => setTimeout(resolve, 20));
		assert.equal(await readDiskCache("test:expired"), undefined);
	});
});

test("disk cache treats corrupt entries as misses", async () => {
	await withTempCacheDir(async (dir) => {
		await writeDiskCache("test:corrupt", "hello", 60_000);
		const [file] = readdirSync(dir);
		assert.ok(file);
		writeFileSync(join(dir, file as string), "not json{{{");
		assert.equal(await readDiskCache("test:corrupt"), undefined);
	});
});

test("disk cache disable flag bypasses disk", async () => {
	await withTempCacheDir(async () => {
		process.env.SCRAPER_CACHE_DISABLE = "1";
		await writeDiskCache("test:disabled", "hello", 60_000);
		assert.equal(await readDiskCache("test:disabled"), undefined);
		assert.equal(cacheDir(), undefined);
	});
});
