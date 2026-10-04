import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { planCareerStrategy } from "@/lib/job-hunter/strategy.ts";

const PROFILE = {
	name: "Test Candidate",
	primarySkills: ["Python", "SQL"],
	secondarySkills: ["Docker"],
	strongDomains: ["fraud detection"],
	adjacentDomains: ["credit risk"],
	careerGoals: ["ML Engineer"],
	energizingTasks: ["model building"],
	drainingTasks: ["on-call maintenance"],
	languages: [{ language: "English", level: "C1" }],
};

describe("planCareerStrategy", () => {
	it("recommends career-goal directions grounded in profile evidence", () => {
		const plan = planCareerStrategy({ profile: PROFILE });
		const ml = plan.directions.find((direction) => direction.direction.includes("ML Engineer"));
		assert.ok(ml, "expected the ML Engineer goal to become a direction");
		assert.ok(ml.evidence.length > 0, "expected grounding evidence");
		assert.ok(ml.why.some((reason) => reason.includes("Python")), "why cites profile evidence");
	});

	it("never invents experience: ungrounded focus areas land in skipped", () => {
		const plan = planCareerStrategy({ profile: PROFILE, focusAreas: ["Astronaut", "ML Engineer"] });
		assert.ok(
			plan.skipped.some((entry) => entry.includes("Astronaut")),
			"expected the ungrounded area to be skipped honestly",
		);
		assert.ok(
			plan.directions.every((direction) => !direction.direction.includes("Astronaut")),
			"no direction without grounding",
		);
	});

	it("assesses a grounded nominated focus area instead of skipping it", () => {
		const plan = planCareerStrategy({ profile: PROFILE, focusAreas: ["credit risk"] });
		assert.ok(
			plan.directions.some((direction) => direction.direction.includes("credit risk")),
			"expected the adjacent-domain focus to be assessed",
		);
		assert.ok(plan.skipped.every((entry) => !entry.includes("credit risk")));
		const stretch = plan.directions.find((direction) => direction.direction.includes("credit risk"));
		assert.ok(stretch && stretch.gapsToClose.length > 0, "stretch directions name gaps to close");
	});

	it("steers away from draining tasks and respects the evaluation framework", () => {
		const plan = planCareerStrategy({
			profile: PROFILE,
			evaluationSummary: {
				fitScore: 84,
				verdict: "Good Fit",
				strengths: ["Python models for fraud detection"],
				gaps: ["Kubernetes"],
			},
		});
		assert.ok(
			plan.avoidNotes.some((note) => note.includes("on-call maintenance")),
			"expected draining tasks in avoid notes",
		);
		assert.ok(plan.frameworkNote.includes("technical"), "framework names evaluation dimensions");
		assert.ok(plan.frameworkNote.includes("career"), "framework names evaluation dimensions");
		const ml = plan.directions.find((direction) => direction.direction.includes("ML Engineer"));
		assert.ok(
			ml && ml.gapsToClose.some((gap) => gap.includes("Kubernetes")),
			"evaluation gaps reinforce gaps to close",
		);
	});

	it("every direction traces to profile phrases with no invented evidence", () => {
		const summary = { strengths: ["Python models for fraud detection"], gaps: ["Kubernetes"] };
		const plan = planCareerStrategy({ profile: PROFILE, focusAreas: ["ML Engineer", "credit risk"], evaluationSummary: summary });
		const union = JSON.stringify(PROFILE).toLowerCase();
		assert.ok(plan.directions.length > 0);
		for (const direction of plan.directions) {
			assert.ok(direction.evidence.length > 0, "each direction needs evidence");
			for (const phrase of direction.evidence) {
				if (phrase.endsWith(" (evaluation strength)")) {
					const raw = phrase.slice(0, -" (evaluation strength)".length);
					assert.ok(
						summary.strengths.includes(raw),
						`labeled strength '${phrase}' must come from the evaluation summary`,
					);
					continue;
				}
				assert.ok(union.includes(phrase.toLowerCase()), `evidence '${phrase}' must be a profile phrase`);
			}
			for (const dimension of direction.dimensions) {
				assert.ok(
					["technical", "experience", "behavioral", "location", "career"].includes(dimension),
					`dimension '${dimension}' must come from the evaluation framework`,
				);
			}
		}
	});

	it("warns when the profile is still a placeholder", () => {
		const plan = planCareerStrategy({});
		assert.ok(
			plan.warnings.some((warning) => warning.includes("placeholder")),
			"expected a placeholder-profile warning",
		);
		assert.equal(plan.directions.length, 0, "no directions without any profile facts");
	});
});
