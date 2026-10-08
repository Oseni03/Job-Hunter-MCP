import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { jwt } from "better-auth/plugins";
import { mcp } from "@better-auth/mcp";

import { prisma, type PrismaClient } from "@/lib/db.ts";

export interface BearerCheck {
	authorized: boolean;
	reason: string;
}

/**
 * Decides whether an MCP request is authorized via the legacy static token.
 * Local dev stays open: with no token configured every request passes.
 * Prod: the bearer token must exactly match the configured token.
 * Kept for backwards compatibility; Better Auth JWT is checked separately
 * in each /<server>/mcp route via `requireMcpAuth`.
 */
export function verifyBearerToken(
	bearerToken: string | undefined,
	expectedToken: string | undefined,
): BearerCheck {
	if (!expectedToken) {
		return { authorized: true, reason: "local-dev-open" };
	}
	if (bearerToken && bearerToken === expectedToken) {
		return { authorized: true, reason: "bearer-match" };
	}
	return { authorized: false, reason: "bearer-mismatch" };
}

/** Scopes minted for MCP access tokens. `mcp:tools` gates /mcp; the rest are OIDC identity. */
export const MCP_SCOPES = ["openid", "profile", "email", "offline_access", "mcp:tools"] as const;

/** Least-privilege scope enforced on /mcp. */
export const MCP_REQUIRED_SCOPES = ["mcp:tools"] as const;

/**
 * Public base URL of this deployment (auth issuer origin).
 * Precedence: BETTER_AUTH_URL > MCP_PUBLIC_URL origin > VERCEL_URL > localhost.
 */
export function getBaseURL(env: Record<string, string | undefined> = process.env): string {
	const explicit = (env["BETTER_AUTH_URL"] ?? "").trim().replace(/\/+$/, "");
	if (explicit) {
		return explicit;
	}
	const mcpPublic = (env["MCP_PUBLIC_URL"] ?? "").trim();
	if (mcpPublic) {
		try {
			return new URL(mcpPublic).origin;
		} catch {
			// Fall through to defaults.
		}
	}
	const vercel = (env["VERCEL_URL"] ?? "").trim();
	if (vercel) {
		return `https://${vercel.replace(/\/+$/, "")}`;
	}
	const port = (env["PORT"] ?? "3000").trim() || "3000";
	return `http://localhost:${port}`;
}

/**
 * Canonical MCP protected-resource identifier (RFC 8707 / RFC 9728).
 * Precedence: MCP_PUBLIC_URL > `${baseURL}/mcp`.
 *
 * Legacy/single-server spelling: with only job-hunter deployed, point
 * MCP_PUBLIC_URL at its full public URL (`https://host/job-hunter/mcp`)
 * and the collection default below never matters. Kept verbatim for the
 * legacy metadata path and its tests.
 */
export function getMcpResource(env: Record<string, string | undefined> = process.env): string {
	const configured = (env["MCP_PUBLIC_URL"] ?? "").trim().replace(/\/+$/, "");
	if (configured) {
		return configured;
	}
	return `${getBaseURL(env)}/mcp`;
}

/**
 * Protected-resource identifier for one named MCP server, served at
 * `/<server>/mcp` on the same domain (`https://host/job-hunter/mcp`).
 * MCP_PUBLIC_URL names the job-hunter server verbatim; every later server
 * gets its own explicit rule here when it arrives — no placeholders.
 */
export function getServerResource(
	server: string,
	env: Record<string, string | undefined> = process.env,
): string {
	if (server === "job-hunter") {
		const configured = (env["MCP_PUBLIC_URL"] ?? "").trim().replace(/\/+$/, "");
		if (configured) {
			return configured;
		}
	}
	return `${getBaseURL(env)}/${server}/mcp`;
}

/**
 * Better Auth is enabled when DATABASE_URL names a Postgres database.
 * The Prisma provider is postgresql (Better Auth needs String[] scalar
 * lists), so a `file:` SQLite URL or any other scheme stays on the legacy
 * auth path instead of crashing inside a pg driver adapter.
 */
