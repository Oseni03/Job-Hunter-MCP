import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { TRACKER_HEADER, planRecordApplication } from "@/lib/record.ts";

const BASE = {
	company: "Acme",
	role: "Senior ML Engineer",
	cvFile: "cv/main_acme_senior-ml-engineer.tex",
	coverLetterFile: "cover_letters/cover_acme_senior-ml-engineer.tex",
	fitScore: 84,
	today: "2026-03-01",
};

describe("planRecordApplication header", () => {
	it("creates the tracker with the standard header ending in deadline when missing", () => {
		const result = planRecordApplication({ ...BASE, trackerText: "" });
		assert.equal(result.ok, true);
		assert.equal(result.action, "append");
		assert.ok(result.trackerText.startsWith(`${TRACKER_HEADER}\n`));
		assert.equal(TRACKER_HEADER.split(",").at(-1), "deadline");
	});

	it("appends the deadline column to a legacy header without touching data rows", () => {
		const legacyRow = "2026-02-01,Acme,tech,Analyst,specialist,online,applied,,70,,cv.tex,letter.tex,https://example.com/jobs/1";
		const result = planRecordApplication({
			...BASE,
			trackerText: `${TRACKER_HEADER.replace(",deadline", "")}\n${legacyRow}\n`,
		});
		assert.equal(result.ok, true);
		assert.equal(result.headerUpgraded, true);
		const lines = result.trackerText.split("\n");
		assert.equal(lines[0], TRACKER_HEADER);
		assert.equal(lines[1], legacyRow);
	});
});

describe("planRecordApplication new row", () => {
	it("carries today, drafted, bare score, both paths, url, channel, and deadline", () => {
		const result = planRecordApplication({
			...BASE,
			postingUrl: "https://example.com/jobs/1",
			deadline: "2026-04-01",
			trackerText: "",
		});
		assert.equal(result.ok, true);
		assert.equal(
			result.row,
			"2026-03-01,Acme,,Senior ML Engineer,,online,drafted,,84,,cv/main_acme_senior-ml-engineer.tex,cover_letters/cover_acme_senior-ml-engineer.tex,https://example.com/jobs/1,2026-04-01",
		);
	});

	it("leaves source empty for pasted text and channel empty with no origin", () => {
		const result = planRecordApplication({ ...BASE, trackerText: "" });
		assert.equal(result.ok, true);
		const fields = result.row.split(",");
		assert.equal(fields[5], "");
		assert.equal(fields[12], "");
		assert.equal(fields[13], "");
	});

	it("prefers an explicit channel, then portal, over the online default", () => {
		const explicit = planRecordApplication({
			...BASE,
			postingUrl: "https://example.com/jobs/1",
			channel: "referral",
			portal: "linkedin",
			trackerText: "",
		});
		assert.equal(explicit.ok, true);
		assert.equal(explicit.row.split(",")[5], "referral");

		const portal = planRecordApplication({
			...BASE,
			postingUrl: "https://example.com/jobs/1",
			portal: "linkedin",
			trackerText: "",
		});
		assert.equal(portal.ok, true);
		assert.equal(portal.row.split(",")[5], "linkedin");
	});

	it("keeps a YYYY-MM-DD deadline and never guesses one from free text", () => {
		const kept = planRecordApplication({ ...BASE, deadline: "2026-04-01", trackerText: "" });
		assert.equal(kept.ok, true);
		assert.equal(kept.row.split(",")[13], "2026-04-01");

		for (const deadline of ["15 March 2026", "ASAP", "2026-13-45", null, undefined]) {
			const result = planRecordApplication({ ...BASE, deadline, trackerText: "" });
			assert.equal(result.ok, true);
			assert.equal(result.row.split(",")[13], "");
		}
	});

	it("leaves fit_rating empty when no score is given", () => {
		const result = planRecordApplication({ ...BASE, fitScore: null, trackerText: "" });
		assert.equal(result.ok, true);
		assert.equal(result.row.split(",")[8], "");
	});

	it("quotes new-row fields carrying commas or quotes", () => {
		const result = planRecordApplication({
			...BASE,
			company: "Acme, Inc",
			role: 'Senior "ML" Engineer',
			trackerText: "",
		});
		assert.equal(result.ok, true);
		assert.ok(result.row.includes('"Acme, Inc"'));
		assert.ok(result.row.includes('"Senior ""ML"" Engineer"'));
	});

	it("preserves blank lines and CRLF endings in untouched content", () => {
		const trackerText = `${TRACKER_HEADER}\r\n\r\n${OTHER_ROW}\r\n`;
		const result = planRecordApplication({ ...BASE, trackerText });
		assert.equal(result.ok, true);
		assert.equal(
			result.trackerText,
			`${TRACKER_HEADER}\r\n\r\n${OTHER_ROW}\r\n${result.row}\r\n`,
		);
	});
});

