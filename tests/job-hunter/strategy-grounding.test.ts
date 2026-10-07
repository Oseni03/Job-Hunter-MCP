import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { contentWords } from "@/lib/job-hunter/evaluate.ts";
import { planCareerStrategy, STRENGTH_EVIDENCE_SUFFIX } from "@/lib/job-hunter/strategy.ts";
import { planInterviewPrep } from "@/lib/job-hunter/prep.ts";

const BASE_PROFILE = {
	name: "Test Candidate",
	preferences: { targetRoles: ["ML Engineer"] },
	skills: [{ name: "Python", category: "primary" as const }, { name: "SQL", category: "primary" as const }, { name: "Docker", category: "secondary" as const }],
	domains: [{ name: "fraud detection", category: "strong" as const }, { name: "credit risk", category: "adjacent" as const }],
	energizingTasks: ["model building"],
	drainingTasks: ["on-call maintenance"],
	languages: [{ language: "English", level: "C1" }],
};

describe("strategy grounding matcher (issue 24)", () => {
	it("grounds on meaningful whole-word overlap, not substring containment", () => {
		const plan = planCareerStrategy({ profile: BASE_PROFILE, focusAreas: ["Credit Risk Analytics"] });
		assert.ok(
			plan.directions.some((direction) => direction.direction.includes("Credit Risk Analytics")),
			"expected shared 'credit risk' to ground the nominated area",
		);
	});

	it("skips bare generic terms even when a skill contains them", () => {
		const plan = planCareerStrategy({
			profile: { ...BASE_PROFILE, primarySkills: ["backend developer"] },
			focusAreas: ["developer"],
		});
		assert.ok(
			plan.skipped.some((entry) => entry.includes("developer")),
			"expected bare 'developer' to land in skipped",
		);
		assert.ok(
			plan.directions.every((direction) => !direction.direction.includes("Assess developer")),
			"no direction from a generic term alone",
		);
	});

	it("does not match a generic superstring against a skill (developer relations)", () => {
		const plan = planCareerStrategy({
			profile: { ...BASE_PROFILE, primarySkills: ["backend developer"] },
			focusAreas: ["developer relations"],
		});
		assert.ok(
			plan.skipped.some((entry) => entry.includes("developer relations")),
			"expected 'developer relations' to land in skipped: only the generic 'developer' is shared",
		);
	});

	it("sends goal-only overlap to skipped as circular, never as grounding", () => {
		const plan = planCareerStrategy({
			profile: { name: "Test Candidate", primarySkills: ["Python"], careerGoals: ["product manager"] },
			focusAreas: ["product management"],
		});
		const entry = plan.skipped.find((line) => line.includes("product management"));
		assert.ok(entry, "expected the goal-only area to land in skipped");
		assert.ok(entry.includes("circular"), "expected the skip note to name the circularity");
		assert.ok(
			plan.directions.every((direction) => !direction.direction.includes("product management")),
			"goals alone never ground a direction",
		);
	});
});

