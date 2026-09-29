export interface BearerCheck {
	authorized: boolean;
	reason: string;
}

/**
 * Decides whether an MCP request is authorized.
 * Local dev stays open: with no token configured every request passes.
 * Prod: the bearer token must exactly match the configured token.
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
