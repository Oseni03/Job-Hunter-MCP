#!/usr/bin/env node
/**
 * Salary benchmark lookup over a user-provided dataset.
 * Ported from salary_lookup.py (same matching, validation, formats, and
 * exit contract). Reads salary-data.json next to this file — your own data
 * (union statistics, Glassdoor exports, manual benchmarks); see the setup
 * note in 04-job-evaluation.md. The file is personal data and gitignored.
 *
 *   node host/job-hunter/workflow/salary-lookup.ts "Company Name" [--city "..."] [--json]
 *   node host/job-hunter/workflow/salary-lookup.ts --list-all
 *   node host/job-hunter/workflow/salary-lookup.ts --validate
 */
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";

export const DATA_FILE = join(dirname(fileURLToPath(import.meta.url)), "salary-data.json");
const MIN_SCORE = 30;

const SPELLING_VARIANTS: Array<[string, string]> = [
	["ø", "o"],
	["æ", "ae"],
	["å", "aa"],
	["ö", "o"],
	["ä", "ae"],
	["ü", "u"],
];

const STRIP_PATTERNS = [
	/\ba\/s\b/,
	/\baps\b/,
	/\bi\/s\b/,
	/\bp\/s\b/,
	/\bk\/s\b/,
	/\bivs\b/,
	/\bamba\b/,
	/\ba\.m\.b\.a\.?\b/,
	/\(vg\)/,
	/\(.*?\)/,
	/\bdanmark\b/,
	/\bdenmark\b/,
	/\bscandinavia\b/,
	/\bnordic\b/,
	/\bgroup\b/,
	/\bholding\b/,
	/,\s*.*$/,
];

export class CliError extends Error {
	readonly code: string;

	constructor(code: string, message: string) {
		super(message);
		this.name = "CliError";
		this.code = code;
	}
}

export interface CategoryData {
	count?: unknown;
	index?: unknown;
}

export interface CompanyEntry {
	company: string;
	city?: string;
	categories?: Record<string, CategoryData> | null;
	[key: string]: unknown;
}

export interface SalaryData {
	metadata?: Record<string, unknown> | null;
	companies?: unknown;
}

function applyStrip(text: string): string {
	let out = text;
	for (const pattern of STRIP_PATTERNS) out = out.replace(pattern, "");
	return out;
}

/** Normalize for robust fuzzy matching. */
export function normalize(text: string): string {
	const stripped = applyStrip(`${text ?? ""}`.toLowerCase().trim());
	return stripped.replace(/[^a-zæøåöäü0-9]/g, "").trim();
}

/** Danish/Nordic characters to anglicized equivalents. */
export function anglicize(text: string): string {
	let out = `${text ?? ""}`.toLowerCase();
	for (const [from, to] of SPELLING_VARIANTS) out = out.split(from).join(to);
	return out;
}

/** Meaningful words of a company name, noise ignored. */
export function extractCoreWords(text: string): string[] {
	const words = applyStrip(`${text ?? ""}`.toLowerCase()).match(/[a-zæøåöäü0-9]+/g) ?? [];
	return words.filter((word) => word.length > 1);
}

export interface QueryForms {
	norm: string;
	ang: string;
	words: Set<string>;
	wordsAng: Set<string>;
}

export function queryForms(query: string): QueryForms {
	const words = extractCoreWords(query);
	return {
		norm: normalize(query),
		ang: anglicize(normalize(query)),
		words: new Set(words),
		wordsAng: new Set(words.map(anglicize)),
	};
}

/** Match score 0-100. Mirrors the Python branch-for-branch, quirks included. */
export function matchScore(query: string, entryName: string): number {
	const q = queryForms(query);
	return matchScoreForms(q, query, entryName);
}

