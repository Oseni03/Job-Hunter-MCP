#!/usr/bin/env node
/**
 * Verify that a generated PDF has the expected pages and extractable text.
 * Ported from tools/verify_pdf.py (same flags and checks). One deliberate
 * difference: extraction is Poppler-only (pdftotext/pdfinfo must be on PATH;
 * macOS: brew install poppler, Debian/Ubuntu: apt install poppler-utils,
 * Windows: choco install poppler). The Python tried pypdf first, but this
 * repo carries no PDF library and the Poppler path was always the fallback
 * the skill docs told users to install anyway.
 *
 *   node host/job-hunter/workflow/verify-pdf.ts cv.pdf [--pages 2] [--min-chars 100]
 *     [--contains "Master's degree"...] [--dump-text cv.txt] [--ascii-dates]
 *
 * `--contains` compares after folding (whitespace, NFC, LaTeX's typographic
 * substitutions) on both sides. `--ascii-dates` deliberately does NOT fold:
 * it scans the raw layer for a year joined to a Unicode dash — the en-dash
 * LaTeX makes from `--`, which an ATS date parser drops.
 */
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export class CliError extends Error {
	readonly code: string;

	constructor(code: string, message: string) {
		super(message);
		this.name = "CliError";
		this.code = code;
	}
}

/** Typographic substitutions the templates produce, mapped back for comparison. */
const TYPOGRAPHIC_FOLDS: Record<string, string> = {
	"‘": "'",
	"’": "'",
	"“": '"',
	"”": '"',
	"–": "-",
	"—": "-",
	" ": " ",
};

/** Fold for comparison: NFC, typographic punctuation, whitespace. Never applied to dumps. */
export function normalizeText(text: string): string {
	const folded = [...text.normalize("NFC")].map((char) => TYPOGRAPHIC_FOLDS[char] ?? char).join("");
	return folded.split(/\s+/).filter(Boolean).join(" ");
}

const NON_ASCII_DASHES = "‐‑‒–—―−";
const YEAR = String.raw`(?<!\d)(?:19|20)\d{2}(?!\d)`;
const NON_ASCII_DATE_RANGE = new RegExp(
	`${YEAR}[^\\S\\n]*[${NON_ASCII_DASHES}]|[${NON_ASCII_DASHES}][^\\S\\n]*${YEAR}`,
	"g",
);

export interface DateRangeHit {
	line: string;
	dash: string;
	codePoint: string;
}

/**
 * Every year joined to a non-ASCII dash in the RAW text layer. A year on
 * either side suffices ("Mar 2016 – Jul 2016"); numeric ranges without a
 * year ("EUR 600k-1M") are not dates. Horizontal whitespace only — a year
 * ending one line never joins a dash opening the next.
 */
export function findNonAsciiDateRanges(text: string): DateRangeHit[] {
	const hits: DateRangeHit[] = [];
	for (const match of text.matchAll(NON_ASCII_DATE_RANGE)) {
		const raw = match[0] ?? "";
		const dash = [...raw].find((char) => NON_ASCII_DASHES.includes(char)) ?? "";
		const start = match.index ?? 0;
		const lineStart = text.lastIndexOf("\n", start - 1) + 1;
		let lineEnd = text.indexOf("\n", start + raw.length);
		if (lineEnd === -1) lineEnd = text.length;
		const line = text.slice(lineStart, lineEnd).split(/\s+/).filter(Boolean).join(" ");
		hits.push({ line, dash, codePoint: `U+${(dash.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}` });
	}
	return hits;
}

function runArgv(argv: string[]): string {
	const [command, ...args] = argv as [string, ...string[]];
	try {
		return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) as string;
	} catch (error: unknown) {
		const err = error as { code?: string; stderr?: string; stdout?: string };
		if (err?.code === "ENOENT") {
			throw new CliError(
				"missing-poppler",
				`Required command '${command}' was not found. Install poppler-utils ` +
					`(macOS: brew install poppler, Debian/Ubuntu: apt install poppler-utils, Windows: choco install poppler).`,
			);
		}
		const detail = `${err?.stderr ?? ""}${err?.stdout ?? ""}`.trim() || "command failed";
		throw new CliError("unreadable-pdf", `${command} could not read the PDF: ${detail}`);
	}
}

/** Full argv for each Poppler call; overridable so tests drive stub scripts. */
export interface ToolBins {
	text: string[];
	info: string[];
}

function defaultBins(pdfPath: string): ToolBins {
	return { text: ["pdftotext", "-layout", "-enc", "UTF-8", pdfPath, "-"], info: ["pdfinfo", pdfPath] };
}

export function parsePageCount(pdfinfoOutput: string): number {
	const match = /^Pages:\s+(\d+)\s*$/m.exec(pdfinfoOutput);
	if (!match) throw new CliError("unreadable-pdf", "pdfinfo output did not contain a page count.");
	return Number(match[1]);
}

/** Extract ATS-readable text via Poppler. Returns { text, pages }. */
export function extractTextLayer(pdfPath: string, bins?: ToolBins): { text: string; pages: number } {
	const resolved = bins ?? defaultBins(pdfPath);
	const text = runArgv(resolved.text);
	const pages = parsePageCount(runArgv(resolved.info));
	return { text, pages };
}

export interface VerifyOptions {
	expectedPages?: number;
	minChars: number;
	requiredText: string[];
	dumpText?: string;
	asciiDates: boolean;
}

