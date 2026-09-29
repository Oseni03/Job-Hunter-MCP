import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_PROFILE, resolveProfile } from "../lib/profile.ts";

describe("resolveProfile", () => {
	it("returns the embedded default when no override is given", () => {
		const profile = resolveProfile(undefined);
		assert.equal(profile.name, DEFAULT_PROFILE.name);
		assert.deepEqual(profile.languages, DEFAULT_PROFILE.languages);
	});

	it("lets a per-call override replace individual fields", () => {
		const profile = resolveProfile({
			name: "Test Candidate",
			primarySkills: ["Python", "SQL"],
		});
		assert.equal(profile.name, "Test Candidate");
		assert.deepEqual(profile.primarySkills, ["Python", "SQL"]);
		assert.deepEqual(profile.secondarySkills, DEFAULT_PROFILE.secondarySkills);
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
