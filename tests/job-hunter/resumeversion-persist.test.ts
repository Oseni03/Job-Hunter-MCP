import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	EMPTY_HTML_ERROR,
	EMPTY_VERSION_KEY_ERROR,
	buildResumeVersionRecord,
	fetchLatestResumeVersion,
	fetchResumeVersions,
	saveResumeVersion,
	toReviewMarkdown,
} from "@/lib/job-hunter/resume-version.ts";

const HTML = "<!doctype html><html><body><h2>Experience</h2><p>Cut losses by 12%.</p></body></html>";

describe("resumeversion persistence (ticket 02)", () => {
	it("derives review markdown prose from HTML without inventing text", () => {
		const markdown = toReviewMarkdown(HTML);
		assert.ok(!markdown.includes("<"));
		assert.ok(markdown.includes("Cut losses by 12"));
	});

	it("builds a byte-identical storable record", () => {
		const built = buildResumeVersionRecord({
			userId: "local:test",
			jobKey: "acme_senior-ml-engineer",
			html: HTML,
			verification: { compiles: true, keywordOverlap: 0.5, noNewEmployers: true },
		});
		assert.equal(built.ok, true);
		if (!built.ok) return;
		assert.equal(built.record.html, HTML);
		assert.equal(built.record.userId, "local:test");
		assert.equal(built.record.jobKey, "acme_senior-ml-engineer");
		assert.ok(built.record.markdown.includes("Cut losses by 12"));
		assert.deepEqual(built.record.verification, {
			compiles: true,
			keywordOverlap: 0.5,
			noNewEmployers: true,
		});
	});

	it("fails loudly on empty source with no record", () => {
		const built = buildResumeVersionRecord({ userId: "u", jobKey: "k", html: "  \n " });
		assert.equal(built.ok, false);
		if (built.ok) return;
		assert.equal(built.error, EMPTY_HTML_ERROR);
		assert.ok(!("record" in built));
	});

	it("fails loudly on empty user or key with no record", () => {
		const built = buildResumeVersionRecord({ userId: " ", jobKey: "k", html: HTML });
		assert.equal(built.ok, false);
		if (built.ok) return;
		assert.equal(built.error, EMPTY_VERSION_KEY_ERROR);
	});

	it("degrades gracefully without a database", async () => {
		const built = buildResumeVersionRecord({ userId: "u", jobKey: "k", html: HTML });
		assert.equal(built.ok, true);
		if (!built.ok) return;
		assert.deepEqual(await saveResumeVersion(null, built.record), {
			persisted: false,
			reason: "no-database",
		});
		assert.deepEqual(await fetchResumeVersions(null, "u", "k"), []);
		assert.equal(await fetchLatestResumeVersion(null, "u", "k"), null);
	});
});