function matchScoreForms(q: QueryForms, query: string, entryName: string): number {
	const nNorm = normalize(entryName);
	if (!q.norm || !nNorm) return 0;
	if (q.norm === nNorm) return 100;
	const shortGuard = (shorter: string, longer: string): boolean => !(shorter.length <= 4 && shorter.length / longer.length < 0.5);
	if (q.norm.includes(nNorm) || nNorm.includes(q.norm)) {
		const [shorter, longer] = q.norm.length <= nNorm.length ? [q.norm, nNorm] : [nNorm, q.norm];
		if (!shortGuard(shorter, longer)) {
			const nWords = new Set(extractCoreWords(entryName));
			let shared = false;
			for (const word of q.words) {
				if (nWords.has(word)) {
					shared = true;
					break;
				}
			}
			if (shared) return 80 + Math.floor((shorter.length / longer.length) * 10);
		} else {
			return 80 + Math.floor((shorter.length / longer.length) * 10);
		}
	}
	const nAng = anglicize(nNorm);
	if (q.ang === nAng) return 85;
	if (q.ang.includes(nAng) || nAng.includes(q.ang)) {
		const shorter = Math.min(q.ang.length, nAng.length);
		const longer = Math.max(q.ang.length, nAng.length);
		if (shorter <= 4 && shorter / longer < 0.5) {
			const nWordsAng = new Set(extractCoreWords(entryName).map(anglicize));
			for (const word of q.wordsAng) {
				if (nWordsAng.has(word)) return 75;
			}
		} else {
			return 75;
		}
	}
	const nWords = new Set(extractCoreWords(entryName));
	if (q.words.size === 0 || nWords.size === 0) return 0;
	const overlap = [...q.words].filter((word) => nWords.has(word));
	const resolved = overlap.length > 0 ? overlap : [...q.wordsAng].filter((word) => new Set([...nWords].map(anglicize)).has(word));
	if (resolved.length > 0) {
		if (q.words.size === 1) {
			const single = [...q.words][0] as string;
			if (nWords.has(single) || [...nWords].map(anglicize).includes(anglicize(single))) return 70;
			return 0;
		}
		return Math.floor(30 + (resolved.length / q.words.size) * 40);
	}
	return 0;
}

export function searchCompany(data: SalaryData, query: string, city?: string): CompanyEntry[] {
	const companies = Array.isArray(data.companies) ? (data.companies as CompanyEntry[]) : [];
	const q = queryForms(query);
	const scored: Array<{ score: number; entry: CompanyEntry }> = [];
	for (const entry of companies) {
		if (!entry || typeof entry.company !== "string") continue;
		if (city) {
			const want = city.toLowerCase();
			const have = (entry.city ?? "").toLowerCase();
			if (!have.includes(want) && !anglicize(have).includes(anglicize(want))) continue;
		}
		const score = matchScoreForms(q, query, entry.company);
		if (score > 0) scored.push({ score, entry });
	}
	scored.sort((a, b) => b.score - a.score || (a.entry.company < b.entry.company ? -1 : 1));
	return scored.filter((item) => item.score >= MIN_SCORE).map((item) => item.entry);
}

function formatIndex(index: unknown, baseline: number): { indexStr: string; diffStr: string; suppressed: boolean } {
	if (typeof index === "number") {
		const indexStr = index.toFixed(1);
		if (baseline === 0) return { indexStr, diffStr: "", suppressed: false };
		const diff = ((index - baseline) / baseline) * 100;
		return { indexStr, diffStr: `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`, suppressed: false };
	}
	if (index !== undefined && index !== null) {
		return { indexStr: `${index}`, diffStr: "", suppressed: false };
	}
	return { indexStr: "N/A*", diffStr: "", suppressed: true };
}

export function formatEntry(entry: CompanyEntry, metadata: Record<string, unknown>): string {
	const meta = metadata ?? {};
	const lines: string[] = [];
	lines.push("");
	lines.push("=".repeat(60));
	lines.push(`  ${entry.company}`);
	if (entry.city) lines.push(`  Location: ${entry.city}`);
	lines.push("=".repeat(60));
	const categories = entry.categories ?? {};
	const rows = Object.entries(categories);
	if (rows.length === 0) {
		const skip = new Set(["company", "city", "categories"]);
		for (const [key, value] of Object.entries(entry)) {
			if (!skip.has(key)) lines.push(`  ${key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}: ${value}`);
		}
		return lines.join("\n");
	}
	const indexLabel = `${meta["index_label"] ?? "Index"}`;
	const baseline = typeof meta["index_baseline"] === "number" ? (meta["index_baseline"] as number) : 100;
	lines.push(`  ${"Category".padEnd(22)} ${"Count".padStart(6)} ${indexLabel.padStart(8)}  ${"vs Baseline".padStart(10)}`);
	lines.push(`  ${"-".repeat(50)}`);
	let suppressed = false;
	for (const [label, data] of rows) {
		const display = label.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
		const record = (data ?? {}) as CategoryData;
		const count = record.count;
		const countStr = count !== undefined && count !== null ? `${count}` : "-";
		const formatted = formatIndex(record.index, baseline);
		if (formatted.suppressed) suppressed = true;
		lines.push(`  ${display.padEnd(22)} ${countStr.padStart(6)} ${formatted.indexStr.padStart(8)}  ${formatted.diffStr.padStart(10)}`);
	}
	lines.push("");
	if (suppressed) lines.push("  * N/A = Too few employees to publish (privacy)");
	if (meta["baseline_description"]) lines.push(`  ${meta["baseline_description"]}`);
	else lines.push(`  ${indexLabel} ${baseline} = baseline`);
	return lines.join("\n");
}

