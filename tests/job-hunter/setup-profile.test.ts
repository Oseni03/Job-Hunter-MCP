import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { planSetupProfile, placeholderFields } from "@/lib/job-hunter/setup-profile.ts";
import { resolveUserId, redactPii, isDbConfigured } from "@/lib/db.ts";

describe("setup-profile from uploaded resume", () => {
	it("refuses empty resume text", () => {
		const result = planSetupProfile({ resumeText: "   " });
		assert.equal(result.ok, false);
	});

	it("builds a validated profile with hash and unset warnings", () => {
		const result = planSetupProfile({
			resumeText: "Jane Doe, Python engineer, 5 years fraud detection.",
			profile: { name: "Jane Doe", primarySkills: ["Python", "SQL"] },
		});
		assert.equal(result.ok, true);
		assert.ok(result.ok && result.resumeHash.length === 40);
		assert.ok(result.ok && result.profile.name === "Jane Doe");
		assert.ok(
			result.ok && result.warnings.join(" ").includes("strongDomains"),
			"flags fields still unset",
		);
	});

	it("rejects non-object profile overrides", () => {
		const result = planSetupProfile({ resumeText: "text", profile: "nope" as unknown as Record<string, unknown> });
		assert.equal(result.ok, false);
	});

	it("reports placeholder fields for the default profile", () => {
		const result = planSetupProfile({ resumeText: "some resume text" });
		assert.equal(result.ok, true);
		assert.ok(result.ok && placeholderFields(result.profile).includes("name"));
	});
});

describe("user identity + logging hygiene", () => {
	it("maps OAuth sub+issuer to a stable user id", () => {
		const user = resolveUserId({ issuer: "https://auth.example", sub: "user-123" });
		assert.equal(user.id, "https://auth.example:user-123");
	});

	it("falls back to local-user without auth", () => {
		const user = resolveUserId({});
		assert.equal(user.sub, "local-user");
	});

	it("redacts emails and phones in log notes", () => {
		const redacted = redactPii("mail jane@example.com or +1 555-010-2030");
		assert.ok(!redacted.includes("jane@example.com") && !redacted.includes("555-010"));
	});

	it("degrades gracefully when no DATABASE_URL is set", () => {
		const had = process.env["DATABASE_URL"];
		delete process.env["DATABASE_URL"];
		assert.equal(isDbConfigured(), false);
		if (had !== undefined) process.env["DATABASE_URL"] = had;
	});
});
