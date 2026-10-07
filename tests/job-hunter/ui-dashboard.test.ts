import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { SAMPLE_CALLS, SAMPLE_TOOLS } from "@/mcp-app/samples.ts";
import { TOOL_LABELS, mapToolToDashboard } from "@/mcp-app/toolviews.ts";
import type { DashboardView } from "@/mcp-app/types.ts";

const EXPECTED_VIEWS: Record<(typeof SAMPLE_TOOLS)[number], DashboardView> = {
	"analyze-job": "analysis",
	"tailor-resume": "overview",
	"generate-cover-letter": "overview",
	"track-application": "overview",
	"prepare-interview": "interview",
	"career-strategy": "overview",
	"draft-application-answers": "overview",
	"rank-jobs": "rank",
	"research-company": "overview",
	"research-job": "overview",
	"search-jobs": "search",
	"setup-profile": "overview",
	"due-followups": "followups",
};

describe("dashboard mappers", () => {
	it("covers every registered tool with a labeled, non-empty view", () => {
		assert.deepEqual([...SAMPLE_TOOLS].sort(), Object.keys(EXPECTED_VIEWS).sort());
		for (const tool of SAMPLE_TOOLS) {
			assert.ok(TOOL_LABELS[tool], `${tool} needs a human label for the picker`);
			const sample = SAMPLE_CALLS[tool];
			const data = mapToolToDashboard(tool, sample.args, sample.structured, sample.text);
			assert.equal(data.view, EXPECTED_VIEWS[tool], `${tool} maps to the wrong view`);
			assert.ok((data.title ?? "").length > 0, `${tool} renders without a title`);
			assert.ok(
				data.summary || (data.items?.length ?? 0) > 0 || data.markdown,
				`${tool} renders nothing`,
			);
		}
	});

	it("renders rich items for the high-signal tools", () => {
		const analysis = mapToolToDashboard(
			"analyze-job",
			SAMPLE_CALLS["analyze-job"].args,
			SAMPLE_CALLS["analyze-job"].structured,
			null,
		);
		assert.equal(analysis.items?.length, 4);
		assert.ok(analysis.summary?.includes("Strong Fit"));
		assert.ok(analysis.description?.includes("Build and own Python APIs"));

		const truncated = mapToolToDashboard("analyze-job", { postingText: `${"x".repeat(5000)}` }, {}, null);
		assert.ok((truncated.description?.length ?? 0) < 5000);
		assert.ok(truncated.description?.includes("truncated"));

		const profile = mapToolToDashboard(
			"setup-profile",
			{},
			{
				profile: {
					name: "Ada Example",
					projects: [{ name: "Risk engine", description: "Built a streaming fraud scoring service." }],
				},
			},
			null,
		);
		assert.equal(profile.items?.[0].title, "Risk engine");
		assert.equal(profile.items?.[0].note, "Built a streaming fraud scoring service.");

		const profileWithExperience = mapToolToDashboard(
			"setup-profile",
			{},
			{
				profile: {
					name: "Ada Example",
					experience: [
						{
							position: "ML Engineer",
							company: "Acme",
							description: "Built fraud detection models for card payments.",
						},
					],
				},
			},
			null,
		);
		assert.equal(profileWithExperience.items?.[0].title, "ML Engineer at Acme");
		assert.equal(profileWithExperience.items?.[0].note, "Built fraud detection models for card payments.");

		const linked = mapToolToDashboard(
			"analyze-job",
			{ postingUrl: "https://example.com/jobs/1" },
			{},
			null,
		);
		assert.equal(linked.description, "Full posting: https://example.com/jobs/1");

		const analysisJson = JSON.parse(analysis.markdown ?? "") as {
			overallScore?: number;
			verdict?: string;
		};
		assert.equal(analysisJson.overallScore, 82);
		assert.equal(analysisJson.verdict, "Strong Fit");

		const analysisWithText = mapToolToDashboard(
			"analyze-job",
			SAMPLE_CALLS["analyze-job"].args,
			SAMPLE_CALLS["analyze-job"].structured,
			SAMPLE_CALLS["analyze-job"].text,
		);
		assert.ok(!analysisWithText.markdown?.includes("## Job Fit Evaluation"));

		const rank = mapToolToDashboard("rank-jobs", {}, SAMPLE_CALLS["rank-jobs"].structured, null);
		assert.equal(rank.items?.length, 1);
		assert.equal(rank.items?.[0].score, 82);

		const followups = mapToolToDashboard(
			"due-followups",
			{},
			SAMPLE_CALLS["due-followups"].structured,
			null,
		);
		assert.equal(followups.items?.length, 1);
		assert.ok(followups.items?.[0].note?.includes("Send a short check-in."));
	});

	it("degrades gracefully on empty or unknown payloads without guessing", () => {
		const empty = mapToolToDashboard("analyze-job", {}, null, null);
		assert.equal(empty.view, "analysis");
		assert.equal(empty.items?.length, 0);
		assert.equal(empty.markdown, undefined);

		const unknown = mapToolToDashboard("future-tool", { a: 1 }, { b: 2 }, "## Hello");
		assert.equal(unknown.title, "future-tool");
		assert.equal(unknown.markdown, "## Hello");
	});
});