export function isBetterAuthEnabled(env: Record<string, string | undefined> = process.env): boolean {
	return /^postgres(ql)?:\/\//i.test((env["DATABASE_URL"] ?? "").trim());
}

function resolveSecret(env: Record<string, string | undefined> = process.env): string {
	const secret = (env["BETTER_AUTH_SECRET"] ?? "").trim();
	if (secret) {
		return secret;
	}
	if ((env["NODE_ENV"] ?? "").trim().toLowerCase() === "production") {
		throw new Error("BETTER_AUTH_SECRET is required in production.");
	}
	return "local-dev-secret-change-me-to-32-chars-minimum!!";
}

/**
 * Shared singleton: Better Auth reuses the same Prisma client as the rest
 * of the app (single pool, cached on globalThis in lib/db.ts). Callers
 * check isBetterAuthEnabled() first; throwing here surfaces programmer
 * error (including a non-Postgres DATABASE_URL that slipped past the gate).
 */
function createAuthPrismaClient(): PrismaClient {
	if (!prisma) {
		throw new Error("DATABASE_URL must be a Postgres URL for Better Auth.");
	}
	return prisma;
}

/**
 * Self-hosted OAuth 2.1 + OIDC authorization server for the MCP resource.
 *
 * `mcp()` IS the OAuth provider (do not also register `oauthProvider()`):
 * it binds issued tokens to the MCP `resource`, links that resource to newly
 * registered clients, and serves RFC 9728 protected-resource metadata through
 * `auth.handler` so MCP clients (Claude, Inspector) discover it via standard
 * OAuth discovery.
 *
 * Dynamic client registration is open (`allowDynamicClientRegistration` +
 * `allowUnauthenticatedClientRegistration`) so remote connectors can register
 * at request time without a pre-existing account.
 *
 * Single `User` table: Better Auth uses its default model names, and the
 * tracker's caller-identity columns (`issuer`, `sub`, `displayName`) are
 * declared as additional user fields so the CLI generates them into the same
 * table that owns the profile/applications/event-log relations.
 *
 * Lazily constructed: importing this module never touches the database
 * (tests and CLIs stay side-effect free). All runtime paths check
 * isBetterAuthEnabled() before calling getAuth().
 */
function createAuth() {
	// Explicit resource rows (identifier + scope allowlist) so the plugin's
	// seed always writes a real array. Without this, mcp() seeds from the
	// bare resource string and the plugin writes `allowedScopes: null`,
	// which Prisma rejects on the required `String[]` column
	// (PrismaClientValidationError at init). An empty array is NOT a safe
	// fallback either: token issuance intersects requested scopes with the
	// allowlist and an empty one fails every request with invalid_scope.
	// The allowlist mirrors MCP_SCOPES exactly (every scope this server
	// mints), so legitimate requests always intersect.
	// One row per MCP server on this domain (each served at /<name>/mcp).
	// Add the next server's getServerResource row here when it arrives.
	const servers = ["job-hunter"];
	const resource = getServerResource(servers[0] as string);
	return betterAuth({
		baseURL: getBaseURL(),
		secret: resolveSecret(),
		database: prismaAdapter(createAuthPrismaClient(), {
			provider: "postgresql",
		}),
		user: {
			additionalFields: {
				issuer: { type: "string", required: false },
				sub: { type: "string", required: false },
				displayName: { type: "string", required: false },
			},
		},
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false,
		},
		plugins: [
			jwt(),
			mcp({
				resource,
				resources: servers.map((name) => ({ identifier: getServerResource(name), allowedScopes: [...MCP_SCOPES] })),
				loginPage: "/sign-in",
				consentPage: "/consent",
				scopes: [...MCP_SCOPES],
				allowDynamicClientRegistration: true,
				allowUnauthenticatedClientRegistration: true,
			}),
		],
	});
}

type AuthInstance = ReturnType<typeof createAuth>;

declare global {
	var __betterAuth__: AuthInstance | undefined;
}

export function getAuth(): AuthInstance {
	const cached = globalThis.__betterAuth__;
	if (cached) {
		return cached;
	}
	const instance = createAuth();
	globalThis.__betterAuth__ = instance;
	return instance;
}

export type Auth = AuthInstance;
