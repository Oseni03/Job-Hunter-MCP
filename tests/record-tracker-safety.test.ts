import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
	TRACKER_HEADER,
	deneutralizeTrackerField,
	normalizeCompanyName,
	normalizeRoleName,
	planRecordApplication,
	sanitizeTrackerField,
	trackerHashFor,
} from "@/lib/record.ts";

const BASE = {
	company: "Acme",
	role: "Senior ML Engineer",
	cvFile: "cv/main_acme_senior-ml-engineer.tex",
	coverLetterFile: "cover_letters/cover_acme_senior-ml-engineer.tex",
	fitScore: 84,
	today: "2026-03-01",
};

function trackerWith(...rows: string[]): string {
	return `${TRACKER_HEADER}\n${rows.join("\n")}\n`;
}

describe("tracker field sanitization", () => {
	it("prefixes leading formula characters and never double-prefixes", () => {
		for (const lead of ["=", "+", "-", "@"]) {
			assert.equal(sanitizeTrackerField(`${lead}CMD`), `'${lead}CMD`);
			assert.equal(sanitizeTrackerField(`'${lead}CMD`), `'${lead}CMD`);
		}
		assert.equal(sanitizeTrackerField("Acme"), "Acme");
		assert.equal(sanitizeTrackerField("'quoted"), "'quoted");
	});

	it("flattens newlines so rows survive a re-read", () => {
		assert.equal(sanitizeTrackerField("Senior\nML Engineer"), "Senior ML Engineer");
		assert.equal(sanitizeTrackerField("a\r\nb\rc"), "a b c");
	});

	it("deneutralizes only the injection prefix for matching", () => {
		assert.equal(deneutralizeTrackerField("'=CMD"), "=CMD");
		assert.equal(deneutralizeTrackerField("Acme"), "Acme");
		assert.equal(deneutralizeTrackerField("'quoted"), "'quoted");
	});
});

describe("tracker name normalization", () => {
	it("drops trailing legal suffixes as whole tokens only", () => {
		assert.equal(normalizeCompanyName("Acme"), "acme");
		assert.equal(normalizeCompanyName("Acme Ltd"), "acme");
		assert.equal(normalizeCompanyName("Acme, Inc."), "acme");
		assert.equal(normalizeCompanyName("Acme L.L.C."), "acme");
		assert.equal(normalizeCompanyName("Acme GmbH"), "acme");
		assert.equal(normalizeCompanyName("Acme Partners"), "acme partners");
		assert.equal(normalizeCompanyName("Banco"), "banco");
		assert.equal(normalizeCompanyName("Visa"), "visa");
	});

	it("normalizes roles without substring matching", () => {
		assert.equal(normalizeRoleName("Senior\nML Engineer"), "senior ml engineer");
		assert.equal(normalizeRoleName("Senior ML Engineer (m/f/d)"), "senior ml engineer m f d");
	});
});

describe("formula-injection fixtures", () => {
	for (const lead of ["=", "+", "-", "@"]) {
		it(`neutralizes a ${lead}-leading company through append, match, and update`, () => {
			const hostile = `${lead}CMD|'/C calc'!A0`;
			const appended = planRecordApplication({ ...BASE, company: hostile, role: "Engineer", trackerText: "" });
			assert.equal(appended.ok, true);
			if (!appended.ok) {
				assert.fail("expected ok plan");
			}
			const cells = appended.row.split(",");
			assert.equal(cells[1], `'${hostile}`);
			for (const cell of cells) {
				assert.ok(!/^[=+\-@]/.test(cell), `cell executes as a formula: ${cell}`);
			}

			const updated = planRecordApplication({
				...BASE,
				company: hostile,
				role: "Engineer",
				trackerText: appended.trackerText,
			});
			assert.equal(updated.ok, true);
			if (!updated.ok) {
				assert.fail("expected ok plan");
			}
			assert.equal(updated.action, "update");
			assert.equal(updated.rowIndex, 0);
			const updatedCells = updated.row.split(",");
			assert.equal(updatedCells[1], `'${hostile}`);
		});
	}
});

describe("tracker newline round trip", () => {
	it("stores a newline-bearing role flat and updates it on re-read", () => {
		const input = { ...BASE, role: "Senior\nML Engineer" };
		const appended = planRecordApplication({ ...input, trackerText: "" });
		assert.equal(appended.ok, true);
		if (!appended.ok) {
			assert.fail("expected ok plan");
		}
		assert.ok(appended.row.includes("Senior ML Engineer"));
		assert.equal(appended.trackerText.split("\n").length, 3);

		const updated = planRecordApplication({ ...input, trackerText: appended.trackerText });
		assert.equal(updated.ok, true);
		if (!updated.ok) {
			assert.fail("expected ok plan");
		}
		assert.equal(updated.action, "update");
		assert.equal(updated.rowIndex, 0);
		assert.equal(updated.trackerText.split("\n").length, 3);
	});
});

