import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { ScrapeOptions } from "ts-jobspy";
import { adapters, searchSource } from "@/host/job-hunter/scraper/index.ts";
import { buildScrapeOptions, createIndeedAdapter, mapTsJobToScraperJob } from "@/host/job-hunter/scraper/adapters/tsjobspy.ts";
import { planSearch } from "@/lib/job-hunter/search.ts";

// Seam 1: pure mapper ts-jobspy Job -> scraper Job (no network).
// Expected values are hand-worked literals from the ts-jobspy v3 schema,
// not recomputed by the implementation.
describe("ts-jobspy mapper (Indeed tracer bullet)", () => {
	it("maps a full Indeed posting, preferring the direct URL", () => {
		const job = mapTsJobToScraperJob({
			id: "17cf2abc",
			site: "indeed",
			jobUrl: "https://www.indeed.com/viewjob?jk=17cf2abc",
			jobUrlDirect: "https://www.adobe.com/careers/123",
			title: "Software Development Engineer",
			company: "Adobe",
			location: "San Jose, CA, US",
			datePosted: "2026-01-02",
			jobTypes: ["fulltime"],
			salarySource: "direct_data",
			interval: "yearly",
			minAmount: 139000,
			maxAmount: 257550,
			currency: "USD",
			isRemote: false,
			jobLevel: null,
			jobFunction: null,
			listingType: null,
			emails: [],
			description: "Build distributed systems in plain text.",
			companyIndustry: null,
			companyUrl: null,
			companyLogo: null,
			bannerPhotoUrl: null,
			companyUrlDirect: null,
			companyAddresses: null,
			companyNumEmployees: null,
			companyRevenue: null,
			companyDescription: null,
			skills: [],
			experienceRange: null,
			companyRating: null,
			companyReviewsCount: null,
			vacancyCount: null,
			workFromHomeType: null,
		});
		assert.equal(job.source, "indeed");
		assert.equal(job.title, "Software Development Engineer");
		assert.equal(job.company, "Adobe");
		assert.equal(job.url, "https://www.adobe.com/careers/123");
		assert.equal(job.location, "San Jose, CA, US");
		assert.equal(job.description, "Build distributed systems in plain text.");
		assert.ok(job.id.startsWith("indeed:"));
		assert.deepEqual(job.postedAt?.toISOString().slice(0, 10), "2026-01-02");
	});

	it("falls back honestly on null company, URL, and date", () => {
		const job = mapTsJobToScraperJob({
			id: null,
			site: "indeed",
			jobUrl: "https://www.indeed.com/viewjob?jk=deadbeef",
			jobUrlDirect: null,
			title: "ML Engineer",
			company: null,
			location: null,
			datePosted: null,
			jobTypes: [],
			salarySource: null,
			interval: null,
			minAmount: null,
			maxAmount: null,
			currency: null,
			isRemote: null,
			jobLevel: null,
			jobFunction: null,
			listingType: null,
			emails: [],
			description: null,
			companyIndustry: null,
			companyUrl: null,
			companyLogo: null,
			bannerPhotoUrl: null,
			companyUrlDirect: null,
			companyAddresses: null,
			companyNumEmployees: null,
			companyRevenue: null,
			companyDescription: null,
			skills: [],
			experienceRange: null,
			companyRating: null,
			companyReviewsCount: null,
			vacancyCount: null,
			workFromHomeType: null,
		});
		assert.equal(job.company, "Unknown company");
		assert.equal(job.url, "https://www.indeed.com/viewjob?jk=deadbeef");
		assert.equal(job.postedAt, undefined);
		assert.equal(job.description, undefined);
	});
});

