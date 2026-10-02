import { metadataCorsOptionsRequestHandler } from "mcp-handler";

import { getAuth, isBetterAuthEnabled } from "@/lib/auth.ts";

/**
 * Suffix variant of the RFC 9728 document (`/.../oauth-protected-resource/mcp`)
 * served by the Better Auth `mcp()` plugin through `auth.handler`.
 */
export async function GET(req: Request): Promise<Response> {
	if (isBetterAuthEnabled()) {
		return getAuth().handler(req);
	}
	return Response.json({ error: "OAuth not configured" }, { status: 404 });
}

export function OPTIONS(): Response {
	return metadataCorsOptionsRequestHandler()();
}
