/**
 * Ticket 03: match-then-update recording for the application tracker.
 * Pure functions over caller-passed tracker text; the server never touches
 * the filesystem or the seen-jobs dedup store. The host writes
 * `trackerText` to job_search_tracker.csv verbatim and `archiveText` to
 * `archiveFile` unless that file already exists.
 */

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
	/** YYYY-MM-DD override for today (tests); defaults to the current UTC date. */
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

/** Serializes one CSV row, quoting fields that carry commas, quotes, or newlines. */
function serializeCsvLine(fields: string[]): string {
	return fields
		.map((field) => (/[",\n\r]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field))
		.join(",");
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
	return serializeCsvLine(refreshed);
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

	const row = serializeCsvLine([
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

	const company = input.company.trim().toLowerCase();
	const role = input.role.trim().toLowerCase();
	const matches = dataLines
		.map((line, index) => ({ line, index, fields: parseCsvLine(line) }))
		.filter(
			(entry) =>
				(entry.fields[COMPANY_COLUMN] ?? "").trim().toLowerCase() === company &&
				(entry.fields[ROLE_COLUMN] ?? "").trim().toLowerCase() === role,
		);
	const openMatch = matches.find((entry) => !isFinalStatus(entry.fields[STATUS_COLUMN]));
	if (!openMatch) {
		const trackerText = joinAll([...dataLines, row]);
		return {
			ok: true,
			action: "append",
			trackerText,
			row,
			rowIndex: null,
			appendedAlongsideFinal: matches.length > 0,
			headerUpgraded,
			...archiveFor(input),
		};
	}

	const updated = [...dataLines];
	const refreshedRow = refreshOpenRow(openMatch.fields, input, today);
	updated[openMatch.index] = refreshedRow;
	const trackerText = joinAll(updated);
	return {
		ok: true,
		action: "update",
		trackerText,
		row: refreshedRow,
		rowIndex: openMatch.index,
		appendedAlongsideFinal: false,
		headerUpgraded,
		...archiveFor(input),
	};
}
