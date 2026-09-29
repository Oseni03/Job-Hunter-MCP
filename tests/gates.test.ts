import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { checkEligibility, checkLanguage } from "@/lib/evaluate.ts";
import type { Profile } from "@/lib/profile.ts";
import { DEFAULT_PROFILE } from "@/lib/profile.ts";

const BASE: Profile = {
	...DEFAULT_PROFILE,
	name: "Test Candidate",
	permitClasses: ["S2 residence permit"],
	languages: [
		{ language: "Spanish", level: "Native" },
		{ language: "English", level: "B1/B2" },
	],
};

describe("checkEligibility", () => {
	it("FAILs on a citizenship requirement and quotes the wording", () => {
		const text = "About the role.\nApplicants must be citizens of Denmark.\nApply now.";
		const result = checkEligibility(text, BASE);
		assert.equal(result.verdict, "FAIL");
		assert.match(result.quote ?? "", /citizens of Denmark/);
	});

	it("FAILs on a security clearance requirement", () => {
		const result = checkEligibility("Active SC security clearance required.", BASE);
		assert.equal(result.verdict, "FAIL");
	});

	it("PASSes when international applicants are explicitly welcome", () => {
		const result = checkEligibility(
			"We welcome international applicants and offer visa sponsorship.",
			BASE,
		);
		assert.equal(result.verdict, "PASS");
	});

	it("PASSes when the posting names the candidate's permit class", () => {
		const result = checkEligibility(
			"Holders of an S2 residence permit are encouraged to apply.",
			BASE,
		);
		assert.equal(result.verdict, "PASS");
	});

	it("marks silent postings unverified and calls for a role-level check", () => {
		const result = checkEligibility("Exciting ML role. Python and SQL. Apply today.", BASE);
		assert.equal(result.verdict, "PROCEED_UNVERIFIED");
		assert.match(result.note, /role-level/i);
	});
});

describe("checkLanguage", () => {
	it("FAILs on a required language the candidate does not declare", () => {
		const result = checkLanguage("Fluent Russian required for client calls.", BASE);
		assert.equal(result.verdict, "FAIL");
		assert.match(result.quote ?? "", /Russian/);
	});

	it("FLAGs a bar plausibly higher than the declared level, quoting both", () => {
		const result = checkLanguage("We require fluent English.", BASE);
		assert.equal(result.verdict, "FLAG");
		assert.match(result.quote ?? "", /fluent English/);
		assert.match(result.note, /B1\/B2/);
	});

	it("PASSes a lower bar on a declared language", () => {
		const result = checkLanguage("Conversational English is enough.", BASE);
		assert.equal(result.verdict, "PASS");
	});

	it("PASSes a named language with no stated level", () => {
		const result = checkLanguage("English required.", BASE);
		assert.equal(result.verdict, "PASS");
	});

	it("PASSes when the posting states no language requirement", () => {
		const result = checkLanguage("Python, SQL, 3+ years experience.", BASE);
		assert.equal(result.verdict, "PASS");
	});
});
