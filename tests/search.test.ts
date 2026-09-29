import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	SEARCH_LIMIT_MAX,
	SEARCH_RECENCY_DAYS,
	buildAutoQueries,
	capLimit,
	dedupeCandidates,
	isPeopleSearchUrl,
	planSearch,
	resolveSearchFilters,
} from "../lib/search.ts";
import type { RawPosting } from "../lib/search.ts";
import type { Profile } from "../lib/profile.ts";

const PROFILE: Profile = {
	name: "Test Candidate",
	location: "Test City, Test Country",
	constraints: "none",
	workCountry: "Test Country",
	citizenships: [],
	permitClasses: [],
	languages: [{ language: "English", level: "C1" }],
	primarySkills: ["Python", "SQL"],
	secondarySkills: ["Docker"],
	weakSkills: [],
	strongDomains: ["fraud detection"],
	adjacentDomains: ["credit risk"],
	careerGoals: ["ML Engineer"],
	energizingTasks: ["model building"],
	drainingTasks: [],
};

function posting(overrides: Partial<RawPosting> = {}): RawPosting {
	return {
		title: "ML Engineer",
		company: "Acme",
		url: "https://example.com/jobs/1",
		description: "Python and SQL for fraud detection.",
		postedDate: "2026-09-20",
		...overrides,
	};
}

describe("capLimit", () => {
	it("caps the limit at 20 and defaults to 10", () => {
		assert.equal(capLimit(50), SEARCH_LIMIT_MAX);
		assert.equal(capLimit(undefined), 10);
		assert.equal(capLimit(5), 5);
	});
});

describe("resolveSearchFilters", () => {
	it("keeps explicit filters when given", () => {
		const filters = resolveSearchFilters({ keywords: "Python", location: "Berlin, Germany" }, PROFILE);
		assert.equal(filters.keywords, "Python");
		assert.equal(filters.location, "Berlin, Germany");
	});

	it("derives the location from the profile when absent", () => {
		const filters = resolveSearchFilters({ keywords: "Python" }, PROFILE);
		assert.equal(filters.location, PROFILE.location);
	});
});

describe("buildAutoQueries", () => {
	it("builds per-language function-based categories from the profile", () => {
		const queries = buildAutoQueries(PROFILE);
		assert.ok(queries.length > 0, "expected at least one auto query");
		for (const query of queries) {
			assert.ok(query.category.length >= 2, "function-based category");
			assert.ok(query.language.length >= 2, "per-language rendering");
			assert.ok(query.query.length >= 2, "usable query text");
		}
		assert.ok(
			queries.some((query) => query.query.includes("Python")),
			"profile skills feed the auto query",
		);
	});
});

describe("isPeopleSearchUrl", () => {
	it("refuses LinkedIn people-search pages", () => {
		assert.equal(isPeopleSearchUrl("https://www.linkedin.com/in/jane-smith"), true);
		assert.equal(isPeopleSearchUrl("https://www.linkedin.com/search/results/people/?keywords=Acme"), true);
		assert.equal(isPeopleSearchUrl("https://www.linkedin.com/jobs/view/123"), false);
	});
});

