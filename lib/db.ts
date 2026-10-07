/**
 * Prisma 7 integration (mirror-first).
 *
 * The schema in prisma/schema.prisma is the contract (Postgres-only since
 * the Better Auth merge: String[] scalar lists). Full persistence
 * activates once `prisma generate` has run (postinstall) and a Postgres
 * `DATABASE_URL` is set (local instance or hosted). Until then every helper below degrades gracefully: pure functions
 * keep working, client creation reports null, and no tool ever fails for
 * lack of a database.
 *
 * Prisma 7 notes:
 * - The generator uses `provider = "prisma-client"` with a required
 *   `output` (here `../generated/prisma`, i.e. `<root>/generated/prisma`).
 * - The connection string lives in prisma.config.ts, not schema.prisma.
 * - Every database needs a driver adapter: pg (Postgres). The adapter is
 *   picked from the DATABASE_URL scheme; `databaseKind()` still recognizes
 *   `file:` URLs so legacy/unset configs degrade to null instead of throwing.
 */

import { createHash } from "node:crypto";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client.ts";

export type { PrismaClient };

export interface AuthContext {
	issuer?: string;
	sub?: string;
	clientId?: string;
	token?: string;
}

/** Stable per-user id: OAuth issuer+sub, else the token label, else local-user. Never a secret. */
export function resolveUserId(auth: AuthContext): { id: string; issuer: string; sub: string } {
	const issuer = (auth.issuer ?? "local").trim() || "local";
	const sub = (auth.sub ?? auth.clientId ?? "local-user").trim() || "local-user";
	return { id: `${issuer}:${sub}`, issuer, sub };
}

/** SHA-1 of any input text; used for resume hashes and log input hashes. */
export function hashText(text: string): string {
	return createHash("sha1").update(text, "utf-8").digest("hex");
}

/** Redacts emails/phones for EventLog notes; stored ResumeVersion.html keeps full text. */
export function redactPii(text: string): string {
	return text
		.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
		.replace(/\+?\d[\d\s().-]{7,}\d/g, "[redacted-phone]");
}

export interface MirrorResult {
	persisted: boolean;
	reason: string;
}

export type DatabaseKind = "sqlite" | "postgres";

/** Picks the driver adapter from the DATABASE_URL scheme; null when unset or unsupported. */
export function databaseKind(url: string = process.env["DATABASE_URL"] ?? ""): DatabaseKind | null {
	const value = url.trim();
	if (value.startsWith("file:")) return "sqlite";
	if (/^postgres(ql)?:\/\//i.test(value)) return "postgres";
	return null;
}

/** True when DATABASE_URL names a supported database (sqlite file: or postgres). */
export function isDbConfigured(): boolean {
	return databaseKind() !== null;
}

declare global {
	var __prisma__: PrismaClient | undefined;
}

function createClient(url: string, kind: DatabaseKind): PrismaClient {
	const adapter = kind === "sqlite" ? new PrismaBetterSqlite3({ url }) : new PrismaPg({ connectionString: url });
	return new PrismaClient({ adapter });
}

/**
 * Returns the shared Prisma 7 client, creating it on first use (cached on
 * globalThis so Next.js dev HMR never exhausts the pool). Returns null when
 * no supported DATABASE_URL is set so callers degrade gracefully.
 */
export async function loadPrismaClient(): Promise<PrismaClient | null> {
	const url = (process.env["DATABASE_URL"] ?? "").trim();
	const kind = databaseKind(url);
	if (!kind) return null;
	if (globalThis.__prisma__) return globalThis.__prisma__;
	try {
		const client = createClient(url, kind);
		await client.$connect();
		globalThis.__prisma__ = client;
		return client;
	} catch {
		return null;
	}
}

/** Closes the shared client (scripts/tests); safe to call when never connected. */
export async function disconnectPrisma(): Promise<void> {
	if (!globalThis.__prisma__) return;
	const client = globalThis.__prisma__;
	globalThis.__prisma__ = undefined;
	try {
		await client.$disconnect();
	} catch {
		// Already closed or unreachable; nothing to report.
	}
}
