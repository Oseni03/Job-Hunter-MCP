import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	fetchBoardJobs,
	filterListingsByQuery,
	mapAshbyJob,
	mapGreenhouseJob,
	mapLeverPosting,
} from "@/lib/boards.ts";

// Issue 13 slice A: structured board mappers over recorded payload shapes.
describe("mapGreenhouseJob (issue 13)", () => {
	const JOB = {
		id: 8023928,
		title: "ML Engineer",
		absolute_url: "https://stripe.com/jobs/search?gh_jid=8023928",
		company_name: "Stripe",
		location: { name: "Remote" },
		first_published: "2026-09-20T06:59:38-04:00",
		content: "&lt;p&gt;Python and SQL for fraud detection.&lt;/p&gt;",
	};

	it("carries the real company, URL, date, and decoded description", () => {
		const posting = mapGreenhouseJob(JOB, { provider: "greenhouse", slug: "stripe", company: "Stripe" });
		assert.equal(posting?.title, "ML Engineer");
		assert.equal(posting?.company, "Stripe");
		assert.equal(posting?.url, "https://stripe.com/jobs/search?gh_jid=8023928");
		assert.equal(posting?.postedDate, "2026-09-20T06:59:38-04:00");
		assert.ok(posting?.description?.includes("Python and SQL for fraud detection"));
		assert.ok(!posting?.description?.includes("&lt;"), "double-encoded entities are decoded");
		assert.equal(posting?.portal, "greenhouse");
	});

	it("falls back to the caller board label when company_name is absent", () => {
		const { company_name: _dropped, ...rest } = JOB;
		const posting = mapGreenhouseJob(rest, { provider: "greenhouse", slug: "stripe", company: "Stripe Label" });
		assert.equal(posting?.company, "Stripe Label");
	});

	it("returns null instead of inventing when the URL is missing", () => {
		const { absolute_url: _dropped, ...rest } = JOB;
		assert.equal(mapGreenhouseJob(rest, { provider: "greenhouse", slug: "stripe", company: "Stripe" }), null);
	});
});

describe("mapLeverPosting (issue 13)", () => {
	const POSTING = {
		id: "abc-123",
		text: "ML Engineer",
		hostedUrl: "https://jobs.lever.co/acme/abc-123",
		descriptionPlain: "Python and SQL for fraud detection.",
		createdAt: Date.parse("2026-09-20T00:00:00Z"),
		categories: { location: "Remote" },
	};

	it("labels the company from the caller board ref (payload carries none)", () => {
		const posting = mapLeverPosting(POSTING, { provider: "lever", slug: "acme", company: "Acme" });
		assert.equal(posting?.title, "ML Engineer");
		assert.equal(posting?.company, "Acme");
		assert.equal(posting?.url, "https://jobs.lever.co/acme/abc-123");
		assert.equal(posting?.postedDate, "2026-09-20");
		assert.equal(posting?.portal, "lever");
	});

	it("returns null instead of inventing when the URL is missing", () => {
		const { hostedUrl: _dropped, ...rest } = POSTING;
		assert.equal(mapLeverPosting(rest, { provider: "lever", slug: "acme", company: "Acme" }), null);
	});
});

describe("mapAshbyJob (issue 13)", () => {
	const JOB = {
		title: "ML Engineer",
		jobUrl: "https://jobs.ashbyhq.com/acme/abc-123",
		descriptionPlain: "Python and SQL for fraud detection.",
		publishedAt: "2026-09-20T10:00:00.000+00:00",
		location: "Remote",
	};

	it("labels the company from the caller board ref (payload carries none)", () => {
		const posting = mapAshbyJob(JOB, { provider: "ashby", slug: "acme", company: "Acme" });
		assert.equal(posting?.title, "ML Engineer");
		assert.equal(posting?.company, "Acme");
		assert.equal(posting?.postedDate, "2026-09-20T10:00:00.000+00:00");
		assert.equal(posting?.portal, "ashby");
	});

	it("returns null instead of inventing when the URL is missing", () => {
		const { jobUrl: _dropped, ...rest } = JOB;
		assert.equal(mapAshbyJob(rest, { provider: "ashby", slug: "acme", company: "Acme" }), null);
	});
});

describe("fetchBoardJobs (issue 13)", () => {
	it("throws on transport errors and non-200s so the caller degrades honestly", async () => {
		await assert.rejects(
			fetchBoardJobs(
				{ provider: "greenhouse", slug: "acme", company: "Acme" },
				async () => ({ status: 429, body: "slow down" }),
			),
		);
		await assert.rejects(
			fetchBoardJobs(
				{ provider: "lever", slug: "acme", company: "Acme" },
				async () => {
					throw new Error("boom");
				},
			),
		);
	});

	it("returns mapped postings for a greenhouse board payload", async () => {
		const postings = await fetchBoardJobs(
			{ provider: "greenhouse", slug: "stripe", company: "Stripe" },
			async () => ({
				status: 200,
				body: JSON.stringify({
					jobs: [
						{
							title: "ML Engineer",
							absolute_url: "https://stripe.com/jobs/1",
							company_name: "Stripe",
							content: "Python",
						},
					],
				}),
			}),
		);
		assert.equal(postings.length, 1);
		assert.equal(postings[0].company, "Stripe");
	});
});

