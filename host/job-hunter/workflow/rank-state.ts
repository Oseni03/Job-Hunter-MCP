#!/usr/bin/env node
/**
 * State helper for /rank: select candidates and write results back.
 * Ported from tools/rank_state.py (same subcommands, flags, JSON shapes,
 * and exit contract). The seen store is host state; scoring stays with
 * the model — this only keeps the state file out of the conversation.
 *
 *   node host/job-hunter/workflow/rank-state.ts candidates [--all] [--focus TEXT] [--limit N]
 *   node host/job-hunter/workflow/rank-state.ts sweep [--write] [--exclude KEY,KEY]
 *   node host/job-hunter/workflow/rank-state.ts apply --results results.json [--dry-run]
 *
 * Subcommands print JSON on stdout. Exit 1 on usage/state errors, or on
 * `apply` when any result could not be written. Defaults
 * (--state job-scraper/seen_jobs.json, --tracker job_search_tracker.csv)
 * are working-directory-relative and match the slash-command workflow.
 */
import { pathToFileURL } from "node:url";
import { readFileSync, renameSync, unlinkSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { casefoldApprox } from "../../../lib/job-key.ts";

export const DEFAULT_STATE = "job-scraper/seen_jobs.json";
export const DEFAULT_TRACKER = "job_search_tracker.csv";
export const DEFAULT_LIMIT = 10;
export const URGENT_DAYS = 7;

/** 04-job-evaluation.md weights; mirrored (not imported) so this CLI runs dependency-free. */
const WEIGHTS: Record<string, number> = { technical: 0.3, experience: 0.25, behavioral: 0.15, career: 0.3 };
const BANDS: Array<[number, string]> = [
	[75, "Strong Fit"],
	[60, "Good Fit"],
	[45, "Moderate Fit"],
	[30, "Weak Fit"],
	[0, "Poor Fit"],
];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CliError extends Error {
	readonly code: string;

	constructor(code: string, message: string) {
		super(message);
		this.name = "CliError";
		this.code = code;
	}
}

export type SeenDoc = { doc: Record<string, unknown>; seen: Record<string, Record<string, unknown>> };

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asText(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function asList(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

export function loadState(path: string): SeenDoc {
	if (!existsSync(path)) {
		throw new CliError("bad-state", `${path} not found - run /scrape first`);
	}
	let doc: unknown;
	try {
		doc = JSON.parse(readFileSync(path, "utf8")) as unknown;
	} catch {
		throw new CliError("bad-state", `${path} is not valid JSON - run /scrape first`);
	}
	const root = asRecord(doc);
	if (!root) throw new CliError("bad-state", `${path}: expected an object of job entries`);
	const seenRaw = "seen" in root ? root["seen"] : root;
	const seen = asRecord(seenRaw);
	if (!seen) throw new CliError("bad-state", `${path}: expected an object of job entries`);
	const entries: Record<string, Record<string, unknown>> = {};
	for (const [key, entry] of Object.entries(seen)) {
		const record = asRecord(entry);
		if (!record) throw new CliError("bad-state", `${path}: entry ${JSON.stringify(key)} is not an object`);
		entries[key] = record;
	}
	return { doc: root, seen: entries };
}

/** Atomic replace: a half-written seen_jobs.json loses the scrape history. */
export function saveState(path: string, doc: Record<string, unknown>): void {
	const tmp = join(dirname(resolve(path)), `.seen_jobs.${randomBytes(8).toString("hex")}.tmp`);
	try {
		writeFileSync(tmp, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
		renameSync(tmp, resolve(path));
	} catch (error) {
		try {
			unlinkSync(tmp);
		} catch {
			// Ignore cleanup failure; report the original error.
		}
		throw error;
	}
}

/**
 * Defensive date parse: anything that is not a real YYYY-MM-DD calendar
 * date behaves exactly like an absent value — never compared, never guessed.
 */
export function parseIso(value: unknown): string | null {
	if (typeof value !== "string" || !ISO_DATE.test(value.trim())) return null;
	const text = value.trim();
	const year = Number(text.slice(0, 4));
	const month = Number(text.slice(5, 7));
	const day = Number(text.slice(8, 10));
	const date = new Date(Date.UTC(year, month - 1, day));
	if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
		return null;
	}
	return text;
}

/**
 * Ignore case and separators without discarding non-Latin identity:
 * combining marks survive (they can distinguish names, e.g. Indic vowels).
 */
export function norm(text: unknown): string {
	return [...casefoldApprox(`${text ?? ""}`).normalize("NFC")]
		.filter((char) => /[\p{L}\p{N}]/u.test(char) || /\p{M}/u.test(char))
		.join("");
}

function parseCsv(text: string): Array<Record<string, string>> {
	const rows: string[][] = [];
	let current: string[] = [];
	let field = "";
	let quoted = false;
	const push = (): void => {
		current.push(field);
		field = "";
	};
	const endRow = (): void => {
		current.push(field);
		field = "";
		rows.push(current);
		current = [];
	};
	const body = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
	for (let i = 0; i < body.length; i += 1) {
		const char = body[i] as string;
		if (quoted) {
			if (char === '"') {
				if (body[i + 1] === '"') {
					field += '"';
					i += 1;
				} else {
					quoted = false;
				}
			} else {
				field += char;
			}
		} else if (char === '"') {
			quoted = true;
		} else if (char === ",") {
			push();
		} else if (char === "\n") {
			endRow();
		} else {
			field += char;
		}
	}
	if (field !== "" || current.length > 0) endRow();
	if (rows.length === 0) return [];
	const header = (rows[0] as string[]).map((h) => h.trim());
	return (rows.slice(1) as string[][])
		.filter((row) => row.some((cell) => cell.trim() !== ""))
		.map((row) => Object.fromEntries(header.map((h, index) => [h, (row[index] ?? "").trim()])));
}

/** company+role pairs already in the tracker — out of scope for ranking. */
export function trackerPairs(trackerText: string): Set<string> {
	const pairs = new Set<string>();
	for (const row of parseCsv(trackerText)) {
		const company = norm(row["company"]);
		if (company) pairs.add(`${company}||${norm(row["role"])}`);
	}
	return pairs;
}

export function readTrackerFile(path: string): Set<string> {
	let text: string;
	try {
		text = readFileSync(path, "utf8");
	} catch {
		return new Set();
	}
	return trackerPairs(text);
}

/** location_verdict, falling back to a legacy verdict stored under `location`. */
export function entryLocationVerdict(entry: Record<string, unknown>): string | null {
	const verdict = asText(entry["location_verdict"]);
	if (verdict) return verdict;
	const legacy = asText(entry["location"]);
	return legacy === "PASS" || legacy === "FAIL" || legacy === "FLAG" ? legacy : null;
}

export interface CandidatesOptions {
	all: boolean;
	focus: string;
	limit: number;
}

export interface CandidateRow {
	key: string;
	title: unknown;
	company: unknown;
	url: unknown;
	portal: unknown;
	deadline: unknown;
	posted_date: unknown;
}

export function selectCandidates(
	seen: Record<string, Record<string, unknown>>,
	excluded: Set<string>,
	options: CandidatesOptions,
): { eligible: CandidateRow[]; excluded_by_tracker: number; total_entries: number } {
	const selected: CandidateRow[] = [];
	let skipped = 0;
	for (const [key, entry] of Object.entries(seen)) {
		const status = asText(entry["status"]);
		if (options.all) {
			if (status === "skipped") continue;
		} else if (status !== "new") {
			continue;
		}
		if (excluded.has(`${norm(entry["company"])}||${norm(entry["title"])}`)) {
			skipped += 1;
			continue;
		}
		if (options.focus) {
			const haystack = [
				asText(entry["title"]),
				asText(entry["company"]),
				...asList(entry["strengths"]).map(String),
				...asList(entry["gaps"]).map(String),
			]
				.join(" ")
				.toLowerCase();
			if (!haystack.includes(options.focus.toLowerCase())) continue;
		}
		selected.push({
			key,
			title: entry["title"] ?? null,
			company: entry["company"] ?? null,
			url: entry["url"] ?? null,
			portal: entry["portal"] ?? null,
			deadline: entry["deadline"] ?? null,
			posted_date: entry["posted_date"] ?? null,
		});
	}
	return { eligible: selected, excluded_by_tracker: skipped, total_entries: Object.keys(seen).length };
}

export function todayIso(): string {
	const now = new Date();
	const pad = (n: number): string => `${n}`.padStart(2, "0");
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function daysBetween(from: string, to: string): number {
	return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

export interface SweepRow {
	key: string;
	title: unknown;
	company: unknown;
	url: unknown;
	deadline: string;
}

export function sweepRanked(
	seen: Record<string, Record<string, unknown>>,
	today: string,
	exclude: Set<string>,
): { checked: number; expired: SweepRow[]; closing: SweepRow[]; unparseable: Array<{ key: string; portal: unknown; deadline: unknown }> } {
	const expired: SweepRow[] = [];
	const closing: SweepRow[] = [];
	const unparseable: Array<{ key: string; portal: unknown; deadline: unknown }> = [];
	let checked = 0;
	for (const [key, entry] of Object.entries(seen)) {
		if (asText(entry["status"]) !== "ranked" || exclude.has(key)) continue;
		checked += 1;
		const raw = entry["deadline"];
		if (raw === null || raw === undefined || raw === "") continue;
		const parsed = parseIso(raw);
		if (parsed === null) {
			unparseable.push({ key, portal: entry["portal"] ?? null, deadline: raw });
			continue;
		}
		const row: SweepRow = {
			key,
			title: entry["title"] ?? null,
			company: entry["company"] ?? null,
			url: entry["url"] ?? null,
			deadline: parsed,
		};
		if (parsed < today) expired.push(row);
		else if (daysBetween(today, parsed) <= URGENT_DAYS) closing.push(row);
	}
	closing.sort((a, b) => (a.deadline < b.deadline ? -1 : 1));
	return { checked, expired, closing, unparseable };
}

export function overallScore(scores: unknown): number {
	const record = asRecord(scores);
	if (!record) throw new CliError("apply-errors", "scores must be an object with technical/experience/behavioral/career");
	let total = 0;
	for (const dim of Object.keys(WEIGHTS)) {
		const value = record[dim];
		if (typeof value === "boolean" || typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
			throw new CliError("apply-errors", `score '${dim}' must be finite and between 0 and 100`);
		}
		total += value * (WEIGHTS[dim] as number);
	}
	return Math.floor(total + 0.5);
}

export function bandFor(score: number): string {
	for (const [floor, name] of BANDS) {
		if (score >= (floor as number)) return name as string;
	}
	return "Poor Fit";
}

export interface ApplyResultRow {
	key: string;
	title: unknown;
	company: unknown;
	location: unknown;
	url: unknown;
	score: number;
	verdict: string;
	location_verdict: string;
	language_gate: string;
	language_note: unknown;
	deadline: unknown;
	posted_date: unknown;
	urgent: boolean;
	strengths: unknown[];
	gaps: unknown[];
}

export function applyResults(
	seen: Record<string, Record<string, unknown>>,
	results: unknown,
	today: string,
): { ranked: ApplyResultRow[]; vetoed: ApplyResultRow[]; expired: Array<Record<string, unknown>>; errors: Array<Record<string, unknown>> } {
	const list = (asRecord(results)?.["results"] ?? results) as unknown;
	if (!Array.isArray(list)) {
		throw new CliError("bad-args", "Results file must be a JSON array of scoring objects.");
	}
	const rows: ApplyResultRow[] = [];
	const expired: Array<Record<string, unknown>> = [];
	const errors: Array<Record<string, unknown>> = [];
	for (const item of list) {
		const result = asRecord(item) ?? {};
		const key = asText(result["key"]);
		const entry = seen[key];
		if (!entry) {
			errors.push({ key, error: "no such key in seen_jobs.json" });
			continue;
		}
		if (asText(result["status"]) === "expired") {
			entry["status"] = "expired";
			expired.push({ key, title: entry["title"] ?? null, company: entry["company"] ?? null, url: entry["url"] ?? null });
			continue;
		}
		let score: number;
		try {
			score = overallScore(result["scores"]);
		} catch (error) {
			errors.push({ key, error: (error as Error).message });
			continue;
		}
		const legacy = entryLocationVerdict(entry);
		if (["PASS", "FAIL", "FLAG"].includes(asText(entry["location"]))) {
			delete entry["location"];
		}
		entry["status"] = "ranked";
		entry["rank_score"] = score;
		entry["rank_verdict"] = bandFor(score);
		entry["rank_date"] = today;
		entry["location_verdict"] = asText(result["location_verdict"]) || legacy || "PASS";
		entry["language_gate"] = asText(result["language_gate"]) || "PASS";
		if (entry["language_gate"] === "PASS") {
			delete entry["language_note"];
		} else {
			entry["language_note"] = (result["language_note"] as string | null | undefined) ?? null;
		}
		// Absence is not a correction: a fetch that degraded to a listing
		// page returns no deadline, and blanking a stored one would erase a
		// real date and make the entry immortal to the sweep.
		if (asText(result["deadline"])) entry["deadline"] = result["deadline"];
		for (const field of ["strengths", "gaps"]) {
			const value = result[field];
			if (Array.isArray(value)) entry[field] = value.map(String).slice(0, 3);
		}
		const parsed = parseIso(entry["deadline"]);
		rows.push({
			key,
			title: entry["title"] ?? null,
			company: entry["company"] ?? null,
			location: entry["location"] ?? null,
			url: entry["url"] ?? null,
			score,
			verdict: asText(entry["rank_verdict"]),
			location_verdict: asText(entry["location_verdict"]),
			language_gate: asText(entry["language_gate"]),
			language_note: entry["language_note"] ?? null,
			deadline: entry["deadline"] ?? null,
			posted_date: entry["posted_date"] ?? null,
			urgent: Boolean(parsed && today <= parsed && daysBetween(today, parsed) <= URGENT_DAYS),
			strengths: asList(entry["strengths"]),
			gaps: asList(entry["gaps"]),
		});
	}
	rows.sort((a, b) => b.score - a.score || Number(b.urgent) - Number(a.urgent));
	const vetoed = rows.filter((row) => row.location_verdict === "FAIL" || row.language_gate === "FAIL");
	return { ranked: rows.filter((row) => !vetoed.includes(row)), vetoed, expired, errors };
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
			"  node host/job-hunter/workflow/rank-state.ts candidates [--state S] [--tracker T] [--today YYYY-MM-DD] [--all] [--focus TEXT] [--limit N]",
			"  node host/job-hunter/workflow/rank-state.ts sweep [--state S] [--today YYYY-MM-DD] [--write] [--exclude KEY,KEY]",
			"  node host/job-hunter/workflow/rank-state.ts apply --results results.json [--state S] [--today YYYY-MM-DD] [--dry-run]",
			"",
			`Defaults: --state ${DEFAULT_STATE}, --tracker ${DEFAULT_TRACKER} (working-directory-relative).`,
			"--limit 0 means no cap.",
			"",
		].join("\n"),
	);
	process.exit(0);
}

export interface CommonOptions {
	state: string;
	today: string;
}

export type ParsedCommand =
	| { command: "candidates"; common: CommonOptions; tracker: string; all: boolean; focus: string; limit: number }
	| { command: "sweep"; common: CommonOptions; write: boolean; exclude: string }
	| { command: "apply"; common: CommonOptions; results: string; dryRun: boolean };

export function parseArgs(argv: string[]): ParsedCommand {
	const [command, ...rest] = argv;
	if (!command || command === "--help" || command === "-h") printHelpAndExit();
	if (command !== "candidates" && command !== "sweep" && command !== "apply") {
		throw new CliError("bad-args", `Unknown command ${JSON.stringify(command)}. See --help.`);
	}
	const common: CommonOptions = { state: resolve(DEFAULT_STATE), today: todayIso() };
	let tracker = resolve(DEFAULT_TRACKER);
	let all = false;
	let focus = "";
	let limit = DEFAULT_LIMIT;
	let write = false;
	let exclude = "";
	let results = "";
	let dryRun = false;
	for (let i = 0; i < rest.length; i += 1) {
		const arg = rest[i] as string;
		if (arg === "--state" || arg === "--tracker" || arg === "--today" || arg === "--focus" || arg === "--limit" || arg === "--exclude" || arg === "--results") {
			const taken = takeValue(rest, i + 1, arg);
			i = taken.next - 1;
			if (arg === "--state") common.state = resolve(taken.value);
			else if (arg === "--tracker") tracker = resolve(taken.value);
			else if (arg === "--today") {
				if (!parseIso(taken.value)) throw new CliError("bad-args", `--today must be YYYY-MM-DD, got ${JSON.stringify(taken.value)}.`);
				common.today = taken.value;
			} else if (arg === "--focus") focus = taken.value;
			else if (arg === "--limit") {
				const n = Number(taken.value);
				if (!Number.isInteger(n) || n < 0) throw new CliError("bad-args", `--limit must be a non-negative integer, got ${JSON.stringify(taken.value)}.`);
				limit = n;
			} else if (arg === "--exclude") exclude = taken.value;
			else results = taken.value;
		} else if (arg === "--all") {
			all = true;
		} else if (arg === "--write") {
			write = true;
		} else if (arg === "--dry-run") {
			dryRun = true;
		} else {
			throw new CliError("bad-args", `Unexpected argument ${JSON.stringify(arg)}. See --help.`);
		}
	}
	if (command === "candidates") return { command, common, tracker, all, focus, limit };
	if (command === "sweep") return { command, common, write, exclude };
	if (!results) throw new CliError("bad-args", "apply requires --results results.json.");
	return { command, common, results: resolve(results), dryRun };
}

function readResultsFile(path: string): unknown {
	try {
		return JSON.parse(readFileSync(path, "utf8")) as unknown;
	} catch (error) {
		throw new CliError("bad-state", `Cannot read results file ${path}: ${(error as Error).message}`);
	}
}

export function main(argv: string[]): void {
	const parsed = parseArgs(argv);
	const { doc, seen } = loadState(parsed.common.state);
	if (parsed.command === "candidates") {
		const excluded = readTrackerFile(parsed.tracker);
		const { eligible, excluded_by_tracker, total_entries } = selectCandidates(seen, excluded, {
			all: parsed.all,
			focus: parsed.focus,
			limit: parsed.limit,
		});
		const total = eligible.length;
		const selected = parsed.limit > 0 ? eligible.slice(0, parsed.limit) : eligible;
		process.stdout.write(
			`${JSON.stringify({ eligible: total, selected, deferred: Math.max(0, total - selected.length), excluded_by_tracker, total_entries }, null, 2)}\n`,
		);
		return;
	}
	if (parsed.command === "sweep") {
		const exclude = new Set(parsed.exclude.split(",").map((key) => key.trim()).filter(Boolean));
		const { checked, expired, closing, unparseable } = sweepRanked(seen, parsed.common.today, exclude);
		if (parsed.write && expired.length > 0) {
			for (const row of expired) {
				const entry = seen[row.key];
				if (entry) entry["status"] = "expired";
			}
			saveState(parsed.common.state, doc);
		}
		process.stdout.write(
			`${JSON.stringify({ swept: checked, newly_expired: expired, closing_soon: closing, unparseable_deadlines: unparseable, written: Boolean(parsed.write && expired.length > 0) }, null, 2)}\n`,
		);
		return;
	}
	const outcome = applyResults(seen, readResultsFile(parsed.results), parsed.common.today);
	if (!parsed.dryRun) saveState(parsed.common.state, doc);
	process.stdout.write(`${JSON.stringify({ ...outcome, written: !parsed.dryRun }, null, 2)}\n`);
	if (outcome.errors.length > 0) {
		throw new CliError("apply-errors", `${outcome.errors.length} result(s) could not be written.`);
	}
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