export function renderList(companies: CompanyEntry[]): string {
	return companies.map((entry) => `${entry.company}${entry.city ? ` (${entry.city})` : ""}`).join("\n");
}

export function renderResults(results: CompanyEntry[], metadata: Record<string, unknown>): string {
	return results.map((entry) => formatEntry(entry, metadata)).join("\n");
}

export interface ValidationReport {
	errors: string[];
	warnings: string[];
}

export function collectValidationIssues(data: unknown): ValidationReport {
	const errors: string[] = [];
	const warnings: string[] = [];
	if (!data || typeof data !== "object" || Array.isArray(data)) {
		return { errors: ["top-level JSON value must be an object"], warnings };
	}
	const doc = data as Record<string, unknown>;
	const metadata = doc["metadata"] ?? {};
	if (metadata !== null && (typeof metadata !== "object" || Array.isArray(metadata))) {
		errors.push("'metadata' must be an object when provided");
	}
	const companies = doc["companies"];
	if (!Array.isArray(companies)) {
		errors.push("'companies' must be a list");
		return { errors, warnings };
	}
	const seen = new Map<string, number>();
	companies.forEach((entry: unknown, position: number) => {
		const index = position + 1;
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
			errors.push(`companies[${index}] must be an object`);
			return;
		}
		const record = entry as Record<string, unknown>;
		const company = record["company"];
		if (typeof company !== "string" || !company.trim()) {
			errors.push(`companies[${index}].company must be a non-empty string`);
		} else {
			const key = company.toLowerCase();
			if (seen.has(key)) {
				warnings.push(`Duplicate company name '${company}' (companies[${seen.get(key)}] and companies[${index}])`);
			} else {
				seen.set(key, index);
			}
		}
		const city = record["city"];
		if (city !== undefined && city !== null && typeof city !== "string") {
			errors.push(`companies[${index}].city must be a string when provided`);
		}
		const categories = (record["categories"] as Record<string, unknown> | null | undefined) ?? {};
		if (categories !== null && (typeof categories !== "object" || Array.isArray(categories))) {
			errors.push(`companies[${index}].categories must be an object when provided`);
		} else if (categories) {
			for (const [label, catData] of Object.entries(categories)) {
				if (!catData || typeof catData !== "object" || Array.isArray(catData)) {
					errors.push(`companies[${index}].categories.${label} must be an object with 'count' and/or 'index' (got ${catData === null ? "NoneType" : typeof catData})`);
					continue;
				}
				const cat = catData as Record<string, unknown>;
				if (cat["count"] !== undefined && cat["count"] !== null && typeof cat["count"] !== "number") {
					errors.push(`companies[${index}].categories.${label}.count must be a number (got ${typeof cat["count"]})`);
				}
				const indexVal = cat["index"];
				if (indexVal !== undefined && indexVal !== null && typeof indexVal !== "number" && typeof indexVal !== "string") {
					errors.push(`companies[${index}].categories.${label}.index must be a number or string (got ${typeof indexVal})`);
				}
			}
		}
	});
	return { errors, warnings };
}

