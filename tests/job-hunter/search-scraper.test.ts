import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createScraperFetcher, planSearch } from "@/lib/job-hunter/search.ts";
import type { RawPosting } from "@/lib/job-hunter/search.ts";

// PlanSearch scraper source: local job-scraper adapters behind an explicit
// opt-in (scraperAdapters).
describe("planSearch scraper source", () => {
	const PROFILE = {
		name: "Test Candidate",
		location: "Berlin, Germany",
		workCountry: "Germany",
		permitClasses: [],
		languages: [{ language: "English", level: "C1" }],
		preferences: { targetRoles: ["ML Engineer"] },
		skills: [{ name: "Python", category: "primary" as const }],
		energizingTasks: [],
		drainingTasks: [],
	};
	const NOW = new Date("2026-10-03T12:00:00Z");

	function posting(overrides: Partial<RawPosting> = {}): RawPosting {
		return {
			title: "ML Engineer",
			company: "Acme",
			url: "https://example.com/jobs/1",
			description: "Python ML Engineer with a long detailed description of stack and team.",
			postedDate: "2026-09-25",
			portal: "linkedin",
			...overrides,
		};
	}

	it("runs scrapers with the injected fetcher and maps adapter fields", async () => {
		const seenQueries: string[] = [];
		const plan = await planSearch({
			profile: PROFILE,
			filters: { keywords: "ML Engineer", location: "Berlin, Germany" },
			now: NOW,
			scraperAdapters: ["linkedin"],
			scraperFetch: async (query) => {
				seenQueries.push(query);
				return [posting()];
			},
		});
		assert.deepEqual(plan.queriesRun, ["ML Engineer"]);
		assert.ok(seenQueries.includes("ML Engineer"));
		assert.equal(plan.candidates.length, 1);
		assert.equal(plan.candidates[0].portal, "linkedin");
		assert.equal(plan.candidates[0].postedDate, "2026-09-25");
		assert.equal(plan.candidates[0].dateUnknown, false);
		assert.equal(plan.errors.length, 0);
	});

	it("records unknown adapters as errors with zero invented postings", async () => {
		const plan = await planSearch({
			profile: PROFILE,
			filters: { keywords: "ML Engineer", location: "Berlin, Germany" },
			now: NOW,
			scraperAdapters: ["monster"],
		});
		assert.deepEqual(plan.candidates, []);
		assert.ok(plan.errors.some((error) => error.includes("Unknown scraper adapter")));
	});

	it("leaves the scraper stage off without scraperAdapters", async () => {
		const plan = await planSearch({
			profile: PROFILE,
			filters: { keywords: "ML Engineer", location: "Berlin, Germany" },
			now: NOW,
		});
		assert.ok(plan.errors.some((error) => error.includes("No search source available")));
	});
});

describe("createScraperFetcher", () => {
	it("maps plan filters to scraper queries and jobs to raw postings", async () => {
		const seen: unknown[] = [];
		const fetch = createScraperFetcher(
			{ location: "Berlin, Germany", remoteMode: "remote", limit: 5, adapters: ["linkedin"] },
			async (query) => {
				seen.push(query);
				return [{
					id: "linkedin:1",
					source: "linkedin",
					title: "ML Engineer",
					company: "Acme",
					location: "Berlin, Germany",
					remote: true,
					url: "https://www.linkedin.com/jobs/view/1/",
					description: "Python role.",
					postedAt: new Date("2026-09-25T10:00:00Z"),
				}];
			},
		);
		const postings = await fetch("ML Engineer");
		assert.deepEqual(seen, [{
			keywords: "ML Engineer",
			location: "Berlin, Germany",
			remoteFilter: "remote",
			postedWithinDays: 14,
			limit: 5,
		}]);
		assert.equal(postings.length, 1);
		assert.equal(postings[0].portal, "linkedin");
		assert.equal(postings[0].postedDate, "2026-09-25");
		assert.equal(postings[0].company, "Acme");
	});
});