describe("planSearch", () => {
	it("errors honestly when no source can run instead of fabricating postings", async () => {
		const plan = await planSearch({ profile: PROFILE });
		assert.deepEqual(plan.candidates, []);
		assert.ok(plan.errors.length > 0, "expected an explicit no-source error");
	});

	it("requires an explicit location for the live portal path", async () => {
		const noLocation = { ...PROFILE, location: "" };
		const plan = await planSearch({
			profile: noLocation,
			portal: async () => ({ jobs: [], errors: [], rateLimited: false }),
		});
		assert.ok(
			plan.errors.some((error) => error.includes("location")),
			"expected a missing-location error, never a silent default",
		);
		assert.deepEqual(plan.candidates, []);
	});

	it("plans caller-supplied portal results with stability-ready canonical keys", async () => {
		const plan = await planSearch({ profile: PROFILE, portalResults: [posting()] });
		assert.equal(plan.candidates.length, 1);
		assert.match(plan.candidates[0].key, /^[a-z0-9][a-z0-9-]*_[a-z0-9][a-z0-9-]*$/);
		assert.equal(plan.candidates[0].portal, "linkedin");
		assert.equal(plan.candidates[0].source, "portal-live");
	});

	it("flags unknown dates instead of dropping the posting", async () => {
		const plan = await planSearch({
			profile: PROFILE,
			portalResults: [posting({ postedDate: undefined, deadline: undefined })],
		});
		assert.equal(plan.candidates.length, 1);
		assert.equal(plan.candidates[0].dateUnknown, true);
	});

	it("excludes stale postings outside the 14-day window and reports the count", async () => {
		const plan = await planSearch({
			profile: PROFILE,
			portalResults: [posting({ postedDate: "2026-01-01" })],
			now: new Date("2026-09-29T00:00:00Z"),
		});
		assert.deepEqual(plan.candidates, []);
		assert.equal(plan.staleCount, 1);
		assert.equal(SEARCH_RECENCY_DAYS, 14);
	});

	it("keeps expired postings as ghosts, never silently dropped", async () => {
		const plan = await planSearch({
			profile: PROFILE,
			portalResults: [posting({ deadline: "2026-01-01" })],
			now: new Date("2026-09-29T00:00:00Z"),
		});
		assert.equal(plan.candidates.length, 1);
		assert.equal(plan.candidates[0].status, "expired");
	});

	it("dedupes caller-passed seen keys and applied pairs without owning state", async () => {
		const first = await planSearch({ profile: PROFILE, portalResults: [posting()] });
		const key = first.candidates[0].key;
		const plan = await planSearch({
			profile: PROFILE,
			portalResults: [posting(), posting({ title: "Other Role", url: "https://example.com/jobs/2" })],
			seenKeys: [key],
			appliedPairs: ["acme||other role"],
		});
		assert.deepEqual(plan.candidates, []);
		assert.equal(plan.seenSkipped, 1);
		assert.equal(plan.appliedSkipped, 1);
	});

	it("dedupeCandidates flags duplicates with the stable key", () => {
		const key = "acme_ml-engineer";
		const result = dedupeCandidates(
			[{ key, company: "Acme", title: "ML Engineer" }],
			[key],
			[],
		);
		assert.equal(result.kept.length, 0);
		assert.equal(result.seenSkipped, 1);
	});

	it("overrides quick-fit on a language-gate FAIL and flags without veto", async () => {
		const germanPosting = posting({
			description: "Danish is required for this role. Python and SQL for fraud detection.",
		});
		const plan = await planSearch({ profile: PROFILE, portalResults: [germanPosting] });
		assert.equal(plan.candidates[0].quickFit.band, "low");
		assert.ok(plan.candidates[0].language.note.includes("Danish"));
		assert.deepEqual(plan.candidates[0].referralLinks, [], "no referral links for low fits");
	});

	it("adds referral links for high and medium fits only", async () => {
		const plan = await planSearch({ profile: PROFILE, portalResults: [posting()] });
		const band = plan.candidates[0].quickFit.band;
		if (band === "high" || band === "medium") {
			assert.ok(plan.candidates[0].referralLinks.length > 0, "referral links for promising fits");
		} else {
			assert.deepEqual(plan.candidates[0].referralLinks, []);
		}
	});

	it("consolidates mass postings with an explicit note", async () => {
		const plan = await planSearch({
			profile: PROFILE,
			portalResults: [
				posting({ url: "https://example.com/jobs/1" }),
				posting({ url: "https://example.com/jobs/2" }),
			],
		});
		assert.equal(plan.candidates.length, 1);
		assert.ok(
			(plan.candidates[0].consolidationNote ?? "").includes("2"),
			"expected a mass-posting consolidation note",
		);
	});

	it("strips URL fragments so keys stay stable", async () => {
		const plan = await planSearch({
			profile: PROFILE,
			portalResults: [posting({ url: "https://example.com/jobs/1#apply" })],
		});
		assert.equal(plan.candidates[0].url, "https://example.com/jobs/1");
	});
});
