import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	auditClaim,
	checkSourceConsistency,
	extractLogistics,
	matchRequirements,
} from "@/lib/tailor.ts";
import type { Profile } from "@/lib/profile.ts";

const PROFILE: Profile = {
	name: "Test Candidate",
	location: "Copenhagen, Denmark",
	constraints: "No relocation",
	workCountry: "Denmark",
	citizenships: [],
	permitClasses: [],
	languages: [{ language: "English", level: "C1" }],
	primarySkills: ["Python", "SQL", "Machine Learning"],
	secondarySkills: ["Docker"],
	weakSkills: ["Kubernetes"],
	strongDomains: ["fraud detection"],
	adjacentDomains: ["credit risk"],
	careerGoals: ["ML Engineer"],
	energizingTasks: ["model building"],
	drainingTasks: ["maintenance"],
};

const POSTING = [
	"Senior ML Engineer at Acme.",
	"We welcome international applicants and offer visa sponsorship.",
	"Requirements: Python, SQL, Machine Learning.",
	"Nice to have: Docker, Kubernetes.",
	"Domain: fraud detection.",
	"Remote. Apply by 15 March 2026. Ref: ACME-123.",
].join("\n");

describe("matchRequirements", () => {
	it("matches every stated requirement or honestly marks the gap", () => {
		const coverage = matchRequirements(POSTING, PROFILE);
		const byRequirement = new Map(coverage.map((c) => [c.requirement, c.status]));
		assert.equal(byRequirement.get("Python"), "matched");
		assert.equal(byRequirement.get("SQL"), "matched");
		assert.equal(byRequirement.get("Machine Learning"), "matched");
		assert.equal(byRequirement.get("fraud detection"), "matched");
		assert.equal(byRequirement.get("Docker"), "matched");
		assert.equal(byRequirement.get("Kubernetes"), "gap");
	});

	it("engages nice-to-haves by name with their kind kept", () => {
		const coverage = matchRequirements(POSTING, PROFILE);
		const docker = coverage.find((c) => c.requirement === "Docker");
		const kubernetes = coverage.find((c) => c.requirement === "Kubernetes");
		assert.equal(docker?.kind, "nice-to-have");
		assert.equal(kubernetes?.kind, "nice-to-have");
	});

	it("bridges partial overlaps instead of calling them gaps", () => {
		const coverage = matchRequirements("Requirements: machine learning operations.", PROFILE);
		assert.equal(coverage[0].status, "bridged");
	});

	it("recalls bare list lines that name profile skills", () => {
		const coverage = matchRequirements("About the team.\n- Python\n- Python and juggling", PROFILE);
		const byRequirement = new Map(coverage.map((c) => [c.requirement, c.status]));
		assert.equal(byRequirement.get("Python"), "matched");
		assert.equal(byRequirement.get("Python and juggling"), "bridged");
	});

	it("leaves unmarked prose headers out of coverage", () => {
		const coverage = matchRequirements("Senior ML Engineer at Acme.", PROFILE);
		assert.deepEqual(coverage, []);
	});
});

describe("extractLogistics", () => {
	it("pulls work mode, deadline, and reference id for the letter", () => {
		const logistics = extractLogistics(POSTING);
		assert.equal(logistics.workMode, "Remote");
		assert.equal(logistics.deadline, "15 March 2026");
		assert.equal(logistics.referenceId, "ACME-123");
	});

	it("returns nulls when the posting states nothing logistical", () => {
		assert.deepEqual(extractLogistics("Requirements: Python."), {
			workMode: null,
			deadline: null,
			referenceId: null,
		});
	});
});

describe("auditClaim", () => {
	it("grounds claims whose content words all appear in the sources", () => {
		const sources = ["Python developer, built pipelines.", "Fraud detection models in production."];
		const result = auditClaim("I built fraud detection models with Python", sources);
		assert.equal(result.grounded, true);
		assert.deepEqual(result.missing, []);
	});

	it("reports the missing words for ungrounded claims", () => {
		const result = auditClaim("I led a quantum satellite team", ["Python developer."]);
		assert.equal(result.grounded, false);
		assert.ok(result.missing.includes("quantum"));
	});
});

describe("checkSourceConsistency", () => {
	it("warns when the profile name is absent from the master CV", () => {
		const warnings = checkSourceConsistency(PROFILE, "Jane Doe, data analyst.");
		assert.equal(warnings.length, 1);
		assert.ok(warnings[0].includes("Test Candidate"));
		assert.ok(warnings[0].includes("master CV"));
	});

	it("stays silent when sources agree and skips placeholder names", () => {
		assert.deepEqual(checkSourceConsistency(PROFILE, "Test Candidate, ML engineer."), []);
		assert.deepEqual(
			checkSourceConsistency({ ...PROFILE, name: "[YOUR_NAME]" }, "Jane Doe."),
			[],
		);
	});
});