describe("strategy ranking and multiple summaries (issue 24)", () => {
	it("keeps a single summary valid input with no priority gaps", () => {
		const plan = planCareerStrategy({
			profile: BASE_PROFILE,
			evaluationSummary: { fitScore: 84, verdict: "Good Fit", gaps: ["Kubernetes"] },
		});
		assert.ok(plan.directions.length > 0, "expected directions from a single summary");
		assert.deepEqual(plan.priorityGaps, []);
		const ml = plan.directions.find((direction) => direction.direction.includes("ML Engineer"));
		assert.ok(ml && ml.gapsToClose.some((gap) => gap.includes("Kubernetes")));
	});

	it("surfaces gaps recurring across summaries as priority gaps, ordered first", () => {
		const plan = planCareerStrategy({
			profile: BASE_PROFILE,
			evaluationSummaries: [
				{ fitScore: 70, verdict: "Maybe", gaps: ["Kubernetes", "public speaking"] },
				{ fitScore: 62, verdict: "Long Shot", gaps: ["Kubernetes", "system design"] },
			],
		});
		assert.deepEqual(plan.priorityGaps, ["Kubernetes"]);
		for (const direction of plan.directions) {
			if (direction.gapsToClose.includes("Kubernetes")) {
				assert.equal(direction.gapsToClose[0], "Kubernetes", "recurring gaps order first");
			}
		}
		assert.ok(plan.frameworkNote.includes("2 evaluations held"));
	});

	it("ranks deeper evidence first and thin evidence last, never padded", () => {
		const plan = planCareerStrategy({
			profile: { name: "Test Candidate", primarySkills: ["Python", "SQL", "Docker"], careerGoals: ["ML Engineer"] },
			focusAreas: ["Python SQL automation", "Docker setups"],
		});
		assert.equal(plan.directions.length, 3);
		assert.ok(plan.directions[0].direction.includes("ML Engineer"), "transferable-backed goal ranks first");
		const stretch = plan.directions.filter((direction) => direction.direction.startsWith("Assess"));
		assert.equal(stretch.length, 2);
		assert.ok(stretch[0].direction.includes("Python SQL automation"), "two-phrase grounding outranks one");
		assert.ok(stretch[1].direction.includes("Docker setups"));
		assert.deepEqual(
			stretch[1].evidence,
			["Docker"],
			"thin evidence reads as thin: one citation, nothing padded in",
		);
	});
});

describe("strategy strengths wiring (issue 24)", () => {
	it("ingests summary strengths as labeled evidence and keeps the note truthful", () => {
		const plan = planCareerStrategy({
			profile: BASE_PROFILE,
			evaluationSummary: {
				fitScore: 84,
				verdict: "Good Fit",
				strengths: ["Python models for fraud detection"],
				gaps: ["Kubernetes"],
			},
		});
		const labeled = `Python models for fraud detection${STRENGTH_EVIDENCE_SUFFIX}`;
		assert.ok(
			plan.directions.every((direction) => direction.evidence.includes(labeled)),
			"expected the caller-supplied strength labeled in every evidence array",
		);
		assert.ok(plan.frameworkNote.includes("strengths reinforce evidence"));
	});
});

describe("shared word floor (issue 24)", () => {
	it("keeps SQL usable in the shared helper both consumers use", () => {
		assert.ok(contentWords("SQL tuning").has("sql"), "expected the shared floor to keep 'sql'");
		assert.ok(!contentWords("a").has("a"), "expected single letters to stay out");
	});

	it("covers SQL gaps in strategy through the shared floor", () => {
		const plan = planCareerStrategy({
			profile: { name: "Test Candidate", primarySkills: ["SQL"], careerGoals: ["Data Analyst"] },
			evaluationSummary: { gaps: ["SQL tuning", "Kubernetes"] },
		});
		const goal = plan.directions.find((direction) => direction.direction.includes("Data Analyst"));
		assert.ok(goal, "expected the goal direction");
		assert.deepEqual(goal.gapsToClose, ["Kubernetes"], "SQL-covered gap drops out via the shared floor");
	});

	it("covers SQL questions in prep through the shared floor", () => {
		const plan = planInterviewPrep({
			company: "Acme",
			role: "Data Analyst",
			stage: "technical",
			postingText: "Data Analyst at Acme.\nRequirements: SQL.\nDomain: reporting.",
			profile: { name: "Test Candidate", primarySkills: ["SQL"] },
			starExamples: [
				{
					title: "Warehouse rollout",
					situation: "Reports were slow at R&D Corp.",
					task: "Speed up reporting with SQL.",
					action: "Built indexed SQL views.",
					result: "Load time fell 40%.",
					useFor: ["SQL"],
				},
			],
		});
		const mapping = plan.starMapping.find((entry) => entry.title === "Warehouse rollout");
		assert.ok(mapping, "expected the example to be mapped");
		assert.ok(
			mapping.covers.some((question) => question.includes("SQL")),
			"expected the SQL tag to cover an SQL question",
		);
	});
});
