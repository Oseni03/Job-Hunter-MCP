import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { checkEligibility, checkLanguage } from "../lib/evaluate.ts";
import type { Profile } from "../lib/profile.ts";
import { DEFAULT_PROFILE } from "../lib/profile.ts";

const BASE: Profile = {
	...DEFAULT_PROFILE,
	name: "Test Candidate",
	languages: [{ language: "English", level: "C1" }],
};

describe("language gate coverage (review fixes)", () => {
	it("FAILs an undeclared language outside the common list", () => {
		const result = checkLanguage("Fluent Finnish required for client work.", BASE);
		assert.equal(result.verdict, "FAIL");
		assert.match(result.quote ?? "", /Finnish/);
	});

	it("does not mistake a skill for a language", () => {
		const skilled: Profile = { ...BASE, primarySkills: ["Python"] };
		const result = checkLanguage("Requirements: Python, SQL. Fluent English required.", skilled);
		assert.equal(result.verdict, "PASS");
	});
});

describe("eligibility clearance note (review fix)", () => {
	it("tells the user to verify the clearance scheme", () => {
		const result = checkEligibility("Active SC security clearance required.", BASE);
		assert.equal(result.verdict, "FAIL");
		assert.match(result.note, /scheme/i);
	});
});
