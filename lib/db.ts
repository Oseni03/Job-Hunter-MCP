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
 * - Every database needs a driver adapter: pg (Postgres). `databaseKind()`
 *   only accepts postgres URLs; legacy `file:` configs degrade to null.
 * - Single shared client: `import { prisma } from "@/lib/db"` and use it
 *   directly. Never `new PrismaClient()` at a call site, and never one
 *   client per module (auth reuses this same instance).
 */

import { createHash } from "node:crypto";

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

export type DatabaseKind = "postgres";

/**
 * Picks the driver adapter from the DATABASE_URL scheme; null when unset or
 * unsupported. Postgres-only: the schema provider is postgresql (Better Auth
 * needs String[] scalar lists), so legacy `file:` SQLite URLs degrade to
 * null instead of constructing a client that can never query.
 */
export function databaseKind(url: string = process.env["DATABASE_URL"] ?? ""): DatabaseKind | null {
	const value = url.trim();
	if (/^postgres(ql)?:\/\//i.test(value)) return "postgres";
	return null;
}

/** True when DATABASE_URL names a supported database (postgres). */
export function isDbConfigured(): boolean {
	return databaseKind() !== null;
}

declare global {
	var __prisma__: PrismaClient | undefined;
}

function createClient(url: string): PrismaClient {
	return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

function initSharedClient(): PrismaClient | null {
	if (globalThis.__prisma__) return globalThis.__prisma__;
	const url = (process.env["DATABASE_URL"] ?? "").trim();
	if (databaseKind(url) !== "postgres") return null;
	try {
		const client = createClient(url);
		globalThis.__prisma__ = client;
		return client;
	} catch {
		return null;
	}
}

/**
 * Proper web-app singleton: the initiated client, imported as a value.
 * Created once at module load and cached on globalThis (so Next.js dev
 * HMR never exhausts the pool). Null when no Postgres DATABASE_URL is set,
 * so callers degrade gracefully (`if (!prisma) ...`). Importing never
 * touches the network: Prisma 7 connects lazily on first query (no
 * explicit $connect).
 */
export const prisma: PrismaClient | null = initSharedClient();

/** Closes the shared client (scripts/tests); safe to call when never connected. */
export async function disconnectPrisma(): Promise<void> {
	const client = globalThis.__prisma__ ?? prisma;
	globalThis.__prisma__ = undefined;
	if (!client) return;
	try {
		await client.$disconnect();
	} catch {
		// Already closed or unreachable; nothing to report.
	}
}
