/**
 * Ticket 03: match-then-update recording for the application tracker.
 * Pure functions over caller-passed tracker text; the server never touches
 * the filesystem or the seen-jobs dedup store. The host writes
 * `trackerText` to job_search_tracker.csv verbatim and `archiveText` to
 * `archiveFile` unless that file already exists.
 */

import { createHash } from "node:crypto";

import { makeJobSlug } from "@/lib/job-key.ts";
import { archiveDirFor } from "@/lib/tailor.ts";

export const TRACKER_HEADER =
	"date,company,sector,role,role_type,channel,status,contact_person,fit_rating,notes,cv_file,cover_letter_file,source,deadline";

export interface RecordInput {
	company: string;
	role: string;
	sector?: string;
	roleType?: string;
	contactPerson?: string;
	channel?: string;
	portal?: string;
	fitScore: number | null;
	cvFile: string;
	coverLetterFile: string;
	postingUrl?: string;
	deadline?: string | null;
	/** Held verbatim posting text; absent means the text is no longer held. */
	postingText?: string;
	/** Caller-passed tracker content; empty when the tracker is missing. */
	trackerText?: string;
	/** YYYY-MM-DD override for today; the host passes the user's local day as the norm (the server default is the UTC day, a day off near midnight elsewhere). */
	today?: string;
}

export interface RecordPlan {
	ok: true;
	action: "append" | "update";
	/** Full updated tracker content; the host writes it verbatim. */
	trackerText: string;
	/** CSV line for the new or updated row. */
	row: string;
	/** Zero-based data-row index for updates; null for appends. */
	rowIndex: number | null;
	/** True when appending while final rows exist for the same company+role. */
	appendedAlongsideFinal: boolean;
	headerUpgraded: boolean;
	/** Open matches in the selected match set; >1 means the ledger needs dedup. */
	openMatchCount: number;
	/** Names the duplicate count when several open rows match; null otherwise. */
	duplicateNote: string | null;
	/** SHA-1 of the input trackerText; host writes only if the file still matches. */
	trackerHash: string;
	archiveFile: string | null;
	/** Verbatim posting text; null when the text is no longer held. */
	archiveText: string | null;
	archiveNote: string | null;
}

export interface RecordFailure {
	ok: false;
	error: string;
}

export type RecordOutcome = RecordPlan | RecordFailure;

/** Final statuses (case-insensitive); every other status is an open row. */
const FINAL_STATUSES = new Set([
	"rejected",
	"withdrawn",
	"no response",
	"offer declined",
	"hired",
	"accepted",
]);

const COMPANY_COLUMN = 1;
const ROLE_COLUMN = 3;
const STATUS_COLUMN = 6;

function todayOf(input: RecordInput): string {
	return input.today ?? new Date().toISOString().slice(0, 10);
}

