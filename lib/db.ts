/**
 * Prisma integration port (mirror-first).
 *
 * The schema in prisma/schema.prisma is the contract. Full persistence
 * activates once `@prisma/client` is installed and `prisma generate` has run
 * (`DATABASE_URL="file:./prisma/job-hunter.db"` locally, Postgres URL on
 * deploy). Until then every helper below degrades gracefully: pure functions
 * keep working, mirror writes report `persisted: false` with a reason, and no
 * tool ever fails for lack of a database.
 *
 * Deliberately no static `import "@prisma/client"` here so `tsc` stays green
 * before/after install. The generated client is loaded lazily via dynamic
 * import only when configured AND installed.
 */

import { createHash } from "node:crypto";

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

/** Redacts emails/phones for EventLog notes; stored ResumeVersion.tex keeps full text. */
export function redactPii(text: string): string {
	return text
		.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
		.replace(/\+?\d[\d\s().-]{7,}\d/g, "[redacted-phone]");
}

export interface MirrorResult {
	persisted: boolean;
	reason: string;
}

/**
 * Lazily loads the generated Prisma client when available.
 * Returns null when not installed/generated yet (pre-install) so callers degrade.
 */
export async function loadPrismaClient(): Promise<unknown | null> {
	if (!process.env["DATABASE_URL"]) {
		return null;
	}
	try {
		const mod = await Function("return import('@prisma/client')")();
		const Client = mod.PrismaClient as new () => unknown;
		return new Client();
	} catch {
		return null;
	}
}

/** True when a DATABASE_URL is set; persistence additionally needs the client installed. */
export function isDbConfigured(): boolean {
	return Boolean((process.env["DATABASE_URL"] ?? "").trim());
}
