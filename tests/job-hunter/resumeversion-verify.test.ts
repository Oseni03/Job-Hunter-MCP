import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { McpServer } from "@modelcontextprotocol/server";

import {
	buildResumeVerification,
	buildTailorEventNote,
	logTailorEvent,
} from "@/lib/job-hunter/resume-version.ts";
import { registerTailorResume } from "@/lib/job-hunter/tools/tailor-resume.ts";

type ToolResult = {
	content: { type: string; text: string }[];
	structuredContent?: Record<string, unknown>;
	isError?: boolean;
};

function toolHandler(register: (server: McpServer) => void) {
	const captured: unknown[] = [];
	const server = {
		registerTool(_name: string, _config: unknown, handler: unknown) {
			captured.push(handler);
		},
	} as unknown as McpServer;
	register(server);
	return captured[0] as (input: Record<string, unknown>, extra: unknown) => Promise<ToolResult>;
}

const POSTING = ["Senior ML Engineer at Acme.", "Requirements: Python, SQL."].join("\n");

describe("resumeversion verification (ticket 03)", () => {
	it("scores full matches as overlap 1 with no invented employers", () => {
		const verification = buildResumeVerification({
			coverage: [{ status: "matched" }, { status: "matched" }, { status: "gap" }],
			draftDrift: [],
			latexSafetyPassed: true,
		});
		assert.deepEqual(verification, { compiles: true, keywordOverlap: 0.67, noNewEmployers: true });
	});

	it("fails loudly on drift and empty coverage", () => {
		const verification = buildResumeVerification({
			coverage: [],
			draftDrift: ["unverified employer claim"],
			latexSafetyPassed: false,
		});
		assert.deepEqual(verification, { compiles: false, keywordOverlap: 0, noNewEmployers: false });
	});

	it("keeps the event note to slugs and counts, never contact text", () => {
		const note = buildTailorEventNote({
			slug: "acme_senior-ml-engineer",
			verification: { compiles: true, keywordOverlap: 1, noNewEmployers: true },
			driftCount: 0,
			stretchCount: 1,
			stored: true,
		});
		assert.ok(note.includes("acme_senior-ml-engineer"));
		assert.ok(!note.includes("@"));
		assert.ok(!/\d{8,}/.test(note));
	});

	it("degrades event logging without a database", async () => {
		assert.deepEqual(await logTailorEvent(null, { userId: "u", ok: true, note: "n" }), {
			logged: false,
			reason: "no-database",
		});
	});

	it("returns verification with the tailoring without failing anonymous callers", async () => {
		const result = await toolHandler(registerTailorResume)(
			{ postingText: POSTING, company: "Acme", role: "Senior ML Engineer" },
			{},
		);
		assert.equal(result.isError, undefined);
		const verification = (result.structuredContent as Record<string, unknown>)[
			"verification"
		] as Record<string, unknown>;
		assert.equal(typeof verification["compiles"], "boolean");
		assert.equal(typeof verification["keywordOverlap"], "number");
		assert.equal(typeof verification["noNewEmployers"], "boolean");
		assert.equal(
			(result.structuredContent as Record<string, unknown>)["versionId"],
			undefined,
			"anonymous callers store nothing",
		);
	});
});
