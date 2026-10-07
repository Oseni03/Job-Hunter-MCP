import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { overallScore, scoreDimensions, verdictFor } from "@/lib/job-hunter/evaluate.ts";
import type { Profile } from "@/lib/job-hunter/profile.ts";
import { DEFAULT_PROFILE } from "@/lib/job-hunter/profile.ts";

const PROFILE: Profile = {
	...DEFAULT_PROFILE,
	name: "Test Candidate",
	preferences: { targetRoles: ["ML Engineer"] },
	skills: [{ name: "Python", category: "primary" as const }, { name: "SQL", category: "primary" as const }, { name: "Machine Learning", category: "primary" as const }, { name: "Docker", category: "secondary" as const }, { name: "AWS", category: "secondary" as const }, { name: "Java", category: "weak" as const }],
	domains: [{ name: "fraud detection", category: "strong" as const }, { name: "data engineering", category: "adjacent" as const }],
	energizingTasks: ["model building"],
	drainingTasks: ["maintenance"],
};

const STRONG_POSTING = [
	"Senior ML Engineer.",
	"Requirements: Python, Machine Learning, SQL.",
	"Domain: fraud detection.",
	"You will love model building.",
	"Remote.",
].join("\n");

const WEAK_POSTING = [
	"Java Developer.",
	"Requirements: Java, Spring.",
	"Maintenance of legacy systems.",
	"Must relocate to Oslo.",
].join("\n");

describe("scoreDimensions", () => {
	it("covers primary skills and domains for a strong posting", () => {
		const dims = Object.fromEntries(
			scoreDimensions(STRONG_POSTING, PROFILE).map((d) => [d.dimension, d]),
		);
		assert.equal(dims["technical"].score, 75);
		assert.equal(dims["experience"].score, 67);
		assert.equal(dims["behavioral"].score, 60);
		assert.equal(dims["career"].score, 100);
		assert.equal(dims["location"].status, "PASS");
	});

	it("scores near zero with draining work and relocation for a weak posting", () => {
		const dims = Object.fromEntries(
			scoreDimensions(WEAK_POSTING, PROFILE).map((d) => [d.dimension, d]),
		);
		assert.equal(dims["technical"].score, 0);
		assert.equal(dims["behavioral"].score, 35);
		assert.equal(dims["career"].score, 0);
		assert.equal(dims["location"].status, "FAIL");
	});

	it("returns neutral 50s with a setup note for an empty profile", () => {
		const dims = scoreDimensions(STRONG_POSTING, DEFAULT_PROFILE);
		for (const dim of dims) {
			if (dim.score !== null) {
				assert.equal(dim.score, 50);
				assert.match(dim.notes, /profile/i);
			}
		}
	});
});

describe("overallScore and verdictFor", () => {
	it("weights Technical 30 / Experience 25 / Behavioral 15 / Career 30", () => {
		const dims = scoreDimensions(STRONG_POSTING, PROFILE);
		// 0.30*75 + 0.25*67 + 0.15*60 + 0.30*100 = 78.25 -> 78
		assert.equal(overallScore(dims), 78);
		assert.equal(verdictFor(78), "Strong Fit");
	});

	it("rates the weak posting Poor", () => {
		const dims = scoreDimensions(WEAK_POSTING, PROFILE);
		assert.equal(verdictFor(overallScore(dims)), "Poor Fit");
	});

	it("applies verdict bands at exact boundaries", () => {
		assert.equal(verdictFor(75), "Strong Fit");
		assert.equal(verdictFor(74), "Good Fit");
		assert.equal(verdictFor(60), "Good Fit");
		assert.equal(verdictFor(59), "Moderate Fit");
		assert.equal(verdictFor(45), "Moderate Fit");
		assert.equal(verdictFor(44), "Weak Fit");
		assert.equal(verdictFor(30), "Weak Fit");
		assert.equal(verdictFor(29), "Poor Fit");
	});

	it("ignores location in the weighted average", () => {
		const dims = scoreDimensions(STRONG_POSTING, PROFILE);
		const withoutLocation = dims.filter((d) => d.dimension !== "location");
		assert.equal(overallScore(withoutLocation), overallScore(dims));
	});
});
