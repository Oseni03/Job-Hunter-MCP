import type { AuthInfo } from "@modelcontextprotocol/server";

import { oauthConfigFromEnv, oauthRequiredScopesFromEnv, verifyMcpAuth } from "@/lib/oauth.ts";

/**
 * Shared auth plumbing for every /<server>/mcp route. Product composition
 * (tools, resources, handlers) lives per server — see lib/job-hunter/.
 * This module owns only token verification and deployment settings.
 */

export async function verifyMcpToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
	// Never log bearerToken: 401s carry only the generic challenge while the
	// specific error code stays server-side inside the decision. Auth is
	// deliberately decoupled from `Mcp-Session-Id` — the same token validates
	// across sessions and rotation is purely JWKS-driven.
	const decision = await verifyMcpAuth(bearerToken, {
		expectedToken: process.env.MCP_AUTH_TOKEN || undefined,
		oauth: oauthConfigFromEnv(),
		requiredScopes: oauthRequiredScopesFromEnv(),
		expectedResource: mcpPublicResource(),
	});
	if (!decision.authorized) {
		return undefined;
	}
	return {
		token: bearerToken ?? "local-dev",
		clientId: decision.sub ?? "job-hunter-client",
		scopes: decision.scopes,
	};
}

/** Least-privilege scopes enforced on every /<server>/mcp route (default `mcp:tools`; see `OAUTH_REQUIRED_SCOPES`). */
export function mcpRequiredScopes(): string[] {
	return oauthRequiredScopesFromEnv();
}

/** Full public resource URL (`MCP_PUBLIC_URL`) used as the audience fallback when `OAUTH_AUDIENCE` is unset. */
export function mcpPublicResource(): string | undefined {
	const raw = (process.env["MCP_PUBLIC_URL"] ?? "").trim().replace(/\/+$/, "");
	return raw || undefined;
}

/**
 * Legacy path only: whether the static/external-issuer branch enforces auth.
 * Better Auth mode (Postgres DATABASE_URL) always requires auth regardless
 * of this helper — but that branch never reaches `legacyProtected`, so this
 * stays scoped to the legacy fallback by design.
 */
export function isMcpAuthRequired(): boolean {
	return Boolean(process.env.MCP_AUTH_TOKEN || process.env.OAUTH_ISSUER);
}

/**
 * Public origin for the RFC 9728 challenge: MCP_PUBLIC_URL's origin when
 * the deployment sets it (proxies hide the internal origin), otherwise
 * undefined so the adapter derives it from the request.
 */
export function mcpPublicOrigin(): string | undefined {
	const raw = (process.env["MCP_PUBLIC_URL"] ?? "").trim();
	if (!raw) {
		return undefined;
	}
	try {
		return new URL(raw).origin;
	} catch {
		return undefined;
	}
}
