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

import { loadPrismaClient, type PrismaClient } from "@/lib/db.ts";
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
): Promise<Array<{ id: number; tex: string; markdown: string }> > {
	if (!client) {
		return [];
	}
	try {
		return await client.resumeVersion.findMany({
			where: { userId, jobKey },
			orderBy: { id: "asc" },
			select: { id: true, tex: true, markdown: true },
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
): Promise<{ id: number; tex: string; markdown: string } | null> {
	if (!client) {
		return null;
	}
	try {
		return await client.resumeVersion.findFirst({
			where: { userId, jobKey },
			orderBy: { id: "desc" },
			select: { id: true, tex: true, markdown: true },
		});
	} catch {
		return null;
	}
}
