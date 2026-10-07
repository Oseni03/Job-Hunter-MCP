/**
 * Ticket 02: ResumeVersion persistence (recompilable source of truth).
 *
 * The stored version holds the recompilable `tex` source plus review
 * `markdown` (prose derived from the TeX, never a second Profile) plus
 * the `verification` payload. New tailoring always appends; history
 * answers "what did I send?". Persistence degrades gracefully like
 * request-profile: no database means { persisted: false }, never a
 * thrown error, so pure builders stay testable without a database.
 */

import { hashText, loadPrismaClient, redactPii, type PrismaClient } from "@/lib/db.ts";
import { stripTexToProse } from "@/lib/job-hunter/verify.ts";
import type { Prisma } from "@/generated/prisma/client.ts";

/** Stored alongside the source: server-side proof the draft is tailored. */
export interface ResumeVerification {
	/** Server safety pass (host confirms with the real compile in ticket 04). */
	compiles: boolean;
	/** Share of posting requirements matched with Profile evidence (0-1). */
	keywordOverlap: number;
	/** True when the draft names no employer outside the Profile. */
	noNewEmployers: boolean;
}

/** Database-ready stored version (immutable; appends only). */
export interface ResumeVersionRecord {
	userId: string;
	jobKey: string;
	tex: string;
	markdown: string;
	verification: ResumeVerification | null;
}

/** Stored row as re-fetched: source plus review text plus verification payload. */
export interface StoredResumeVersion {
	id: number;
	tex: string;
	markdown: string;
	verification: Prisma.JsonValue | null;
}

export type ResumeVersionBuild =
	| { ok: true; record: ResumeVersionRecord }
	| { ok: false; error: string };

export const EMPTY_TEX_ERROR = "EMPTY_TEX: no tailored source to store. No ResumeVersion was written.";
export const EMPTY_VERSION_KEY_ERROR =
	"EMPTY_VERSION_KEY: user and posting key are required. No ResumeVersion was written.";

/** Review text for the draft: TeX commands stripped, prose kept. */
export function toReviewMarkdown(tex: string): string {
	return stripTexToProse(tex);
}

/**
 * Builds the storable version. Fails loudly on empty source or key with
 * no record emitted, mirroring the EMPTY_SLUG contract from ticket 01.
 */
export function buildResumeVersionRecord(input: {
	userId: string;
	jobKey: string;
	tex: string;
	verification?: ResumeVerification | null;
}): ResumeVersionBuild {
	if (!input.userId.trim() || !input.jobKey.trim()) {
		return { ok: false, error: EMPTY_VERSION_KEY_ERROR };
	}
	if (!input.tex.trim()) {
		return { ok: false, error: EMPTY_TEX_ERROR };
	}
	return {
		ok: true,
		record: {
			userId: input.userId,
			jobKey: input.jobKey,
			tex: input.tex,
			markdown: toReviewMarkdown(input.tex),
			verification: input.verification ?? null,
		},
	};
}

function toJsonInput(verification: ResumeVerification | null): Prisma.InputJsonValue | undefined {
	if (!verification) {
		return undefined;
	}
	return { ...verification };
}

export interface SaveResult {
	persisted: boolean;
	id?: number;
	reason: string;
}

/** Appends one immutable row; never updates. Null client degrades to { persisted: false }. */
export async function saveResumeVersion(
	client: PrismaClient | null,
	record: ResumeVersionRecord,
): Promise<SaveResult> {
	if (!client) {
		return { persisted: false, reason: "no-database" };
	}
	try {
		const row = await client.resumeVersion.create({
			data: {
				userId: record.userId,
				jobKey: record.jobKey,
				tex: record.tex,
				markdown: record.markdown,
				verification: toJsonInput(record.verification),
			},
		});
		return { persisted: true, id: row.id, reason: "stored" };
	} catch (error) {
		return { persisted: false, reason: error instanceof Error ? error.message : "write-failed" };
	}
}

/** Builds then appends using the shared client (null when unconfigured). */
export async function storeActiveResumeVersion(input: {
	userId: string;
	jobKey: string;
	tex: string;
	verification?: ResumeVerification | null;
}): Promise<SaveResult & { buildError?: string }> {
	const built = buildResumeVersionRecord(input);
	if (!built.ok) {
		return { persisted: false, reason: "invalid-record", buildError: built.error };
	}
	return saveResumeVersion(await loadPrismaClient(), built.record);
}

/** Every stored version for one user and posting, oldest first. Empty when no database. */
export async function fetchResumeVersions(
	client: PrismaClient | null,
	userId: string,
	jobKey: string,
): Promise<StoredResumeVersion[]> {
	if (!client) {
		return [];
	}
	try {
		return await client.resumeVersion.findMany({
			where: { userId, jobKey },
			orderBy: { id: "asc" },
			select: { id: true, tex: true, markdown: true, verification: true },
		});
	} catch {
		return [];
	}
}

/** Latest stored version for one user and posting, or null. */
export async function fetchLatestResumeVersion(
	client: PrismaClient | null,
	userId: string,
	jobKey: string,
): Promise<StoredResumeVersion | null> {
	if (!client) {
		return null;
	}
	try {
		return await client.resumeVersion.findFirst({
			where: { userId, jobKey },
			orderBy: { id: "desc" },
			select: { id: true, tex: true, markdown: true, verification: true },
		});
	} catch {
		return null;
	}
}