export function renderValidationReport(errors: string[], warnings: string[]): { text: string; code: number } {
	if (errors.length === 0 && warnings.length === 0) return { text: "OK - no issues found.", code: 0 };
	const lines = [`Found ${errors.length + warnings.length} issue(s):`];
	if (errors.length > 0) {
		lines.push("  Errors:");
		errors.forEach((msg, i) => lines.push(`    [${i + 1}] ${msg}`));
	}
	if (warnings.length > 0) {
		lines.push("  Warnings:");
		warnings.forEach((msg, i) => lines.push(`    [${i + 1}] ${msg}`));
	}
	if (errors.length > 0) {
		lines.push("");
		lines.push("Fix the errors above, then re-run. See 04-job-evaluation.md for the expected format.");
		return { text: lines.join("\n"), code: 1 };
	}
	return { text: lines.join("\n"), code: 0 };
}

export function readDataFile(path: string): SalaryData {
	let raw: string;
	try {
		raw = readFileSync(path, "utf8");
	} catch {
		throw new CliError(
			"missing-data",
			"salary-data.json not found next to salary-lookup.ts. Add your own salary data (see 04-job-evaluation.md); without it the salary step is skipped.",
		);
	}
	try {
		return JSON.parse(raw) as SalaryData;
	} catch (error) {
		throw new CliError("bad-data", `Invalid salary-data.json: ${(error as Error).message}`);
	}
}

export function validatedData(data: SalaryData): SalaryData {
	const { errors } = collectValidationIssues(data);
	if (errors.length > 0) {
		throw new CliError("bad-data", `Invalid salary-data.json: ${errors[0]}`);
	}
	return data;
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
			'  node host/job-hunter/workflow/salary-lookup.ts "Company Name" [--city "..."] [--json]',
			"  node host/job-hunter/workflow/salary-lookup.ts --list-all",
			"  node host/job-hunter/workflow/salary-lookup.ts --validate",
			"",
		].join("\n"),
	);
	process.exit(0);
}

export interface ParsedArgs {
	company?: string;
	city?: string;
	json: boolean;
	listAll: boolean;
	validate: boolean;
}

export function parseArgs(argv: string[]): ParsedArgs {
	const parsed: ParsedArgs = { json: false, listAll: false, validate: false };
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i] as string;
		if (arg === "--help" || arg === "-h") printHelpAndExit();
		else if (arg === "--city") {
			const taken = takeValue(argv, i + 1, "--city");
			parsed.city = taken.value;
			i = taken.next - 1;
		} else if (arg === "--json") parsed.json = true;
		else if (arg === "--list-all") parsed.listAll = true;
		else if (arg === "--validate") parsed.validate = true;
		else if (arg.startsWith("-")) throw new CliError("bad-args", `Unexpected argument ${JSON.stringify(arg)}. See --help.`);
		else if (parsed.company === undefined) parsed.company = arg;
		else throw new CliError("bad-args", `Unexpected argument ${JSON.stringify(arg)}. See --help.`);
	}
	return parsed;
}

export function main(argv: string[]): void {
	const parsed = parseArgs(argv);
	const data = readDataFile(DATA_FILE);
	if (parsed.validate) {
		process.stdout.write(`Validating salary-data.json ...\n\n`);
		const { errors, warnings } = collectValidationIssues(data);
		const { text, code } = renderValidationReport(errors, warnings);
		process.stdout.write(`${text}\n`);
		if (code !== 0) throw new CliError("bad-data", "Salary data validation failed.");
		return;
	}
	const valid = validatedData(data);
	const metadata = (valid.metadata ?? {}) as Record<string, unknown>;
	const companies = (Array.isArray(valid.companies) ? valid.companies : []) as CompanyEntry[];
	if (parsed.listAll) {
		process.stdout.write(`${renderList(companies)}\n`);
		return;
	}
	if (!parsed.company) {
		throw new CliError("bad-args", 'Give a company name, --list-all, or --validate. See --help.');
	}
	const results = searchCompany(valid, parsed.company as string, parsed.city);
	if (results.length === 0) {
		const hint = parsed.city ? `\n  (filtered by city: ${parsed.city})` : "";
		process.stdout.write(`No results found for '${parsed.company}'${hint}\n\nTry a shorter or different name. Company names in the dataset\nmay include legal suffixes like 'A/S' or 'ApS'.\n`);
		throw new CliError("no-results", `No salary data for '${parsed.company}'.`);
	}
	if (parsed.json) {
		process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
		return;
	}
	process.stdout.write(`\nFound ${results.length} match(es) for '${parsed.company}':\n`);
	process.stdout.write(`${renderResults(results, metadata)}\n\n`);
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
