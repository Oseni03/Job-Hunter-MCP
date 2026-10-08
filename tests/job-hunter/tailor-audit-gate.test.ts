import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	BUILDER_LEXICON,
	auditClaim,
	buildCoverLetter,
	buildTailoredCv,
	checkGateSummary,
	extractNumerals,
} from "@/lib/job-hunter/tailor.ts";
import { planInterviewPrep } from "@/lib/job-hunter/prep.ts";
import { planPortalFields } from "@/lib/job-hunter/fields.ts";
import { sectionHeadings } from "@/lib/job-hunter/document.ts";
import type { FetchLike } from "@/lib/job-hunter/fetch-posting.ts";

const PROFILE = {
	name: "Test Candidate",
	location: "Test City",
	preferences: { targetRoles: ["ML Engineer"] },
	skills: [{ name: "Python", category: "primary" as const }, { name: "SQL", category: "primary" as const }, { name: "Docker", category: "secondary" as const }],
	domains: [{ name: "fraud detection", category: "strong" as const }, { name: "payments", category: "adjacent" as const }],
	energizingTasks: ["model building"],
	drainingTasks: ["manual reporting"],
	languages: [{ language: "English", level: "C1" }],
	workCountry: "Testland",
	permitClasses: [],
} as never;

const POSTING = [
	"Senior ML Engineer at Acme.",
	"Requirements: Python, SQL.",
	"Nice to have: Docker.",
	"Domain: fraud detection.",
].join("\n");

const PASS_SUMMARY = {
	verdict: "Good Fit",
	eligibility: { verdict: "PASS" },
	languageGate: { verdict: "PASS" },
};

const FAIL_SUMMARY = {
	verdict: null,
	eligibility: { verdict: "FAIL" },
	languageGate: { verdict: "PASS" },
};

/** Canned model output for the CV builder; stubbed Groq transport below. */
const RENDER = {
	name: "Test Candidate",
	statement: "Test Candidate brings Python and SQL to ML Engineer work in fraud detection.",
	competencies: [{ label: "Python", body: "Direct match to a stated requirement." }],
	headings: sectionHeadings("en"),
};

function stubFetch(data: unknown): FetchLike {
	return async () => ({
		status: 200,
		body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(data) } }] }),
	});
}

const LLM = { apiKey: "test-key", fetchImpl: stubFetch(RENDER) };

describe("auditClaim numerals", () => {
	it("flags numerals missing from the union", () => {
		const audit = auditClaim("Improved latency by 30% with Python.", ["Python"]);
		assert.equal(audit.grounded, false);
		assert.ok(audit.missing.some((word) => word.includes("30")), `missing numerals, got ${audit.missing}`);
	});

	it("passes numerals present in the union", () => {
		const audit = auditClaim("Improved latency by 30% with Python.", [
			"Python",
			"improved latency by 30% with python",
		]);
		assert.equal(audit.grounded, true);
	});

	it("extracts numerals without trailing punctuation", () => {
		assert.deepEqual(extractNumerals("reference ACME-123."), ["123"]);
		assert.deepEqual(extractNumerals("15 March 2026"), ["15", "2026"]);
	});
});

describe("cover bridging slots", () => {
	it("allows the gap name only inside the bridge sentence", () => {
		const posting = ["ML Engineer at Acme.", "Requirements: Python, Kubernetes."].join("\n");
		const result = buildCoverLetter({
			postingText: posting,
			company: "Acme",
			role: "ML Engineer",
			profile: PROFILE,
			evaluation: PASS_SUMMARY,
		});
		assert.equal(result.ok, true);
		if (!result.ok) return;
		const gap = result.coverage.find((item) => item.status === "gap");
		assert.ok(gap, "expected a gap requirement");
		const gapDrift = result.warnings.draftDrift.filter((entry) =>
			entry.toLowerCase().includes(gap.requirement.toLowerCase().split(/\s+/)[0]),
		);
		assert.deepEqual(gapDrift, [], `gap name must not drift outside the bridge slot, got ${gapDrift}`);
	});
});

describe("gate input", () => {
	it("refuses the CV on a FAIL summary", async () => {
		const result = await buildTailoredCv({
			postingText: POSTING,
			company: "Acme",
			role: "ML Engineer",
			profile: PROFILE,
			evaluation: FAIL_SUMMARY,
		});
		assert.equal(result.ok, false);
		if (result.ok) return;
		assert.match(result.error, /^GATE_REFUSED/);
	});

	it("warns loudly on the CV when the summary is missing", async () => {
		const result = await buildTailoredCv(
			{
				postingText: POSTING,
				company: "Acme",
				role: "ML Engineer",
				profile: PROFILE,
			},
			LLM,
		);
		assert.equal(result.ok, true);
		if (!result.ok) return;
		assert.ok(result.warnings.evaluationNote?.includes("blind"), "evaluation note present");
	});

	it("refuses the letter on a FAIL summary and warns when missing", () => {
		const refused = buildCoverLetter({
			postingText: POSTING,
			company: "Acme",
			role: "ML Engineer",
			profile: PROFILE,
			evaluation: FAIL_SUMMARY,
		});
		assert.equal(refused.ok, false);
		const blind = buildCoverLetter({
			postingText: POSTING,
			company: "Acme",
			role: "ML Engineer",
			profile: PROFILE,
		});
		assert.equal(blind.ok, true);
		if (!blind.ok) return;
		assert.ok(blind.warnings.evaluationNote?.includes("blind"));
	});

	it("refuses prep on a FAIL summary and warns when missing", () => {
		const refused = planInterviewPrep({
			company: "Acme",
			role: "ML Engineer",
			postingText: POSTING,
			profile: PROFILE,
			evaluation: FAIL_SUMMARY,
		});
		assert.deepEqual(refused.questions, []);
		assert.ok(refused.warnings.some((warning) => warning.startsWith("GATE_REFUSED")));
		const blind = planInterviewPrep({ company: "Acme", role: "ML Engineer", profile: PROFILE });
		assert.ok(blind.fallbackNotes.some((note) => note.includes("blind")));
	});

	it("checkGateSummary passes a clean summary silently", () => {
		assert.deepEqual(checkGateSummary(PASS_SUMMARY), {});
	});
});

