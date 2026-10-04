import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	extractTextLayer,
	findNonAsciiDateRanges,
	normalizeText,
	parseArgs,
	parsePageCount,
	verifyPdf,
} from "@/host/job-hunter/workflow/verify-pdf.ts";

test("normalizeText folds typographic punctuation, NFC, and whitespace for comparison", () => {
	assert.equal(normalizeText("Master’s degree"), "Master's degree");
	assert.equal(normalizeText("2016–2024"), "2016-2024");
	assert.equal(normalizeText("a  b"), "a b");
	assert.equal(normalizeText("école"), "école");
	assert.equal(normalizeText("  spaced\tout\n"), "spaced out");
});

test("findNonAsciiDateRanges flags years on Unicode dashes, nothing else", () => {
	const hits = findNonAsciiDateRanges("Experience 2016–2024 at Acme");
	assert.equal(hits.length, 1);
	assert.equal(hits[0]?.dash, "–");
	assert.equal(hits[0]?.codePoint, "U+2013");
	assert.deepEqual(findNonAsciiDateRanges("Experience 2016-2024 at Acme"), []);
	assert.deepEqual(findNonAsciiDateRanges("Budget EUR 600k–1M approved"), []);
	assert.deepEqual(findNonAsciiDateRanges("Year 2024\n– bullet item"), []);
	assert.equal(findNonAsciiDateRanges("Mar 2016 – Jul 2016").length, 1);
});

test("parsePageCount reads pdfinfo output or throws", () => {
	assert.equal(parsePageCount("Title: x\nPages:           2\n"), 2);
	assert.throws(() => parsePageCount("no pages here"), /page count/);
});

function stubBins(dir: string, text: string, info = "Pages: 2\n"): { text: string[]; info: string[] } {
	const textStub = join(dir, "stub-text.mjs");
	const infoStub = join(dir, "stub-info.mjs");
	writeFileSync(textStub, `process.stdout.write(${JSON.stringify(text)});`, "utf8");
	writeFileSync(infoStub, `process.stdout.write(${JSON.stringify(info)});`, "utf8");
	return { text: [process.execPath, textStub], info: [process.execPath, infoStub] };
}

test("extractTextLayer drives the configured binaries", () => {
	const dir = mkdtempSync(join(tmpdir(), "verify-pdf-"));
	const bins = stubBins(dir, "Hello\n");
	assert.deepEqual(extractTextLayer("whatever.pdf", bins), { text: "Hello\n", pages: 2 });
});

test("verifyPdf checks pages, contains (folded), dump, and ascii-dates", () => {
	const dir = mkdtempSync(join(tmpdir(), "verify-pdf-"));
	const pdf = join(dir, "cv.pdf");
	writeFileSync(pdf, "%PDF", "utf8");
	const bins = stubBins(dir, "Ada Lovelace\nMaster’s 2016–2024\n");
	const ok = verifyPdf(pdf, { minChars: 1, requiredText: ["Master's"], asciiDates: false }, bins);
	assert.equal(ok.pages, 2);
	assert.throws(
		() => verifyPdf(pdf, { minChars: 1, requiredText: [], expectedPages: 3, asciiDates: false }, bins),
		(error: unknown) => (error as { code?: string }).code === "page-mismatch",
	);
	assert.throws(
		() => verifyPdf(pdf, { minChars: 1, requiredText: ["Kubernetes"], asciiDates: false }, bins),
		(error: unknown) => (error as { code?: string }).code === "missing-text",
	);
	assert.throws(
		() => verifyPdf(pdf, { minChars: 1, requiredText: [], asciiDates: true }, bins),
		(error: unknown) => (error as { code?: string }).code === "non-ascii-dates",
	);
	const dump = join(dir, "out", "cv.txt");
	verifyPdf(pdf, { minChars: 1, requiredText: [], dumpText: dump, asciiDates: false }, bins);
	assert.ok(dump.includes("cv.txt"));
});

test("verifyPdf fails cleanly on missing files and missing binaries", () => {
	assert.throws(() => verifyPdf(join(tmpdir(), "no-such.pdf"), { minChars: 1, requiredText: [], asciiDates: false }), /does not exist/);
	const dir = mkdtempSync(join(tmpdir(), "verify-pdf-"));
	const pdf = join(dir, "cv.pdf");
	writeFileSync(pdf, "%PDF", "utf8");
	assert.throws(
		() => verifyPdf(pdf, { minChars: 1, requiredText: [], asciiDates: false }, { text: ["no-such-binary-xyz"], info: ["no-such-binary-xyz"] }),
		(error: unknown) => (error as { code?: string }).code === "missing-poppler",
	);
});

test("parseArgs defaults and validates", () => {
	const parsed = parseArgs(["cv.pdf", "--contains", "a", "--contains", "b", "--ascii-dates"]);
	assert.equal(parsed.pdf, "cv.pdf");
	assert.deepEqual(parsed.options.requiredText, ["a", "b"]);
	assert.equal(parsed.options.asciiDates, true);
	assert.equal(parsed.options.minChars, 1);
	assert.throws(() => parseArgs([]), /Give a PDF/);
	assert.throws(() => parseArgs(["a.pdf", "--pages", "0"]), /positive integer/);
	assert.throws(() => parseArgs(["a.pdf", "--pages", "x"]), /positive integer/);
	assert.throws(() => parseArgs(["a.pdf", "b.pdf"]), /Unexpected argument/);
	assert.throws(() => parseArgs(["a.pdf", "--wat"]), /Unexpected argument/);
	assert.ok(parseArgs(["a.pdf", "--min-chars", "0"]) instanceof Object);
});
