#!/usr/bin/env node
/**
 * Canonical dedup key for a job posting, plus an audit for existing state.
 * Ported from tools/job_key.py (same flags, same exit contract); the rule
 * itself lives in ../../../lib/job-key.ts and is shared with the server.
 *
 *   node host/job-hunter/workflow/job-key.ts --company "Acme Corp" --title "SOC Analyst (L2)" [--url ...]
 *   node host/job-hunter/workflow/job-key.ts --audit [state.json]
 *
 * Bare key prints to stdout. Audit prints a JSON summary to stdout and
 * exits 1 when violations exist. Default state path is
 * job-scraper/seen_jobs.json (hyphen — the path the slash-command workflow
 * owns; the Python draft defaulted to an underscore variant that never
 * matched the docs).
 */
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isCanonical, isLegacyShape, makeKey } from "../../../lib/job-key.ts";

export const DEFAULT_STATE = "job-scraper/seen_jobs.json";

export class CliError extends Error {
	readonly code: string;

	constructor(code: string, message: string) {
		super(message);
		this.name = "CliError";
		this.code = code;
	}
}

export interface AuditReport {
	entries: number;
	malformed_keys: string[];
	legacy_three_part_keys: string[];
	duplicate_urls: Record<string, string[]>;
	keys_not_matching_current_rule: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function asText(value: unknown): string {
	return typeof value === "string" ? value : "";
}

/**
 * Classifies every entry: malformed keys (path-breakers), legacy three-part
 * keys (harmless but drift-prone), URLs stored under two keys (dedup
 * failure), and canonical keys that no longer match the current rule
 * (drift, reported as a count so renaming stays a decision).
 */
export function auditState(doc: unknown): { report: AuditReport; violations: boolean } {
	const root = asRecord(doc);
	if (!root) {
		throw new CliError("bad-state", "State must be an object of job entries.");
	}
	// A present-but-malformed "seen" is an error, not a 1-entry map: without
	// this, {"seen": []} silently audits a phantom entry named "seen".
	const seen = "seen" in root ? asRecord(root["seen"]) : root;
	if (!seen) {
		throw new CliError("bad-state", 'State "seen" must be an object of job entries.');
	}
	const keys = Object.keys(seen);
	const malformed = keys.filter((key) => !isCanonical(key) && !isLegacyShape(key));
	const legacy = keys.filter((key) => isLegacyShape(key));
	const byUrl = new Map<string, string[]>();
	for (const key of keys) {
		const entry = asRecord(seen[key]);
		const url = asText(entry?.["url"]).replace(/\/+$/, "");
		if (url) {
			const list = byUrl.get(url) ?? [];
			list.push(key);
			byUrl.set(url, list);
		}
	}
	const duplicate_urls: Record<string, string[]> = {};
	for (const [url, list] of byUrl) {
		if (list.length > 1) duplicate_urls[url] = list;
	}
	let drift = 0;
	for (const key of keys) {
		if (!isCanonical(key)) continue;
		const entry = asRecord(seen[key]);
		const current = makeKey(asText(entry?.["company"]), asText(entry?.["title"]), asText(entry?.["url"]));
		if (current !== key) drift += 1;
	}
	const report: AuditReport = {
		entries: keys.length,
		malformed_keys: malformed,
		legacy_three_part_keys: legacy,
		duplicate_urls,
		keys_not_matching_current_rule: drift,
	};
	return { report, violations: malformed.length > 0 || Object.keys(duplicate_urls).length > 0 };
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
			'  node host/job-hunter/workflow/job-key.ts --company "<name>" --title "<title>" [--url <url>]',
			"  node host/job-hunter/workflow/job-key.ts --audit [state.json]",
			"",
			`Default state: ${DEFAULT_STATE} (relative to the working directory).`,
			"",
		].join("\n"),
	);
	process.exit(0);
}

export type ParsedArgs =
	| { command: "key"; company: string; title: string; url: string }
	| { command: "audit"; statePath: string };

export function parseArgs(argv: string[]): ParsedArgs {
	let company: string | undefined;
	let title: string | undefined;
	let url = "";
	let audit: string | undefined;
	let auditSeen = false;
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i] as string;
		if (arg === "--help" || arg === "-h") printHelpAndExit();
		else if (arg === "--company") {
			const taken = takeValue(argv, i + 1, "--company");
			company = taken.value;
			i = taken.next - 1;
		} else if (arg === "--title") {
			const taken = takeValue(argv, i + 1, "--title");
			title = taken.value;
			i = taken.next - 1;
		} else if (arg === "--url") {
			const taken = takeValue(argv, i + 1, "--url");
			url = taken.value;
			i = taken.next - 1;
		} else if (arg === "--audit") {
			auditSeen = true;
			const next = argv[i + 1];
			if (next !== undefined && !next.startsWith("-")) {
				audit = next;
				i += 1;
			}
		} else {
			throw new CliError("bad-args", `Unexpected argument ${JSON.stringify(arg)}. See --help.`);
		}
	}
	if (auditSeen) {
		if (company !== undefined || title !== undefined) {
			throw new CliError("bad-args", "--audit does not take --company/--title.");
		}
		return { command: "audit", statePath: resolve(audit ?? DEFAULT_STATE) };
	}
	if (company === undefined || title === undefined) {
		throw new CliError("bad-args", "Give --company and --title, or --audit.");
	}
	return { command: "key", company, title, url };
}

function readStateFile(path: string): unknown {
	try {
		return JSON.parse(readFileSync(path, "utf8")) as unknown;
	} catch (error) {
		throw new CliError("bad-state", `Cannot read state at ${path}: ${(error as Error).message}`);
	}
}

export function main(argv: string[]): void {
	const parsed = parseArgs(argv);
	if (parsed.command === "key") {
		process.stdout.write(`${makeKey(parsed.company, parsed.title, parsed.url)}\n`);
		return;
	}
	const { report, violations } = auditState(readStateFile(parsed.statePath));
	process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
	if (violations) {
		throw new CliError(
			"audit-violations",
			`Audit found ${report.malformed_keys.length} malformed key(s) and ${Object.keys(report.duplicate_urls).length} duplicate URL(s).`,
		);
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