function trackerWith(...rows: string[]): string {
	return `${TRACKER_HEADER}\n${rows.join("\n")}\n`;
}

function rowWith(overrides: Record<number, string>): string {
	const fields = OPEN_ROW.split(",");
	for (const [index, value] of Object.entries(overrides)) {
		fields[Number(index)] = value;
	}
	return fields.join(",");
}

const OPEN_ROW =
	"2026-02-01,Acme,,Senior ML Engineer,,online,drafted,,70,,cv/old.tex,cover_letters/old.tex,https://example.com/jobs/1,2026-05-01";
const OTHER_ROW =
	"2026-02-02,Beta,,Designer,,online,applied,,60,,cv/b.tex,cover_letters/b.tex,https://example.com/jobs/2,";

describe("planRecordApplication match", () => {
	it("updates the open row on a case-insensitive company+role match", () => {
		const lower = OPEN_ROW.replace("Acme", "acme").replace("Senior ML Engineer", "senior ml engineer");
		const result = planRecordApplication({ ...BASE, trackerText: trackerWith(OTHER_ROW, lower) });
		assert.equal(result.ok, true);
		assert.equal(result.action, "update");
		assert.equal(result.rowIndex, 1);
		assert.equal(result.appendedAlongsideFinal, false);
		assert.ok(result.trackerText.includes(`${OTHER_ROW}\n`));
	});

	it("appends when nothing matches", () => {
		const result = planRecordApplication({ ...BASE, trackerText: trackerWith(OTHER_ROW) });
		assert.equal(result.ok, true);
		assert.equal(result.action, "append");
		assert.equal(result.rowIndex, null);
		assert.equal(result.appendedAlongsideFinal, false);
		assert.ok(result.trackerText.includes(`${OTHER_ROW}\n`));
	});

	it("appends alongside final rows and says so", () => {
		const rejected = OPEN_ROW.replace(",drafted,", ",rejected,");
		const noResponse = OPEN_ROW.replace(",drafted,", ",No Response,");
		const declined = OPEN_ROW.replace(",drafted,", ",offer declined,");
		const result = planRecordApplication({
			...BASE,
			trackerText: trackerWith(rejected, noResponse, declined),
		});
		assert.equal(result.ok, true);
		assert.equal(result.action, "append");
		assert.equal(result.appendedAlongsideFinal, true);
	});

	it("updates the open row when final and open rows coexist", () => {
		const rejected = OPEN_ROW.replace(",drafted,", ",rejected,");
		const result = planRecordApplication({ ...BASE, trackerText: trackerWith(rejected, OPEN_ROW) });
		assert.equal(result.ok, true);
		assert.equal(result.action, "update");
		assert.equal(result.rowIndex, 1);
		assert.equal(result.appendedAlongsideFinal, false);
	});

	it("treats interview, applied, and offer as open and withdrawn, hired as final", () => {
		for (const status of ["applied", "Interview", "offer"]) {
			const row = OPEN_ROW.replace(",drafted,", `,${status},`);
			const result = planRecordApplication({ ...BASE, trackerText: trackerWith(row) });
			assert.equal(result.ok, true);
			if (!result.ok) {
				assert.fail("expected ok plan");
			}
			assert.equal(result.action, "update", status);
		}
		for (const status of ["withdrawn", "Hired", "accepted"]) {
			const row = OPEN_ROW.replace(",drafted,", `,${status},`);
			const result = planRecordApplication({ ...BASE, trackerText: trackerWith(row) });
			assert.equal(result.ok, true);
			if (!result.ok) {
				assert.fail("expected ok plan");
			}
			assert.equal(result.action, "append", status);
			assert.equal(result.appendedAlongsideFinal, true);
		}
	});
});

