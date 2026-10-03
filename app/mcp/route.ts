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

/**
 * Stamps a known identity into `extra.http.authInfo` for tool handlers
 * (via `req.auth`, the same channel `withMcpAuth` uses). Gating is never
 * changed here: every caller is already authorized by the surrounding
 * branch, so the verifier always returns and `required` stays false.
 */
function withIdentity(
	handler: (req: Request) => Promise<Response>,
	authInfo: { token: string; clientId: string; scopes: string[] },
): (req: Request) => Promise<Response> {
	return withMcpAuth(handler, async () => authInfo, { required: false });
}

async function dispatch(req: Request): Promise<Response> {
	// Exact static-bearer match wins (byte-for-byte legacy behavior, no JWKS fetch).
	const expected = process.env["MCP_AUTH_TOKEN"] || undefined;
	if (expected) {
		const check = verifyBearerToken(bearerOf(req), expected);
		if (check.authorized) {
			return withIdentity(mcpHandler, {
				token: bearerOf(req) ?? "static-bearer",
				clientId: "job-hunter-client",
				scopes: mcpRequiredScopes(),
			})(req);
		}
	}
	if (isBetterAuthEnabled()) {
		// Self-hosted OAuth 2.1 authorization server: verifies JWT access
		// tokens via JWKS and emits the RFC 9728 `WWW-Authenticate` challenge
		// on 401 so MCP clients discover the auth flow automatically.
		// Takes precedence over OAUTH_ISSUER below: when Better Auth has a
		// Postgres DATABASE_URL, external-issuer tokens are not accepted.
		// Constructed per request from the lazily-created auth instance.
		// The JWT `sub` is the BetterAuth User id (also the Profile row key),
		// forwarded so tools load the caller's stored profile. Claims are
		// verified by requireMcpAuth; this branch only forwards identity.
		const protected_ = requireMcpAuth(
			getAuth(),
			(inner, claims) => {
				const sub = typeof claims.sub === "string" ? claims.sub.trim() : "";
				if (!sub) {
					return mcpHandler(inner);
				}
				return withIdentity(mcpHandler, {
					token: bearerOf(inner) ?? "better-auth",
					clientId: sub,
					scopes: [...MCP_REQUIRED_SCOPES],
				})(inner);
			},
			{
				resource: getMcpResource(),
				requiredScopes: [...MCP_REQUIRED_SCOPES],
			},
		);
		return protected_(req);
	}
	return legacyProtected(req);
}

export const GET = dispatch;
export const POST = dispatch;
