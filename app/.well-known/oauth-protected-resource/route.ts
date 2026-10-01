import {
	generateProtectedResourceMetadata,
	getPublicOrigin,
	metadataCorsOptionsRequestHandler,
} from "mcp-handler";

import { OAUTH_RESOURCE_NAME, oauthConfigFromEnv, oauthScopesSupported } from "@/lib/oauth.ts";

/**
 * RFC 9728 protected-resource metadata for /mcp: the resource identifier
 * is the public MCP URL and the authorization-server pointer is
 * OAUTH_ISSUER, so Claude's remote connector discovers DCR automatically.
 * Advertises `scopes_supported` (least-privilege `mcp:tools`) and the
 * resource name per the MCP authorization guide. Unconfigured (no issuer)
 * stays a plain 404 — nothing to discover.
 */
function resourceOf(req: Request): string {
	const configured = (process.env["MCP_PUBLIC_URL"] ?? "").trim();
	if (configured) {
		return configured;
	}
	return `${getPublicOrigin(req)}/mcp`;
}

export function GET(req: Request): Response {
	const oauth = oauthConfigFromEnv();
	if (!oauth) {
		return Response.json({ error: "OAuth not configured" }, { status: 404 });
	}
	return Response.json(
		generateProtectedResourceMetadata({
			authServerUrls: [oauth.issuer],
			resourceUrl: resourceOf(req),
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