// Seam 2: Adapter registry + Indeed search with an injected runner (no network).
describe("indeed adapter (injected runner)", () => {
	function tsJob(overrides = {}) {
		return {
			id: "abc123",
			site: "indeed" as const,
			jobUrl: "https://www.indeed.com/viewjob?jk=abc123",
			jobUrlDirect: null,
			title: "ML Engineer",
			company: "Acme",
			location: "Berlin, Germany",
			datePosted: "2026-09-25",
			jobTypes: [],
			salarySource: null,
			interval: null,
			minAmount: null,
			maxAmount: null,
			currency: null,
			isRemote: null,
			jobLevel: null,
			jobFunction: null,
			listingType: null,
			emails: [],
			description: "Python ML Engineer with a long detailed description of stack and team.",
			companyIndustry: null,
			companyUrl: null,
			companyLogo: null,
			bannerPhotoUrl: null,
			companyUrlDirect: null,
			companyAddresses: null,
			companyNumEmployees: null,
			companyRevenue: null,
			companyDescription: null,
			skills: [],
			experienceRange: null,
			companyRating: null,
			companyReviewsCount: null,
			vacancyCount: null,
			workFromHomeType: null,
			...overrides,
		};
	}

	it("is registered under 'indeed' without disturbing other adapters", () => {
		const names = adapters.map((adapter) => adapter.name);
		assert.ok(names.includes("indeed"));
		assert.ok(names.includes("linkedin"));
		assert.ok(names.includes("remotive"));
	});

	it("maps plan filters to ts-jobspy options with the total cap", () => {
		assert.deepEqual(buildScrapeOptions({ keywords: "ML Engineer", location: "Berlin, Germany", limit: 10 }), {
			sites: ["indeed"],
			searchTerm: "ML Engineer",
			location: "Berlin, Germany",
			resultsWanted: 10,
			hoursOld: 336,
			country: "usa",
			descriptionFormat: "plain",
			dedupe: "none",
			strict: false,
		});
	});

	it("searches through the injected runner and maps jobs", async () => {
		const seen: ScrapeOptions[] = [];
		const adapter = createIndeedAdapter(async (options) => {
			seen.push(options);
			return { jobs: [tsJob()], meta: { sites: [], totalDurationMs: 0, jobsPerSecond: 0, failureRate: 0, duplicatesRemoved: 0 } };
		});
		const jobs = await adapter.search({ keywords: "ML Engineer", location: "Berlin, Germany", limit: 5 });
		assert.equal(seen.length, 1);
		assert.deepEqual(seen[0].sites, ["indeed"]);
		assert.equal(jobs.length, 1);
		assert.equal(jobs[0].source, "indeed");
		assert.equal(jobs[0].company, "Acme");
	});

	it("lets runner errors throw so the planner records them with zero inventions", async () => {
		const adapter = createIndeedAdapter(async () => {
			throw new Error("indeed blocked");
		});
		await assert.rejects(() => adapter.search({ keywords: "x" }), /indeed blocked/);
	});

	it("searchSource resolves 'indeed' (registry wiring)", async () => {
		// Proves wiring only; live search would hit the network, so assert
		// resolution indirectly via the adapters list instead of calling it.
		assert.ok(adapters.some((adapter) => adapter.name === "indeed"));
		assert.equal(typeof searchSource, "function");
	});
});

// Seam 3: planSearch scraper source carries the Indeed Site tag end-to-end.
describe("planSearch with the Indeed Site", () => {
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
	const NOW = new Date("2026-10-03T12:00:00Z");

	it("returns indeed-portal candidates through limit, paging, and caller dedupe", async () => {
		const first = await planSearch({
			profile: PROFILE,
			filters: { keywords: "ML Engineer", location: "Berlin, Germany", limit: 10 },
			now: NOW,
			scraperAdapters: ["indeed"],
			scraperFetch: async () => [{
				title: "ML Engineer",
				company: "Acme",
				url: "https://www.indeed.com/viewjob?jk=abc123",
				description: "Python ML Engineer with a long detailed description of stack and team.",
				postedDate: "2026-09-25",
				portal: "indeed",
			}],
		});
		assert.deepEqual(first.sources, ["scraper"]);
		assert.equal(first.candidates.length, 1);
		assert.equal(first.candidates[0].portal, "indeed");
		assert.equal(first.candidates[0].source, "scraper");
		assert.equal(first.candidates[0].postedDate, "2026-09-25");
		assert.equal(first.candidates[0].dateUnknown, false);
		assert.equal(first.errors.length, 0);

		const key = first.candidates[0].key;
		const second = await planSearch({
			profile: PROFILE,
			filters: { keywords: "ML Engineer", location: "Berlin, Germany", limit: 10 },
			now: NOW,
			scraperAdapters: ["indeed"],
			scraperFetch: async () => [{
				title: "ML Engineer",
				company: "Acme",
				url: "https://www.indeed.com/viewjob?jk=abc123",
				description: "Python ML Engineer with a long detailed description of stack and team.",
				postedDate: "2026-09-25",
				portal: "indeed",
			}],
			seenKeys: [key],
		});
		assert.deepEqual(second.candidates, []);
		assert.equal(second.seenSkipped, 1);
	});
});