/* ------------------------------------------------------------------ */
/* Ticket 03: verification proof plus EventLog trace                   */
/* ------------------------------------------------------------------ */

/**
 * Builds the stored-and-returned verification from the tailor output.
 * `compiles` is the server LaTeX-safety pass (the host confirms with
 * the real compile); `keywordOverlap` is matched requirements over all
 * requirements; `noNewEmployers` is true only when the drift audit is
 * empty, so invented employers fail loudly instead of shipping silent.
 */
export function buildResumeVerification(input: {
	coverage: Array<{ status: string }>;
	draftDrift: string[];
	latexSafetyPassed: boolean;
}): ResumeVerification {
	const total = input.coverage.length;
	const matched = input.coverage.filter((item) => item.status === "matched").length;
	return {
		compiles: input.latexSafetyPassed,
		keywordOverlap: total === 0 ? 0 : Math.round((matched / total) * 100) / 100,
		noNewEmployers: input.draftDrift.length === 0,
	};
}

/**
 * Short EventLog note for a tailoring: slugs and counts only, so no
 * contact text ever enters the log. Passed through redactPii anyway.
 */
export function buildTailorEventNote(input: {
	slug: string;
	verification: ResumeVerification;
	driftCount: number;
	stretchCount: number;
	stored: boolean;
}): string {
	return redactPii(
		[
			`tailor-resume ${input.slug}`,
			`compiles=${input.verification.compiles ? "pass" : "FAIL"}`,
			`overlap=${input.verification.keywordOverlap}`,
			`noNewEmployers=${input.verification.noNewEmployers ? "yes" : "NO"}`,
			`drift=${input.driftCount}`,
			`stretch=${input.stretchCount}`,
			`stored=${input.stored ? "yes" : "no"}`,
		].join(" "),
	);
}

/** SHA-1 of the posting text for the log; the text itself is never logged. */
export function tailorInputHash(postingText: string): string {
	return hashText(postingText);
}

/** Best-effort EventLog write. Null client or missing user row degrades to { logged: false }. */
export async function logTailorEvent(
	client: PrismaClient | null,
	entry: {
		userId: string;
		ok: boolean;
		ms?: number;
		note: string;
		inputHash?: string;
		outputRef?: string;
	},
): Promise<{ logged: boolean; reason: string }> {
	if (!client) {
		return { logged: false, reason: "no-database" };
	}
	try {
		await client.eventLog.create({
			data: {
				userId: entry.userId,
				tool: "tailor-resume",
				ms: entry.ms,
				ok: entry.ok,
				note: entry.note,
				inputHash: entry.inputHash,
				outputRef: entry.outputRef,
			},
		});
		return { logged: true, reason: "logged" };
	} catch (error) {
		return { logged: false, reason: error instanceof Error ? error.message : "write-failed" };
	}
}

/* ------------------------------------------------------------------ */
/* Ticket 04: ephemeral PDF recompile cache                            */
/* ------------------------------------------------------------------ */

/**
 * Host-side recompile contract: the server never compiles and never
 * stores PDF bytes (see verify.ts). The host recompiles a stored `tex`
 * source with the stock lualatex toolchain and caches the PDF under
 * `generated/` keyed by version id. No Obsidian, no vault folders.
 */

export const EMPTY_RECOMPILE_SOURCE_ERROR =
	"EMPTY_RECOMPILE_SOURCE: no tailored source for this version. No PDF was emitted.";
export const BAD_VERSION_ID_ERROR =
	"BAD_VERSION_ID: version id must be a positive integer. No PDF was emitted.";

export interface RecompilePlan {
	/** Stored version the PDF recompiles from. */
	versionId: number;
	/** Where the host writes the stored source before compiling. */
	texPath: string;
	/** Stock toolchain command the host runs (mirrors the tailor output). */
	compileCommand: string;
	/** Ephemeral cache location for the compiled PDF, keyed by version. */
	cachePath: string;
}

export type RecompilePlanResult = { ok: true; plan: RecompilePlan } | { ok: false; error: string };

/** Ephemeral cache location for one version's PDF. Fails loudly on bad ids. */
export function pdfCachePathFor(
	versionId: number,
): { ok: true; cachePath: string } | { ok: false; error: string } {
	if (!Number.isInteger(versionId) || versionId <= 0) {
		return { ok: false, error: BAD_VERSION_ID_ERROR };
	}
	return { ok: true, cachePath: `generated/resume/${versionId}.pdf` };
}

/** Full host recompile plan for one stored version, or a loud refusal. */
export function recompilePlanFor(version: {
	id: number;
	jobKey: string;
	tex: string;
}): RecompilePlanResult {
	if (!version.jobKey.trim()) {
		return { ok: false, error: EMPTY_VERSION_KEY_ERROR };
	}
	if (!version.tex.trim()) {
		return { ok: false, error: EMPTY_RECOMPILE_SOURCE_ERROR };
	}
	const cached = pdfCachePathFor(version.id);
	if (!cached.ok) {
		return cached;
	}
	const stem = `main_${version.jobKey}`;
	return {
		ok: true,
		plan: {
			versionId: version.id,
			texPath: `cv/${stem}.tex`,
			compileCommand: `cd cv && lualatex --no-shell-escape -interaction=nonstopmode ${stem}.tex`,
			cachePath: cached.cachePath,
		},
	};
}
