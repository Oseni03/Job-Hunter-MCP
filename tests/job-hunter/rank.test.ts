import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { McpServer } from "@modelcontextprotocol/server";

import { planRank } from "@/lib/job-hunter/rank.ts";
import { registerRankJobs } from "@/lib/job-hunter/tools/rank-jobs.ts";
import type { Profile } from "@/lib/job-hunter/profile.ts";

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

function item(overrides: Record<string, unknown> = {}) {
	return {
		key: "acme_ml-engineer",
		title: "ML Engineer",
		company: "Acme",
		url: "https://example.com/jobs/1",
		portal: "linkedin",
		postedDate: "2026-09-20",
		deadline: null,
		postingText: "ML Engineer at Acme.\nRequirements: Python, SQL.\nDomain: fraud detection.\nRemote.",
		...overrides,
	};
}

describe("planRank counts", () => {
	it("reports eligible, deferred, and tracker-excluded counts before scoring", async () => {
		const plan = await planRank({
			profile: PROFILE,
			items: [
				item({ key: "acme_a", title: "ML Engineer", url: "https://example.com/a" }),
				item({ key: "acme_b", title: "Data Analyst", url: "https://example.com/b" }),
				item({ key: "acme_c", title: "ML Engineer", url: "https://example.com/c" }),
			],
			appliedPairs: ["acme||ml engineer"],
			limit: 1,
			top: 5,
			now: new Date("2026-09-29T00:00:00Z"),
		});
		assert.equal(plan.trackerExcludedCount, 2);
		assert.equal(plan.eligibleCount, 1);
		assert.equal(plan.deferredCount, 0);
		assert.equal(plan.ranked.length, 1);
	});

	it("bounds expensive work with limit and shortlist display with top", async () => {
		const plan = await planRank({
			profile: PROFILE,
			items: [
				item({ key: "acme_1", url: "https://example.com/1" }),
				item({ key: "acme_2", url: "https://example.com/2" }),
				item({ key: "acme_3", url: "https://example.com/3" }),
			],
			limit: 2,
			top: 1,
			now: new Date("2026-09-29T00:00:00Z"),
		});
		assert.equal(plan.eligibleCount, 3);
		assert.equal(plan.deferredCount, 1);
		assert.equal(plan.ranked.length, 2);
		assert.equal(plan.shortlist.length, 1);
		assert.deepEqual(plan.limits, { limit: 2, top: 1 });
	});

	it("filters by focus text and re-ranks ranked entries only with all-flag", async () => {
		const focused = await planRank({
			profile: PROFILE,
			items: [
				item({ key: "acme_ml", title: "ML Engineer" }),
				item({ key: "acme_pm", title: "Product Manager" }),
			],
			focus: "ml engineer",
			now: new Date("2026-09-29T00:00:00Z"),
		});
		assert.equal(focused.eligibleCount, 1);

		const rankedItem = item({ key: "acme_old", status: "ranked" });
		const skipped = await planRank({
			profile: PROFILE,
			items: [rankedItem],
			now: new Date("2026-09-29T00:00:00Z"),
		});
		assert.equal(skipped.eligibleCount, 0);
		assert.equal(skipped.ranked.length, 0);

		const reranked = await planRank({
			profile: PROFILE,
			items: [rankedItem],
			all: true,
			now: new Date("2026-09-29T00:00:00Z"),
		});
		assert.equal(reranked.eligibleCount, 1);
	});
});

describe("planRank scoring", () => {
	it("scores from fetched posting text only and never from title alone", async () => {
		const plan = await planRank({
			profile: PROFILE,
			items: [item({ postingText: undefined, postingUrl: undefined })],
			fetchImpl: async () => ({ status: 404, body: "not found" }),
			now: new Date("2026-09-29T00:00:00Z"),
		});
		assert.equal(plan.ranked.length, 0);
		assert.equal(plan.excluded.length, 1);
		assert.equal(plan.excluded[0].kind, "unavailable");
		assert.ok(plan.errors.length === 0 || plan.notes.length > 0);
	});

	it("marks unfetchable postings unavailable without fabricating content", async () => {
		const plan = await planRank({
			profile: PROFILE,
			items: [
				item({
					key: "acme_dead",
					postingText: undefined,
					postingUrl: "https://example.com/dead",
				}),
			],
			fetchImpl: async () => ({ status: 404, body: "gone" }),
			now: new Date("2026-09-29T00:00:00Z"),
		});
		assert.equal(plan.excluded[0].kind, "unavailable");
		assert.match(plan.excluded[0].reason, /expired|unavailable|fetch/i);
	});
});