export interface VerifyOutcome {
	extractor: "pdftotext";
	text: string;
	pages: number;
}

export function verifyPdf(pdfPath: string, options: VerifyOptions, bins?: ToolBins): VerifyOutcome {
	if (!existsSync(pdfPath)) {
		throw new CliError("unreadable-pdf", `PDF does not exist: ${pdfPath}`);
	}
	const { text: extracted, pages } = extractTextLayer(pdfPath, bins);
	if (options.dumpText !== undefined) {
		const dumpPath = resolve(options.dumpText);
		try {
			mkdirSync(dirname(dumpPath), { recursive: true });
			writeFileSync(dumpPath, extracted.endsWith("\n") ? extracted : `${extracted}\n`, "utf8");
		} catch (error) {
			throw new CliError("unwritable-dump", `Could not write --dump-text to ${dumpPath}: ${(error as Error).message}`);
		}
	}
	if (options.expectedPages !== undefined && pages !== options.expectedPages) {
		throw new CliError("page-mismatch", `Expected ${options.expectedPages} page(s), found ${pages}.`);
	}
	const normalized = normalizeText(extracted);
	if (normalized.length < options.minChars) {
		throw new CliError("thin-text", `Text layer has ${normalized.length} character(s); expected at least ${options.minChars}.`);
	}
	for (const required of options.requiredText) {
		if (!normalized.includes(normalizeText(required))) {
			throw new CliError("missing-text", `Text layer is missing required text: ${JSON.stringify(required)}.`);
		}
	}
	if (options.asciiDates) {
		const hits = findNonAsciiDateRanges(extracted);
		if (hits.length > 0) {
			const listed = hits.map((hit) => `${hit.codePoint} in ${JSON.stringify(hit.line.slice(0, 80))}`).join("; ");
			throw new CliError(
				"non-ascii-dates",
				`${hits.length} date range(s) joined by a non-ASCII dash - an ATS that splits ranges on U+002D drops the date; ` +
					`write the date argument with a single ASCII hyphen (05-cv-templates.md, 'Date fields must be ASCII ranges'): ${listed}.`,
			);
		}
	}
	return { extractor: "pdftotext", text: extracted, pages };
}

function takeValue(args: string[], index: number, flag: string): { value: string; next: number } {
	const value = args[index];
	if (value === undefined || value.startsWith("-")) {
		throw new CliError("bad-args", `${flag} requires a value.`);
	}
	return { value, next: index + 1 };
}

function printHelpAndExit(): never {
	process.stdout.write(
		[
			"Usage:",
			"  node host/job-hunter/workflow/verify-pdf.ts <cv.pdf> [--pages N] [--min-chars N]",
			'    [--contains "text"...] [--dump-text out.txt] [--ascii-dates]',
			"",
		].join("\n"),
	);
	process.exit(0);
}

export interface ParsedArgs {
	pdf: string;
	options: VerifyOptions;
}

export function parseArgs(argv: string[]): ParsedArgs {
	let pdf: string | undefined;
	let expectedPages: number | undefined;
	let minChars = 1;
	const requiredText: string[] = [];
	let dumpText: string | undefined;
	let asciiDates = false;
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i] as string;
		if (arg === "--help" || arg === "-h") printHelpAndExit();
		else if (arg === "--pages" || arg === "--min-chars" || arg === "--contains" || arg === "--dump-text") {
			const taken = takeValue(argv, i + 1, arg);
			i = taken.next - 1;
			if (arg === "--pages") {
				const n = Number(taken.value);
				if (!Number.isInteger(n) || n <= 0) throw new CliError("bad-args", `--pages must be a positive integer, got ${JSON.stringify(taken.value)}.`);
				expectedPages = n;
			} else if (arg === "--min-chars") {
				const n = Number(taken.value);
				if (!Number.isInteger(n) || n < 0) throw new CliError("bad-args", `--min-chars must be a non-negative integer, got ${JSON.stringify(taken.value)}.`);
				minChars = n;
			} else if (arg === "--contains") {
				requiredText.push(taken.value);
			} else {
				dumpText = taken.value;
			}
		} else if (arg === "--ascii-dates") {
			asciiDates = true;
		} else if (arg.startsWith("-")) {
			throw new CliError("bad-args", `Unexpected argument ${JSON.stringify(arg)}. See --help.`);
		} else if (pdf === undefined) {
			pdf = arg;
		} else {
			throw new CliError("bad-args", `Unexpected argument ${JSON.stringify(arg)}. See --help.`);
		}
	}
	if (pdf === undefined) throw new CliError("bad-args", "Give a PDF file to verify. See --help.");
	return { pdf, options: { expectedPages, minChars, requiredText, dumpText, asciiDates } };
}

export function main(argv: string[]): void {
	const parsed = parseArgs(argv);
	const outcome = verifyPdf(parsed.pdf, parsed.options);
	process.stdout.write(`Verified ${parsed.pdf} (extractor: ${outcome.extractor}, pages: ${outcome.pages})\n`);
}

const invoked = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) {
	try {
		main(process.argv.slice(2));
	} catch (error: unknown) {
		const code = error instanceof CliError ? error.code : "error";
		process.stderr.write(`${JSON.stringify({ error: (error as Error).message, code })}\n`);
		process.exit(1);
	}
}
