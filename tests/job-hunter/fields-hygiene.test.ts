import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { McpServer } from "@modelcontextprotocol/server";

import { planPortalFields } from "@/lib/job-hunter/fields.ts";
import { registerDraftApplicationAnswers } from "@/lib/job-hunter/tools/draft-application-answers.ts";

const PROFILE = {
	name: "Test Candidate",
	primarySkills: ["Python", "SQL"],
	secondarySkills: ["Docker"],
	strongDomains: ["fraud detection"],
	careerGoals: ["ML Engineer"],
	energizingTasks: ["model building"],
	languages: [{ language: "English", level: "C1" }],
};

const BASE = {
	profile: PROFILE,
	company: "Acme",
	experience: [
		{
			title: "Data Analyst",
			company: "R&D Corp",
			period: "2020-2024",
			bullets: ["Cut losses by 12% with Python models for fraud detection."],
		},
	],
	projects: [
		{
			name: "Fraud scoring pipeline",
			role: "ML Engineer",
			dates: "2024-present",
			description:
				"Own the scoring pipeline that screens card transactions before authorization. " +
				"Engineer behavioural features with Python and SQL over streaming history and tune thresholds with risk analysts.",
		},
	],
};

describe("draft-application-answers paste boundary", () => {
	it("keeps internal scope notes out of the copy text by construction", () => {
		const plan = planPortalFields(BASE);
		assert.ok(plan.scopeNotes.length > 0, "scope notes still travel structured");
		assert.ok(!plan.copyPasteText.includes("do not paste"), "no paste-warning heading needed anymore");
		assert.ok(!plan.copyPasteText.includes("Scope notes"), "no scope-notes section in the copy text");
		for (const note of plan.scopeNotes) {
			assert.ok(!plan.copyPasteText.includes(note), `internal note leaked into copy text: ${note}`);
		}
	});
});

describe("draft-application-answers pitch honesty", () => {
	it("marks pitches as expansion seeds in the render", () => {
		const plan = planPortalFields(BASE);
		assert.ok(plan.pitches.length >= 4 && plan.pitches.length <= 6);
		assert.ok(
			plan.copyPasteText.includes("Expansion seeds"),
			"expected the one-line expand-before-sending seed note",
		);
	});
});

describe("draft-application-answers role-type drops", () => {
	it("names dropped role types instead of filtering silently", () => {
		const plan = planPortalFields({ ...BASE, roleTypes: ["technical", "wizard"] });
		assert.deepEqual(plan.selfIntros.map((intro) => intro.roleType), ["technical"]);
		assert.ok(
			plan.warnings.some((warning) => warning.includes("wizard")),
			"expected the dropped value to be named",
		);
	});

	it("falls back to both defaults audibly when every role type is unknown", () => {
		const plan = planPortalFields({ ...BASE, roleTypes: ["wizard"] });
		assert.equal(plan.selfIntros.length, 2);
		assert.ok(plan.warnings.some((warning) => warning.includes("wizard")));
	});

	it("stays silent when every requested role type is known", () => {
		const plan = planPortalFields(BASE);
		assert.ok(plan.warnings.every((warning) => !warning.includes("role type")));
	});
});

describe("draft-application-answers short budget", () => {
	const LONG_FIRST = `${"Word ".repeat(69)}end. Second sentence here.`;

	it("warns on first-sentence overshoot without truncating the claim", () => {
		const plan = planPortalFields({
			...BASE,
			projects: [{ name: "Long one", role: "ML Engineer", dates: "2024-present", description: LONG_FIRST }],
		});
		const entry = plan.projectEntries[0];
		assert.ok(entry.shortWordCount > 60, `expected overshoot, got ${entry.shortWordCount}`);
		assert.ok(entry.shortNote && entry.shortNote.includes("soft target"), "overshoot stated with the soft-target rule");
		assert.ok(entry.short.startsWith("Word"), "first sentence kept whole, never truncated mid-claim");
		assert.ok(plan.copyPasteText.includes(entry.shortNote), "overshoot note ships with the copy text");
	});

	it("reports no short note inside the 60-word budget", () => {
		const plan = planPortalFields(BASE);
		assert.equal(plan.projectEntries[0].shortNote, null);
	});
});

describe("draft-application-answers date validation", () => {
	it("warns on unparseable dates instead of enshrining them", () => {
		const plan = planPortalFields({
			...BASE,
			projects: [{ name: "Fuzzy", role: "ML Engineer", dates: "sometime 2024ish", description: "Built things." }],
		});
		assert.ok(plan.datesReference.includes("sometime 2024ish"), "caller data kept verbatim");
		assert.ok(
			plan.warnings.some((warning) => warning.includes("sometime 2024ish")),
			"expected a vocabulary warning naming the value",
		);
	});

	it("accepts YYYY, ranges, and present-tense dates including unicode dashes", () => {
		const plan = planPortalFields({
			...BASE,
			experience: [{ title: "T", company: "C", period: "2020–2024", bullets: [] }],
			projects: [{ name: "P", role: "R", dates: "2023", description: "Built things." }],
		});
		assert.ok(plan.warnings.every((warning) => !warning.includes("Dates '")), "no vocabulary warnings");
		assert.ok(plan.datesReference.includes("2020–2024"));
		assert.ok(plan.datesReference.includes("2023"));
	});
});

describe("draft-application-answers ephemerality", () => {
	it("declares the copy-paste file ephemeral in the tool description", () => {
		const captured: { name: string; config: { description?: string } }[] = [];
		const server = {
			registerTool(name: string, config: { description?: string }, _handler: unknown) {
				captured.push({ name, config });
			},
		} as unknown as McpServer;
		registerDraftApplicationAnswers(server);
		const description = captured[0].config.description ?? "";
		assert.ok(description.includes("ephemeral"), "expected the ephemeral treatment in the description");
		assert.ok(description.includes("never a record"), "expected the never-a-record rule in the description");
	});
});
