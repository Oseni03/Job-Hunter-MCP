import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { documentSignals, latexSafety, layoutSignals, pageBudget } from "@/lib/job-hunter/verify.ts";
import type { BBoxPage } from "@/lib/job-hunter/verify.ts";

const CLEAN_CV = [
	"\\section{Professional Experience}",
	"\\cventry{2020-2024}{ML Engineer}{Acme}{Berlin}{}{Built a fraud model.}",
	"\\begin{itemize}",
	"\\item Shipped a Python pipeline.",
	"\\end{itemize}",
	"\\section{Education}",
	"\\section{Languages}",
	"\\section{Publications}",
	"\\section{Honors and Awards}",
	"\\section{References}",
	"More references are available upon request.",
	"\\section{Core Competencies}",
].join("\n");

function line(top: number, text: string, height = 12, left = 72): BBoxPage["lines"][number] {
	return { top, bottom: top + height, left, height, text };
}

function page(height: number, lines: BBoxPage["lines"]): BBoxPage {
	return { height, lines };
}

describe("pageBudget", () => {
	it("declares the CV two-page budget with content-shaping notes, never geometry squeezing", () => {
		const budget = pageBudget("cv", CLEAN_CV);
		assert.equal(budget.pageLimit, 2);
		assert.ok(budget.wordCount > 0, "words measured");
		assert.ok(
			budget.shapingNotes.every((note) => !/margin|fontsize|geometry|scale|paper/i.test(note)),
			"shaping is content cuts, not geometry squeezing",
		);
	});

	it("flags an over-long CV with a cutting order", () => {
		const long = `${CLEAN_CV}\n${"Filler sentence about work. ".repeat(400)}`;
		const budget = pageBudget("cv", long);
		assert.equal(budget.overBudget, true);
		assert.ok(budget.shapingNotes.length > 0, "cutting guidance reported");
	});

	it("enforces the cover letter one-page word budget", () => {
		const short = "I built models. ".repeat(20);
		const budget = pageBudget("letter", short);
		assert.equal(budget.pageLimit, 1);
		assert.equal(budget.wordBudgetMin, 250);
		assert.equal(budget.wordBudgetMax, 300);
		assert.equal(budget.overBudget, false);
		const long = "I built models for fraud detection work. ".repeat(60);
		assert.equal(pageBudget("letter", long).overBudget, true);
	});
});

describe("latexSafety", () => {
	it("passes clean TeX with translated headings present", () => {
		const safety = latexSafety(CLEAN_CV, { language: "en" });
		assert.equal(safety.passed, true);
		assert.ok(safety.checks.every((check) => check.pass), "every signal green");
	});

	it("flags unbraced itemize brackets", () => {
		const safety = latexSafety("\\begin{itemize}\n\\item [2024] Shipped X.\n\\end{itemize}");
		assert.equal(safety.passed, false);
		assert.ok(safety.checks.some((check) => check.name === "bracket-bracing" && !check.pass));
	});

	it("flags non-ASCII date ranges in cventry arguments", () => {
		const safety = latexSafety("\\cventry{2020--2024}{ML Engineer}{Acme}{Berlin}{}{Did work.}");
		assert.equal(safety.passed, false);
		assert.ok(safety.checks.some((check) => check.name === "ascii-date-ranges" && !check.pass));
	});

	it("flags missing translated headings", () => {
		const safety = latexSafety("Nada que ver.", { language: "es" });
		assert.equal(safety.passed, false);
		const headings = safety.checks.find((check) => check.name === "translated-headings");
		assert.ok(headings && !headings.pass && headings.detail.includes("Experiencia Profesional"));
	});

	it("surfaces writing bans as a safety signal", () => {
		const safety = latexSafety("I am passionate about ML \u2014 truly.");
		assert.ok(safety.checks.some((check) => check.name === "writing-bans" && !check.pass));
	});
});

describe("layoutSignals", () => {
	it("reports degraded mode when bounding-box extraction is unavailable", () => {
		const signals = layoutSignals();
		assert.equal(signals.degraded, true);
		assert.ok((signals.note ?? "").includes("verify_layout.py"), "host script named");
		assert.deepEqual(signals.problems, [], "no verdict invented without geometry");
	});

	it("mirrors the hole check from verify_layout.py", () => {
		const pages = [page(800, [line(72, "Top"), line(500, "Bottom")])];
		const signals = layoutSignals(pages);
		assert.equal(signals.degraded, false);
		assert.ok(signals.problems.some((problem) => problem.includes("hole")), "gap over 100pt flagged");
	});

	it("mirrors early-ending, thin-final, and footer checks", () => {
		const early = [
			page(800, [line(72, "Top"), line(200, "Ends early")]),
			page(800, [line(72, "Next"), line(700, "Bottom")]),
		];
		assert.ok(
			layoutSignals(early).problems.some((problem) => problem.includes("early")),
			"page ending early flagged",
		);
		const thin = [page(800, [line(72, "Full")]), page(800, [line(72, "Almost empty")])];
		assert.ok(
			layoutSignals(thin).problems.some((problem) => problem.includes("empty")),
			"thin final page flagged",
		);
		const footer = [page(800, [line(72, "Top"), line(715, "Footer crowd"), line(730, "More footer")])];
		assert.ok(
			layoutSignals(footer).problems.some((problem) => problem.includes("margin band")),
			"footer collision flagged",
		);
	});

	it("mirrors the orphaned-header check", () => {
		const pages = [
			page(800, [line(72, "Body"), line(170, "More body"), line(260, "Section Heading", 20)]),
			page(800, [line(72, "Continued content")]),
		];
		assert.ok(
			layoutSignals(pages).problems.some((problem) => problem.includes("heading")),
			"page ending on a heading flagged",
		);
	});

	it("stays clean on compact pages", () => {
		const pages = [page(800, [line(72, "Top"), line(170, "Middle"), line(260, "Bottom")])];
		assert.deepEqual(layoutSignals(pages).problems, []);
	});
});

describe("documentSignals", () => {
	it("bundles page, safety, and degraded-layout signals for a document", () => {
		const signals = documentSignals("cv", CLEAN_CV, { language: "en" });
		assert.equal(signals.pageBudget.pageLimit, 2);
		assert.equal(signals.latexSafety.passed, true);
		assert.equal(signals.layout.degraded, true);
	});
});
