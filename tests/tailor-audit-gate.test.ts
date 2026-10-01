import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	BUILDER_LEXICON,
	auditClaim,
	buildCoverLetter,
	buildTailoredCv,
	checkGateSummary,
	extractNumerals,
} from "@/lib/tailor.ts";
import { planInterviewPrep } from "@/lib/prep.ts";
import { planPortalFields } from "@/lib/fields.ts";
import { renderTailoredCvMarkdown } from "@/lib/mcp/render.ts";

const PROFILE = {
	name: "Test Candidate",
	location: "Test City",
	primarySkills: ["Python", "SQL"],
	secondarySkills: ["Docker"],
	strongDomains: ["fraud detection"],
	adjacentDomains: ["payments"],
	careerGoals: ["ML Engineer"],
	energizingTasks: ["model building"],
	drainingTasks: ["manual reporting"],
	languages: [{ language: "English", level: "C1" }],
	constraints: "remote",
	workCountry: "Testland",
	citizenships: ["Testland"],
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
	it("refuses the CV on a FAIL summary", () => {
		const result = buildTailoredCv({
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

	it("warns loudly on the CV when the summary is missing", () => {
		const result = buildTailoredCv({
			postingText: POSTING,
			company: "Acme",
			role: "ML Engineer",
			profile: PROFILE,
		});
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
	it("returns dropped bullets with their role and renders them", () => {
		const bullets = [
			"Python pipeline cut costs",
			"SQL model improved recall",
			"Docker deploy shortened cycle",
			"Python review reduced risk",
			"SQL dashboard saved hours",
			"Extra fraud detection analysis",
			"Extra payments reconciliation",
		];
		const result = buildTailoredCv({
			postingText: POSTING,
			company: "Acme",
			role: "ML Engineer",
			profile: PROFILE,
			experience: [{ title: "Engineer", company: "Acme", period: "2020-2024", bullets }],
			evaluation: PASS_SUMMARY,
		});
		assert.equal(result.ok, true);
		if (!result.ok) return;
		assert.equal(result.droppedBullets.length, 2);
		for (const dropped of result.droppedBullets) {
			assert.ok(dropped.role.includes("Engineer"), `role carried, got ${dropped.role}`);
			assert.ok(dropped.bullet.length > 0);
		}
		const markdown = renderTailoredCvMarkdown({
			...result,
			signals: {
				pageBudget: {
					kind: "cv",
					pageLimit: 2,
					wordCount: 10,
					wordBudgetMin: null,
					wordBudgetMax: null,
					overBudget: false,
					shapingNotes: [],
				},
				latexSafety: { passed: true, checks: [] },
				layout: { degraded: false, note: null, problems: [] },
			},
		});
		assert.ok(markdown.includes("Dropped bullets"), "renderer surfaces the cuts");
	});
});

describe("compile-command hardening", () => {
	it("ships --no-shell-escape on the stock commands", () => {
		const cv = buildTailoredCv({
			postingText: POSTING,
			company: "Acme",
			role: "ML Engineer",
			profile: PROFILE,
			evaluation: PASS_SUMMARY,
		});
		assert.equal(cv.ok, true);
		if (!cv.ok) return;
		assert.ok(cv.compileCommand.includes("--no-shell-escape"), `CV hardened, got ${cv.compileCommand}`);
		const letter = buildCoverLetter({
			postingText: POSTING,
			company: "Acme",
			role: "ML Engineer",
			profile: PROFILE,
			evaluation: PASS_SUMMARY,
		});
		assert.equal(letter.ok, true);
		if (!letter.ok) return;
		assert.ok(letter.compileCommand.includes("--no-shell-escape"), `letter hardened, got ${letter.compileCommand}`);
	});

	it("keeps custom commands caller-owned with a warning and escapes hostile posting text", () => {
		const result = buildCoverLetter({
			postingText: POSTING,
			company: "Acme \\directlua {x}",
			role: "Engineer % lead",
			profile: PROFILE,
			evaluation: PASS_SUMMARY,
			template: { name: "custom", compileCommand: "cd cover_letters && xelatex cover_<file>.tex" },
		});
		assert.equal(result.ok, true);
		if (!result.ok) return;
		assert.ok(!result.tex.includes("\\directlua"), "hostile command escaped");
		assert.ok(result.tex.includes("\\textbackslash{}directlua"), "backslash escaped");
		assert.ok(result.tex.includes("\\%"), "percent escaped");
		assert.ok(
			result.warnings.templateNote?.includes("--no-shell-escape"),
			"custom command gets a shell-escape warning",
		);
	});
});

describe("language fit", () => {
	it("warns on the CV when posting and CV languages differ", () => {
		const result = buildTailoredCv({
			postingText: POSTING,
			company: "Acme",
			role: "ML Engineer",
			profile: PROFILE,
			cvLanguage: "en",
			postingLanguage: "de",
			evaluation: PASS_SUMMARY,
		});
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

	it("warns in portal-fields for non-English forms", () => {
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
