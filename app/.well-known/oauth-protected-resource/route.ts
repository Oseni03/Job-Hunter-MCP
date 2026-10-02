import {
	generateProtectedResourceMetadata,
	getPublicOrigin,
	metadataCorsOptionsRequestHandler,
} from "mcp-handler";

import { getAuth, isBetterAuthEnabled } from "@/lib/auth.ts";
import { OAUTH_RESOURCE_NAME, oauthConfigFromEnv, oauthScopesSupported } from "@/lib/oauth.ts";

/**
 * RFC 9728 protected-resource metadata for /mcp.
 *
 * Primary: Better Auth `mcp()` plugin serves this document through
 * `auth.handler` (resource-bound issuer, `mcp:tools` scope), so MCP clients
 * discover the self-hosted authorization server automatically. This fixes the
 * 404 chain in the logs (`oauth-protected-resource` -> 404, then
 * `oauth-authorization-server`, `openid-configuration`, `/register` all 404
 * because no authorization server existed at all).
 *
 * Fallback: legacy external-issuer metadata (OAUTH_ISSUER) when Better Auth
 * has no database configured. Unconfigured stays a plain 404.
 */
function legacyResourceOf(req: Request): string {
	const configured = (process.env["MCP_PUBLIC_URL"] ?? "").trim().replace(/\/+$/, "");
	if (configured) {
		return configured;
	}
	return `${getPublicOrigin(req)}/mcp`;
}

export async function GET(req: Request): Promise<Response> {
	if (isBetterAuthEnabled()) {
		return getAuth().handler(req);
	}
	const oauth = oauthConfigFromEnv();
	if (!oauth) {
		return Response.json({ error: "OAuth not configured" }, { status: 404 });
	}
	return Response.json(
		generateProtectedResourceMetadata({
			authServerUrls: [oauth.issuer],
			resourceUrl: legacyResourceOf(req),
			additionalMetadata: {
				scopes_supported: oauthScopesSupported(),
				resource_name: OAUTH_RESOURCE_NAME,
			},
		}),
	);
}

export function OPTIONS(): Response {
	return metadataCorsOptionsRequestHandler()();
}
