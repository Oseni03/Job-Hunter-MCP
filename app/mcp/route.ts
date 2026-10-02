import { withMcpAuth } from "mcp-handler";
import { requireMcpAuth } from "@better-auth/mcp";

import { MCP_REQUIRED_SCOPES, getAuth, getMcpResource, isBetterAuthEnabled, verifyBearerToken } from "@/lib/auth.ts";
import {
	buildMcpHandler,
	isMcpAuthRequired,
	mcpPublicOrigin,
	mcpRequiredScopes,
	verifyMcpToken,
} from "@/lib/mcp/server.ts";

const mcpHandler = buildMcpHandler();

/**
 * Legacy path: static bearer token and/or external OAUTH_ISSUER via `jose`,
 * plus local-dev-open when nothing is configured. Preserved so existing
 * deploys and the offline test suite keep working.
 */
const origin = mcpPublicOrigin();
const legacyProtected = withMcpAuth(mcpHandler, verifyMcpToken, {
	required: isMcpAuthRequired(),
	requiredScopes: mcpRequiredScopes(),
	...(origin ? { resourceUrl: origin } : {}),
});

function bearerOf(req: Request): string | undefined {
	const header = req.headers.get("authorization") ?? "";
	const match = /^Bearer\s+(.+)$/i.exec(header.trim());
	return match?.[1]?.trim() || undefined;
}

async function dispatch(req: Request): Promise<Response> {
	// Exact static-bearer match wins (byte-for-byte legacy behavior, no JWKS fetch).
	const expected = process.env["MCP_AUTH_TOKEN"] || undefined;
	if (expected) {
		const check = verifyBearerToken(bearerOf(req), expected);
		if (check.authorized) {
			return mcpHandler(req);
		}
	}
	if (isBetterAuthEnabled()) {
		// Self-hosted OAuth 2.1 authorization server: verifies JWT access
		// tokens via JWKS and emits the RFC 9728 `WWW-Authenticate` challenge
		// on 401 so MCP clients discover the auth flow automatically.
		// Takes precedence over OAUTH_ISSUER below: when Better Auth has a
		// Postgres DATABASE_URL, external-issuer tokens are not accepted.
		// Constructed per request from the lazily-created auth instance.
		const protected_ = requireMcpAuth(getAuth(), (inner) => mcpHandler(inner), {
			resource: getMcpResource(),
			requiredScopes: [...MCP_REQUIRED_SCOPES],
		});
		return protected_(req);
	}
	return legacyProtected(req);
}

export const GET = dispatch;
export const POST = dispatch;
