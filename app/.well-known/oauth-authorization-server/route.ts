import { getAuth, isBetterAuthEnabled } from "@/lib/auth.ts";

/**
 * RFC 8414 authorization-server metadata at the root discovery URL.
 * Served by the Better Auth OAuth provider; 404 when Better Auth has no
 * database configured. CORS is permissive so browser-based MCP Inspector
 * flows can fetch it during local testing.
 */
export const GET = withCors(async (req: Request): Promise<Response> => {
	const { oauthProviderAuthServerMetadata } = await import("@better-auth/oauth-provider");
	return oauthProviderAuthServerMetadata(getAuth())(req);
});

function withCors(handler: (req: Request) => Promise<Response>) {
	return async (req: Request): Promise<Response> => {
		if (!isBetterAuthEnabled()) {
			return Response.json({ error: "OAuth not configured" }, { status: 404 });
		}
		const res = await handler(req);
		const headers = new Headers(res.headers);
		headers.set("Access-Control-Allow-Origin", "*");
		headers.set("Access-Control-Allow-Methods", "GET");
		return new Response(res.body, { status: res.status, headers });
	};
}

export function OPTIONS(): Response {
	return new Response(null, {
		status: 204,
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET",
		},
	});
}