describe("planRecordApplication update", () => {
	const refresh = {
		cvFile: "cv/new.tex",
		coverLetterFile: "cover_letters/new.tex",
		postingUrl: "https://example.com/jobs/9",
		deadline: "2026-06-01",
	};

	it("refreshes files, score, source, and deadline and marks redrafted", () => {
		const result = planRecordApplication({
			...BASE,
			...refresh,
			trackerText: trackerWith(OTHER_ROW, OPEN_ROW),
		});
		assert.equal(result.ok, true);
		assert.equal(result.action, "update");
		assert.equal(result.rowIndex, 1);
		assert.equal(
			result.row,
			"2026-03-01,Acme,,Senior ML Engineer,,online,drafted,,84,redrafted,cv/new.tex,cover_letters/new.tex,https://example.com/jobs/9,2026-06-01",
		);
		const lines = result.trackerText.split("\n");
		assert.equal(lines[1], OTHER_ROW);
		assert.equal(lines[2], result.row);
	});

	it("keeps the stored deadline when the run extracted none", () => {
		const result = planRecordApplication({ ...BASE, ...refresh, deadline: undefined, trackerText: trackerWith(OPEN_ROW) });
		assert.equal(result.ok, true);
		assert.ok(result.row.endsWith(",2026-05-01"));
	});

	it("leaves status alone and moves date forward only while still drafted", () => {
		const applied = rowWith({ 6: "applied", 9: "called" });
		const result = planRecordApplication({ ...BASE, ...refresh, trackerText: trackerWith(applied) });
		assert.equal(result.ok, true);
		assert.equal(result.action, "update");
		const fields = result.row.split(",");
		assert.equal(fields[0], "2026-02-01");
		assert.equal(fields[6], "applied");
		assert.equal(fields[8], "84");
		assert.equal(fields[9], "called; redrafted");
	});

	it("quotes notes carrying commas on rebuild", () => {
		const noted = rowWith({ 9: '"met at fair, Paris"' });
		const result = planRecordApplication({ ...BASE, ...refresh, trackerText: trackerWith(noted) });
		assert.equal(result.ok, true);
		assert.ok(result.row.includes('"met at fair, Paris; redrafted"'));
	});
});

describe("planRecordApplication archive", () => {
	const postingText = "Senior ML Engineer at Acme.\nRequirements: Python.";

	it("archives the held posting text verbatim under the application folder", () => {
		const result = planRecordApplication({
			...BASE,
			postingText,
			postingUrl: "https://example.com/jobs/1",
			trackerText: "",
		});
		assert.equal(result.ok, true);
		assert.equal(result.archiveFile, "documents/applications/acme_senior-ml-engineer/job_posting.md");
		assert.equal(result.archiveText, postingText);
		assert.equal(result.archiveNote, null);
	});

	it("writes nothing with an explicit report when the text is no longer held", () => {
		const result = planRecordApplication({ ...BASE, trackerText: "" });
		assert.equal(result.ok, true);
		assert.equal(result.archiveFile, "documents/applications/acme_senior-ml-engineer/job_posting.md");
		assert.equal(result.archiveText, null);
		assert.ok((result.archiveNote ?? "").length > 0);
	});
});