describe("filterListingsByQuery (issue 13)", () => {
	const LISTINGS = [
		{ title: "ML Engineer", company: "Acme", url: "https://example.com/1", description: "Python and SQL" },
		{ title: "Accountant", company: "Acme", url: "https://example.com/2", description: "Bookkeeping" },
	];

	it("keeps listings matching every query token on word boundaries", () => {
		const kept = filterListingsByQuery(LISTINGS, "Python ML Engineer");
		assert.deepEqual(kept.map((item) => item.url), ["https://example.com/1"]);
	});

	it("keeps everything on an empty query", () => {
		assert.equal(filterListingsByQuery(LISTINGS, "").length, 2);
	});
});

// Issue 13 slices B/C: board source placement, multi-query merge, flags.
describe("planSearch board source (issue 13)", () => {
	const PROFILE = {
		name: "Test Candidate",
		location: "Berlin, Germany",
		constraints: "none",
		workCountry: "Germany",
		citizenships: [],
		permitClasses: [],
		languages: [{ language: "English", level: "C1" }],
		primarySkills: ["Python"],
		secondarySkills: [],
		weakSkills: [],
		strongDomains: [],
		adjacentDomains: [],
		careerGoals: ["ML Engineer"],
		energizingTasks: [],
		drainingTasks: [],
	};

	function boardFetch(body: unknown, status = 200) {
		return async () => ({ status, body: JSON.stringify(body) });
	}

	it("runs boards and reports coverage with zero invented postings", async () => {
		const { planSearch } = await import("@/lib/search.ts");
		const plan = await planSearch({
			profile: PROFILE,
			boards: [{ provider: "lever", slug: "acme", company: "Acme" }],
			boardFetch: boardFetch([
				{
					text: "ML Engineer",
					hostedUrl: "https://jobs.lever.co/acme/1",
					descriptionPlain: "Python ML Engineer for growth.",
					createdAt: Date.parse("2026-09-20T00:00:00Z"),
				},
			]),
		});
		assert.deepEqual(plan.sources, ["board"]);
		assert.equal(plan.candidates[0].company, "Acme");
		assert.equal(plan.candidates[0].needsVerification, false);
		assert.ok(plan.queriesRun.length > 0, "coverage is reported");
	});

	it("degrades a dead board into errors with zero invented postings", async () => {
		const { planSearch } = await import("@/lib/search.ts");
		const plan = await planSearch({
			profile: PROFILE,
			boards: [{ provider: "greenhouse", slug: "nope", company: "Nope" }],
			boardFetch: boardFetch({}, 500),
		});
		assert.deepEqual(plan.candidates, []);
		assert.ok(plan.errors.some((error) => error.includes("greenhouse/nope")));
	});

	it("flags unknown-company scraper candidates for host verification", async () => {
		const { planSearch } = await import("@/lib/search.ts");
		const plan = await planSearch({
			profile: PROFILE,
			portalResults: [
				{
					title: "ML Engineer",
					company: "",
					url: "https://example.com/jobs/9",
					description: "Python ML Engineer with a long detailed description of stack and team.",
					postedDate: "2026-09-20",
				},
			],
		});
		assert.equal(plan.candidates[0].needsVerification, true);
		assert.ok(plan.notes.some((note) => note.includes("unknown employer")));
	});

	it("runs the query set across the portal source and merges with dedupe", async () => {
		const { planSearch } = await import("@/lib/search.ts");
		const seenQueries: string[] = [];
		const plan = await planSearch({
			profile: PROFILE,
			portal: async (args) => {
				seenQueries.push(args.query);
				return {
					jobs: [
						{
							title: "ML Engineer",
							company: "Acme",
							url: "https://example.com/jobs/1",
							description: "Python ML Engineer with a long detailed description of stack and team.",
							postedDate: "2026-09-20",
						},
					],
					errors: [],
					rateLimited: false,
				};
			},
		});
		const distinct = [...new Set(seenQueries)];
		assert.ok(distinct.length > 1, `expected multi-query coverage, got ${distinct}`);
		assert.ok(distinct.length <= 3, "per-run cap respected");
		assert.deepEqual(plan.queriesRun, distinct);
		assert.equal(plan.candidates.length, 1, "merged across queries with dedupe");
	});
});
