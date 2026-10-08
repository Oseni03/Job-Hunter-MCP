import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { EMPTY_SLUG_ERROR } from "@/lib/job-key.ts";
import { sectionHeadings } from "@/lib/job-hunter/document.ts";
import type { FetchLike } from "@/lib/job-hunter/fetch-posting.ts";
import { archiveDirFor, buildCoverLetter, buildTailoredCv, versionKeyFor } from "@/lib/job-hunter/tailor.ts";
import { DEFAULT_PROFILE } from "@/lib/job-hunter/profile.ts";

const POSTING = ["Senior ML Engineer at Acme.", "Requirements: Python.", "Nice to have: Docker."].join("\n");

const RENDER = {
	name: "Test Candidate",
	statement: "Test Candidate brings Python to ML Engineer work.",
	competencies: [{ label: "Python", body: "Direct match to a stated requirement." }],
	headings: sectionHeadings("en"),
};

const LLM = {
	apiKey: "test-key",
	fetchImpl: (async () => ({
		status: 200,
		body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(RENDER) } }] }),
	})) as FetchLike,
};

describe("resumeversion slug contract (ticket 01)", () => {
	it("reuses one slug for CV, letter, archive, and version key", async () => {
		const cv = await buildTailoredCv(
			{
				postingText: POSTING,
				company: "Acme",
				role: "Senior ML Engineer",
				profile: { ...DEFAULT_PROFILE },
			},
			LLM,
		);
		const letter = buildCoverLetter({
			postingText: POSTING,
			company: "Acme",
			role: "Senior ML Engineer",
			profile: { ...DEFAULT_PROFILE },
		});
		assert.equal(cv.ok, true);
		assert.equal(letter.ok, true);
		if (!cv.ok || !letter.ok) return;
		const versionKey = versionKeyFor("Acme", "Senior ML Engineer");
		assert.equal(cv.slug, "acme_senior-ml-engineer");
		assert.equal(letter.slug, cv.slug);
		assert.equal(versionKey, cv.slug);
		assert.equal(cv.archiveDir, archiveDirFor(cv.slug));
		assert.equal(letter.archiveDir, archiveDirFor(cv.slug));
		assert.ok(cv.filePath.includes(cv.slug));
		assert.ok(letter.filePath.includes(cv.slug));
	});

	it("refuses empty identity with no TeX from both builders", async () => {
		const cv = await buildTailoredCv({ postingText: POSTING, profile: { ...DEFAULT_PROFILE } });
		const letter = buildCoverLetter({ postingText: POSTING, profile: { ...DEFAULT_PROFILE } });
		assert.equal(cv.ok, false);
		assert.equal(letter.ok, false);
		if (cv.ok || letter.ok) return;
		assert.equal(cv.error, EMPTY_SLUG_ERROR);
		assert.equal(letter.error, EMPTY_SLUG_ERROR);
		assert.ok(!("tex" in cv));
		assert.ok(!("tex" in letter));
		assert.equal(versionKeyFor(), "");
	});
});