describe("tracker smarter matching", () => {
	const LTD_ROW =
		"2026-02-01,Acme Ltd,,Senior ML Engineer,,online,drafted,,70,,cv/old.tex,cover_letters/old.tex,https://example.com/jobs/1,2026-05-01";

	it("updates across a legal-suffix difference instead of appending", () => {
		const result = planRecordApplication({ ...BASE, trackerText: trackerWith(LTD_ROW) });
		assert.equal(result.ok, true);
		assert.equal(result.action, "update");
		assert.equal(result.rowIndex, 0);
	});

	it("keeps substring neighbors as separate applications", () => {
		const partners = LTD_ROW.replace("Acme Ltd", "Acme Partners");
		const result = planRecordApplication({ ...BASE, trackerText: trackerWith(partners) });
		assert.equal(result.ok, true);
		assert.equal(result.action, "append");
	});

	it("matches the posting URL first where held", () => {
		const rowA = LTD_ROW.replace("Acme Ltd", "Acme");
		const rowB = LTD_ROW.replace("https://example.com/jobs/1", "https://example.com/jobs/2");
		const result = planRecordApplication({
			...BASE,
			postingUrl: "https://example.com/jobs/2",
			trackerText: trackerWith(rowA, rowB),
		});
		assert.equal(result.ok, true);
		assert.equal(result.action, "update");
		assert.equal(result.rowIndex, 1);
	});

	it("falls back to normalized keys when the URL is new", () => {
		const result = planRecordApplication({
			...BASE,
			postingUrl: "https://example.com/jobs/9",
			trackerText: trackerWith(LTD_ROW),
		});
		assert.equal(result.ok, true);
		assert.equal(result.action, "update");
		assert.equal(result.rowIndex, 0);
	});
});

describe("tracker stale-write hash", () => {
	it("returns the SHA-1 of the exact input text", () => {
		const given = trackerWith(
			"2026-02-01,Acme,,Senior ML Engineer,,online,drafted,,70,,cv/a.tex,cover_letters/a.tex,,",
		);
		const result = planRecordApplication({ ...BASE, trackerText: given });
		assert.equal(result.ok, true);
		if (!result.ok) {
			assert.fail("expected ok plan");
		}
		assert.equal(result.trackerHash, createHash("sha1").update(given, "utf8").digest("hex"));
		assert.equal(result.trackerHash, trackerHashFor(given));
	});

	it("changes the hash when the input changes", () => {
		const first = planRecordApplication({ ...BASE, trackerText: "" });
		const second = planRecordApplication({ ...BASE, trackerText: trackerWith("2026-02-01,X,,Y,,online,applied,,1,,a,b,,") });
		assert.equal(first.ok, true);
		assert.equal(second.ok, true);
		if (!first.ok || !second.ok) {
			assert.fail("expected ok plans");
		}
		assert.notEqual(first.trackerHash, second.trackerHash);
	});
});

describe("tracker duplicate and slug safety", () => {
	it("names the open-match count instead of winning silently", () => {
		const open =
			"2026-02-01,Acme,,Senior ML Engineer,,online,drafted,,70,,cv/a.tex,cover_letters/a.tex,,";
		const result = planRecordApplication({ ...BASE, trackerText: trackerWith(open, open) });
		assert.equal(result.ok, true);
		if (!result.ok) {
			assert.fail("expected ok plan");
		}
		assert.equal(result.action, "update");
		assert.equal(result.rowIndex, 0);
		assert.equal(result.openMatchCount, 2);
		assert.ok((result.duplicateNote ?? "").includes("2"));
	});

	it("reports a single open match without a duplicate note", () => {
		const result = planRecordApplication({ ...BASE, trackerText: "" });
		assert.equal(result.ok, true);
		if (!result.ok) {
			assert.fail("expected ok plan");
		}
		assert.equal(result.action, "append");
		assert.equal(result.openMatchCount, 0);
		assert.equal(result.duplicateNote, null);
	});

	it("keeps posting-derived path segments to slug characters only", () => {
		const result = planRecordApplication({ ...BASE, company: "../evil", trackerText: "" });
		assert.equal(result.ok, true);
		if (!result.ok) {
			assert.fail("expected ok plan");
		}
		const slug = (result.archiveFile ?? "").replace("documents/applications/", "").replace("/job_posting.md", "");
		assert.ok(/^[a-z0-9][a-z0-9-]*_[a-z0-9][a-z0-9-]*$/.test(slug), `unsafe slug: ${slug}`);
		assert.ok(!slug.includes(".") && !slug.includes("/"));
		assert.ok(!(result.archiveFile ?? "").includes(".."));
	});
});