describe("visible cuts", () => {
	it("reports no dropped bullets; the model owns selection", async () => {
		const result = await buildTailoredCv(
			{
				postingText: POSTING,
				company: "Acme",
				role: "ML Engineer",
				profile: PROFILE,
				evaluation: PASS_SUMMARY,
			},
			LLM,
		);
		assert.equal(result.ok, true);
		if (!result.ok) return;
		assert.deepEqual(result.droppedBullets, []);
	});
});

describe("fixed document renderers", () => {
	it("uses fixed Puppeteer templates for both documents", async () => {
		const cv = await buildTailoredCv(
			{
				postingText: POSTING,
				company: "Acme",
				role: "ML Engineer",
				profile: PROFILE,
				evaluation: PASS_SUMMARY,
			},
			LLM,
		);
		assert.equal(cv.ok, true);
		if (!cv.ok) return;
		assert.equal(cv.template, "modern-fixed-v1");
		const letter = buildCoverLetter({
			postingText: POSTING,
			company: "Acme",
			role: "ML Engineer",
			profile: PROFILE,
			evaluation: PASS_SUMMARY,
		});
		assert.equal(letter.ok, true);
		if (!letter.ok) return;
		assert.equal(letter.template, "letter-modern-fixed-v1");
	});

	it("escapes hostile HTML input without executable markup", () => {
		const result = buildCoverLetter({
			postingText: POSTING,
			company: "Acme \\directlua {x}",
			role: "Engineer % lead",
			profile: PROFILE,
			evaluation: PASS_SUMMARY,
		});
		assert.equal(result.ok, true);
		if (!result.ok) return;
		assert.ok(result.html.includes("Acme \\directlua {x}"));
		assert.ok(!result.html.includes("<script"));
	});
});

describe("language fit", () => {
	it("warns on the CV when posting and CV languages differ", async () => {
		const result = await buildTailoredCv(
			{
				postingText: POSTING,
				company: "Acme",
				role: "ML Engineer",
				profile: PROFILE,
				cvLanguage: "en",
				postingLanguage: "de",
				evaluation: PASS_SUMMARY,
			},
			LLM,
		);
		assert.equal(result.ok, true);
		if (!result.ok) return;
		assert.ok(result.warnings.languageNote?.includes("de"), "mismatch named");
		assert.ok(result.warnings.languageNote?.includes("English-only"), "limitation stated");
	});

	it("warns on the letter for non-English postings", () => {
		const result = buildCoverLetter({
			postingText: POSTING,
			company: "Acme",
			role: "ML Engineer",
			profile: PROFILE,
			postingLanguage: "de",
			evaluation: PASS_SUMMARY,
		});
		assert.equal(result.ok, true);
		if (!result.ok) return;
		assert.ok(result.warnings.languageNote?.includes("English-only"));
	});

	it("warns in draft-application-answers for non-English forms", () => {
		const plan = planPortalFields({ profile: PROFILE, postingLanguage: "de" });
		assert.ok(plan.warnings.some((warning) => warning.includes("English-only")));
	});
});

describe("BUILDER_LEXICON credential test", () => {
	it("holds only meta-commentary, never credential or skill nouns", () => {
		const credentialNouns = [
			"python",
			"java",
			"javascript",
			"typescript",
			"kubernetes",
			"docker",
			"sql",
			"postgres",
			"fraud",
			"detection",
			"engineer",
			"engineering",
			"model",
			"models",
			"pipeline",
			"dataset",
			"algorithm",
			"software",
			"machine",
			"learning",
			"degree",
			"phd",
			"master",
			"bachelor",
			"certified",
			"clearance",
		];
		for (const noun of credentialNouns) {
			assert.ok(!BUILDER_LEXICON.includes(noun), `lexicon must not smuggle credential noun '${noun}'`);
		}
		for (const word of BUILDER_LEXICON) {
			assert.equal(word, word.toLowerCase(), `lexicon word '${word}' stays lowercase meta-commentary`);
			assert.ok(!credentialNouns.includes(word), `lexicon word '${word}' is meta-commentary`);
		}
	});
});