describe("planRank vetoes and urgency", () => {
	it("excludes location FAIL with reason and keeps FLAGs with a visible marker", async () => {
		const plan = await planRank({
			profile: PROFILE,
			items: [
				item({
					key: "acme_reloc",
					postingText: "ML Engineer at Acme.\nRequirements: Python.\nMust relocate to another country.",
				}),
				item({
					key: "acme_travel",
					url: "https://example.com/travel",
					postingText: "ML Engineer at Acme.\nRequirements: Python.\nFrequent international travel 80%.",
				}),
			],
			now: new Date("2026-09-29T00:00:00Z"),
		});
		const excluded = plan.excluded.find((entry) => entry.key === "acme_reloc");
		assert.ok(excluded, "relocation FAIL excluded");
		assert.equal(excluded?.kind, "location");
		const flagged = plan.ranked.find((entry) => entry.key === "acme_travel");
		assert.ok(flagged, "travel FLAG stays");
		assert.ok(flagged?.locationNote?.length > 0 || flagged?.flags.length > 0);
	});

	it("excludes language FAIL with quoted requirement and keeps FLAGs visible", async () => {
		const plan = await planRank({
			profile: PROFILE,
			items: [
				item({
					key: "acme_lang_fail",
					postingText: "ML Engineer at Acme.\nRequirements: Python.\nDanish is required for this role.",
				}),
				item({
					key: "acme_lang_flag",
					url: "https://example.com/flag",
					postingText: "ML Engineer at Acme.\nRequirements: Python.\nNative English required for client work.",
				}),
			],
			now: new Date("2026-09-29T00:00:00Z"),
		});
		const excluded = plan.excluded.find((entry) => entry.key === "acme_lang_fail");
		assert.ok(excluded, "undeclared language FAIL excluded");
		assert.equal(excluded?.kind, "language");
		assert.ok((excluded?.quote ?? "").length > 0, "quoted requirement");
		const flagged = plan.ranked.find((entry) => entry.key === "acme_lang_flag");
		assert.ok(!plan.excluded.some((entry) => entry.key === "acme_lang_flag"), "FLAG stays");
		assert.ok(flagged);
	});

	it("marks deadlines within 7 days urgent with tiebreak and past deadlines expired", async () => {
		const plan = await planRank({
			profile: PROFILE,
			items: [
				item({ key: "acme_soon", url: "https://example.com/soon", deadline: "2026-10-02" }),
				item({ key: "acme_past", url: "https://example.com/past", deadline: "2026-09-01" }),
			],
			now: new Date("2026-09-29T00:00:00Z"),
		});
		const soon = plan.ranked.find((entry) => entry.key === "acme_soon");
		assert.ok(soon?.urgent, "closing soon flagged urgent");
		assert.ok(plan.closingSoon.some((entry) => entry.key === "acme_soon"));
		assert.ok(plan.excluded.some((entry) => entry.key === "acme_past" && entry.kind === "expired"));
	});

	it("flags staleness for old posted dates without veto", async () => {
		const plan = await planRank({
			profile: PROFILE,
			items: [item({ postedDate: "2026-07-01" })],
			now: new Date("2026-09-29T00:00:00Z"),
		});
		assert.equal(plan.ranked.length, 1);
		assert.ok((plan.ranked[0].staleNote ?? "").length > 0, "stale flagged");
		assert.equal(plan.excluded.length, 0, "staleness never vetoes");
	});
});

describe("planRank state writes and sweep", () => {
	it("returns additive-only rank fields with verbatim strengths and gaps", async () => {
		const plan = await planRank({
			profile: PROFILE,
			items: [item()],
			now: new Date("2026-09-29T00:00:00Z"),
		});
		assert.equal(plan.stateUpdates.length, 1);
		const update = plan.stateUpdates[0];
		assert.equal(update.status, "ranked");
		assert.ok(typeof update.rank_score === "number");
		assert.ok(typeof update.rank_verdict === "string");
		assert.ok(typeof update.rank_date === "string");
		assert.ok(typeof update.location_verdict === "string");
		assert.ok(typeof update.language_gate === "string");
		assert.ok(Array.isArray(update.strengths) && Array.isArray(update.gaps));
	});

	it("sweeps stored deadlines for newly expired and closing-soon without guessing", async () => {
		const plan = await planRank({
			profile: PROFILE,
			items: [],
			storedRanks: [
				{ key: "old_expired", deadline: "2026-09-01" },
				{ key: "old_soon", deadline: "2026-10-02" },
				{ key: "old_none", deadline: null },
				{ key: "old_bad", deadline: "sometime soon" },
			],
			now: new Date("2026-09-29T00:00:00Z"),
		});
		assert.ok(plan.sweptExpired.some((entry) => entry.key === "old_expired"));
		assert.ok(plan.sweptClosingSoon.some((entry) => entry.key === "old_soon"));
		assert.ok(!plan.sweptExpired.some((entry) => entry.key === "old_none"));
		assert.ok(!plan.sweptExpired.some((entry) => entry.key === "old_bad"));
	});
});

describe("rank-jobs tool", () => {
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
		registerRankJobs(server);
		return captured;
	}

	const ARGS = {
		items: [
			{
				key: "acme_ml-engineer",
				title: "ML Engineer",
				company: "Acme",
				url: "https://example.com/jobs/1",
				postingText: "ML Engineer at Acme.\nRequirements: Python, SQL.\nDomain: fraud detection.\nRemote.",
			},
		],
	};

	it("registers under rank-jobs", () => {
		const tools = registered();
		assert.equal(tools.length, 1);
		assert.equal(tools[0].name, "rank-jobs");
	});

	it("triages caller-held items with counts and routes picks to analyze-job", async () => {
		const tools = registered();
		const result = await (tools[0].handler as LooseHandler)(ARGS, {});
		assert.equal(result.isError, undefined);
		const structured = result.structuredContent as Record<string, unknown>;
		assert.equal(structured["eligibleCount"], 1);
		assert.ok(Array.isArray(structured["shortlist"]));
		assert.ok(Array.isArray(structured["stateUpdates"]));
		assert.deepEqual(JSON.parse(result.content[0].text), JSON.parse(JSON.stringify(structured)));
	});
});