/** Quote-aware single-line CSV parse. */
function parseCsvLine(line: string): string[] {
	const fields: string[] = [];
	let field = "";
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		if (inQuotes) {
			if (char === '"') {
				if (line[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += char;
			}
		} else if (char === '"') {
			inQuotes = true;
		} else if (char === ",") {
			fields.push(field);
			field = "";
		} else {
			field += char;
		}
	}
	fields.push(field);
	return fields;
}

function isFinalStatus(status: string | undefined): boolean {
	return FINAL_STATUSES.has((status ?? "").trim().toLowerCase());
}

/** Leading characters that execute as formulas when the CSV is opened in Excel/Sheets. */
const FORMULA_LEAD = new Set(["=", "+", "-", "@"]);

/**
 * Makes one tracker cell inert for spreadsheet apps: newlines become spaces
 * (the reader splits on EOL first, so multi-line cells would return as
 * broken rows on the next run) and a leading `= + - @` gains the
 * spreadsheet `'` text-prefix. Idempotent: an already-prefixed cell passes
 * through unchanged, so re-serialization never double-prefixes.
 */
export function sanitizeTrackerField(value: string): string {
	const flat = value.replace(/\r\n|\r|\n/g, " ");
	if (flat.length > 1 && flat.startsWith("'") && FORMULA_LEAD.has(flat[1] ?? "")) {
		return flat;
	}
	if (flat && FORMULA_LEAD.has(flat[0] ?? "")) {
		return `'${flat}`;
	}
	return flat;
}

/** Strips the neutralization prefix for matching; the stored cell keeps it. */
export function deneutralizeTrackerField(value: string): string {
	if (value.length > 1 && value.startsWith("'") && FORMULA_LEAD.has(value[1] ?? "")) {
		return value.slice(1);
	}
	return value;
}

/** Trailing legal-entity suffixes stripped during company matching (whole tokens only). */
const COMPANY_SUFFIXES = new Set([
	"limited",
	"incorporated",
	"corporation",
	"ltd",
	"inc",
	"corp",
	"llc",
	"llp",
	"plc",
	"pty",
	"gmbh",
	"sarl",
	"sas",
	"srl",
	"spa",
	"bv",
	"nv",
	"ug",
	"ab",
	"aps",
	"sa",
	"ag",
	"sl",
	"co",
]);

/**
 * Normalized company key: deneutralized, lowercased, dotted abbreviations
 * collapsed ("L.L.C." to "llc"), punctuation spaced out, trailing legal
 * suffixes dropped as whole tokens. Exact equality within this form only —
 * never a substring test — so "Acme" still differs from "Acme Partners"
 * while matching "Acme Ltd". Single-token names never strip, so "Banco"
 * and "Visa" survive intact.
 */
export function normalizeCompanyName(value: string): string {
	const words = deneutralizeTrackerField(value)
		.toLowerCase()
		.replace(/\./g, "")
		.replace(/[^a-z0-9\s]/g, " ")
		.split(/\s+/)
		.filter(Boolean);
	while (words.length > 1 && COMPANY_SUFFIXES.has(words[words.length - 1] ?? "")) {
		words.pop();
	}
	return words.join(" ");
}

/** Normalized role key: deneutralized, lowercased, punctuation spaced out. */
export function normalizeRoleName(value: string): string {
	return deneutralizeTrackerField(value)
		.toLowerCase()
		.replace(/\r\n|\r|\n/g, " ")
		.replace(/[^a-z0-9\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

/** Stateless stale-write guard: SHA-1 of the exact input tracker text. */
export function trackerHashFor(trackerText: string): string {
	return createHash("sha1").update(trackerText, "utf8").digest("hex");
}

/** Serializes one CSV row, quoting fields that carry commas, quotes, or newlines. */
function serializeCsvLine(fields: string[]): string {
	return fields
		.map((field) => (/[",\n\r]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field))
		.join(",");
}

/** Serializes one tracker row: every cell sanitized (newline-free, formula-inert). */
function serializeTrackerRow(fields: string[]): string {
	return serializeCsvLine(fields.map((field) => sanitizeTrackerField(field)));
}

const DATE_COLUMN = 0;
const FIT_COLUMN = 8;
const NOTES_COLUMN = 9;
const CV_COLUMN = 10;
const COVER_COLUMN = 11;
const SOURCE_COLUMN = 12;
const DEADLINE_COLUMN = 13;
const REDRAFTED_MARKER = "redrafted";

/** Rebuilds the open row: only files, score, source, and deadline refresh. */
function refreshOpenRow(fields: string[], input: RecordInput, today: string): string {
	const refreshed = [...fields];
	while (refreshed.length < TRACKER_HEADER.split(",").length) {
		refreshed.push("");
	}
	if ((refreshed[STATUS_COLUMN] ?? "").trim().toLowerCase() === "drafted") {
		refreshed[DATE_COLUMN] = today;
	}
	refreshed[FIT_COLUMN] = formatFit(input.fitScore);
	const notes = refreshed[NOTES_COLUMN] ?? "";
	refreshed[NOTES_COLUMN] = notes ? `${notes}; ${REDRAFTED_MARKER}` : REDRAFTED_MARKER;
	refreshed[CV_COLUMN] = input.cvFile;
	refreshed[COVER_COLUMN] = input.coverLetterFile;
	refreshed[SOURCE_COLUMN] = input.postingUrl ?? "";
	const deadline = normalizeDeadline(input.deadline);
	if (deadline) {
		refreshed[DEADLINE_COLUMN] = deadline;
	}
	return serializeTrackerRow(refreshed);
}

/** Bare numeric fit score; empty when unscored. */
function formatFit(fitScore: number | null): string {
	return fitScore === null ? "" : String(fitScore);
}

/** Explicit channel wins, then portal name, then online for a URL, else empty. */
function deriveChannel(input: RecordInput): string {
	if (input.channel) {
		return input.channel;
	}
	if (input.portal) {
		return input.portal;
	}
	return input.postingUrl ? "online" : "";
}

/** Keeps only a YYYY-MM-DD deadline; free text is never guessed into a date. */
function normalizeDeadline(deadline: string | null | undefined): string {
	if (!deadline || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(deadline)) {
		return "";
	}
	return deadline;
}

/** Archive payload: verbatim held text, or nothing with an explicit report. */
function archiveFor(input: RecordInput): {
	archiveFile: string | null;
	archiveText: string | null;
	archiveNote: string | null;
} {
	const slug = makeJobSlug(input.company, input.role, input.postingUrl ?? "");
	if (!slug) {
		return { archiveFile: null, archiveText: null, archiveNote: "No company, role, or URL to archive under." };
	}
	const archiveFile = `${archiveDirFor(slug)}/job_posting.md`;
	if (input.postingText === undefined || input.postingText === "") {
		return {
			archiveFile,
			archiveText: null,
			archiveNote: "Posting text no longer held; archive skipped — supply postingText to archive verbatim.",
		};
	}
	return { archiveFile, archiveText: input.postingText, archiveNote: null };
}

function detectEol(text: string): "\r\n" | "\n" {
	return text.includes("\r\n") ? "\r\n" : "\n";
}

export function planRecordApplication(input: RecordInput): RecordOutcome {
	const today = todayOf(input);
	const given = input.trackerText ?? "";
	const eol = detectEol(given);
	// Split without dropping blank lines; only the trailing terminator is
	// re-added on join, so untouched rows survive byte-identical.
	const rawLines = given === "" ? [] : given.split(eol);
	if (rawLines.length > 0 && rawLines[rawLines.length - 1] === "") {
		rawLines.pop();
	}

	let headerUpgraded = false;
	let dataLines: string[];
	if (rawLines.length === 0) {
		dataLines = [];
	} else if (rawLines[0] === TRACKER_HEADER) {
		dataLines = rawLines.slice(1);
	} else if (rawLines[0] === TRACKER_HEADER.replace(",deadline", "")) {
		headerUpgraded = true;
		dataLines = rawLines.slice(1);
	} else {
		return { ok: false, error: `Unrecognized tracker header: ${rawLines[0]}` };
	}

	const row = serializeTrackerRow([
		today,
		input.company,
		input.sector ?? "",
		input.role,
		input.roleType ?? "",
		deriveChannel(input),
		"drafted",
		input.contactPerson ?? "",
		formatFit(input.fitScore),
		"",
		input.cvFile,
		input.coverLetterFile,
		input.postingUrl ?? "",
		normalizeDeadline(input.deadline),
	]);

	const joinAll = (lines: string[]): string => `${TRACKER_HEADER}${eol}${lines.join(eol)}${eol}`;

	// Match on the posting URL first where the caller holds one (exact source
	// comparison), then fall back to normalized company+role. Normalization
	// deneutralizes the `'` prefix and flattens newlines first, so a
	// neutralized cell still matches and matching stays exact within the
	// normalized form — never a substring test.
	const entries = dataLines.map((line, index) => ({ line, index, fields: parseCsvLine(line) }));
	const inputUrl = (input.postingUrl ?? "").trim();
	const urlEntries = inputUrl ? entries.filter((entry) => (entry.fields[SOURCE_COLUMN] ?? "").trim() === inputUrl) : [];
	const normalizedCompany = normalizeCompanyName(input.company);
	const normalizedRole = normalizeRoleName(input.role);
	const keyEntries = entries.filter(
		(entry) =>
			normalizeCompanyName(entry.fields[COMPANY_COLUMN] ?? "") === normalizedCompany &&
			normalizeRoleName(entry.fields[ROLE_COLUMN] ?? "") === normalizedRole,
	);
	const candidates = urlEntries.length > 0 ? urlEntries : keyEntries;
	const openMatches = candidates.filter((entry) => !isFinalStatus(entry.fields[STATUS_COLUMN]));
	const trackerHash = trackerHashFor(given);
	if (openMatches.length === 0) {
		const trackerText = joinAll([...dataLines, row]);
		return {
			ok: true,
			action: "append",
			trackerText,
			row,
			rowIndex: null,
			appendedAlongsideFinal: candidates.length > 0,
			headerUpgraded,
			openMatchCount: 0,
			duplicateNote: null,
			trackerHash,
			...archiveFor(input),
		};
	}

	const openMatch = openMatches[0]!;
	const updated = [...dataLines];
	const refreshedRow = refreshOpenRow(openMatch.fields, input, today);
	updated[openMatch.index] = refreshedRow;
	const trackerText = joinAll(updated);
	const duplicateNote =
		openMatches.length > 1
			? `${openMatches.length} open rows match this application; updated data row ${openMatch.index} — the ledger needs deduplication.`
			: null;
	return {
		ok: true,
		action: "update",
		trackerText,
		row: refreshedRow,
		rowIndex: openMatch.index,
		appendedAlongsideFinal: false,
		headerUpgraded,
		openMatchCount: openMatches.length,
		duplicateNote,
		trackerHash,
		...archiveFor(input),
	};
}
