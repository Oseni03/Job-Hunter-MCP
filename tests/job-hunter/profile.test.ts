import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	DEFAULT_PROFILE,
	foldLegacyFields,
	matchingPool,
	parseProfile,
	resolveProfile,
	evidencePool,
} from "@/lib/job-hunter/profile.ts";

describe("resolveProfile", () => {
	it("returns the embedded default when no override is given", () => {
		const profile = resolveProfile(undefined);
		assert.equal(profile.name, DEFAULT_PROFILE.name);
		assert.deepEqual(profile.languages, DEFAULT_PROFILE.languages);
	});

	it("lets a per-call override replace individual fields", () => {
		const profile = resolveProfile({
			name: "Test Candidate",
			skills: [
				{ name: "Python", category: "primary" },
				{ name: "SQL", category: "primary" },
			],
		});
		assert.equal(profile.name, "Test Candidate");
		assert.deepEqual(
			profile.skills?.map((s) => s.name),
			["Python", "SQL"],
		);
	});

	it("replaces the languages table wholesale when overridden", () => {
		const profile = resolveProfile({
			languages: [{ language: "English", level: "C1" }],
		});
		assert.deepEqual(profile.languages, [{ language: "English", level: "C1" }]);
	});

	it("rejects an invalid override", () => {
		assert.throws(() => resolveProfile({ languages: "English" }));
	});
});

describe("foldLegacyFields", () => {
	it("folds legacy skill and domain arrays into the unified shape", () => {
		const folded = foldLegacyFields({
			primarySkills: ["Python"],
			secondarySkills: ["Docker"],
			weakSkills: ["Kubernetes"],
			strongDomains: ["fraud detection"],
			adjacentDomains: ["credit risk"],
		});
		assert.deepEqual(folded["skills"], [
			{ name: "Python", category: "primary" },
			{ name: "Docker", category: "secondary" },
			{ name: "Kubernetes", category: "weak" },
		]);
		assert.deepEqual(folded["domains"], [
			{ name: "fraud detection", category: "strong" },
			{ name: "credit risk", category: "adjacent" },
		]);
	});

	it("folds careerGoals into preferences.targetRoles and drops display-only fields", () => {
		const folded = foldLegacyFields({
			careerGoals: ["ML Engineer"],
			preferences: { targetRoles: ["Data Scientist"] },
			constraints: "none",
			citizenships: ["DK"],
		});
		assert.deepEqual(folded["preferences"], { targetRoles: ["Data Scientist", "ML Engineer"] });
		assert.ok(!("careerGoals" in folded));
		assert.ok(!("constraints" in folded));
		assert.ok(!("citizenships" in folded));
	});

	it("parses a pre-prune payload through parseProfile without losing skills", () => {
		const profile = parseProfile({
			...DEFAULT_PROFILE,
			primarySkills: ["Python", "SQL"],
			strongDomains: ["fraud detection"],
			careerGoals: ["ML Engineer"],
		});
		assert.deepEqual(
			profile.skills?.map((s) => s.name),
			["Python", "SQL"],
		);
		assert.deepEqual(
			profile.domains?.map((d) => d.name),
			["fraud detection"],
		);
		assert.deepEqual(profile.preferences?.targetRoles, ["ML Engineer"]);
	});
});

describe("project descriptions", () => {
	it("keeps project descriptions available for matching and evidence", () => {
		const profile = parseProfile({
			...DEFAULT_PROFILE,
			projects: [
				{
					name: "Risk engine",
					description: "Built a streaming fraud scoring service.",
					technologies: ["Python"],
				},
			],
		});

		assert.ok(matchingPool(profile).includes("Built a streaming fraud scoring service."));
		assert.ok(evidencePool(profile).includes("Built a streaming fraud scoring service."));
	});
});

describe("experience descriptions", () => {
	it("keeps experience descriptions available for matching and evidence", () => {
		const profile = parseProfile({
			...DEFAULT_PROFILE,
			experience: [
				{
					company: "Acme",
					position: "ML Engineer",
					description: "Built fraud detection models for card payments.",
				},
			],
		});

		assert.ok(matchingPool(profile).includes("Built fraud detection models for card payments."));
		assert.ok(evidencePool(profile).includes("Built fraud detection models for card payments."));
	});
});
