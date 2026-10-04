import { importJWK, jwtVerify } from "jose";

/**
 * OAuth 2.1 resource-server auth for the deployed MCP routes (issue 23).
 *
 * Follows the MCP authorization guide (modelcontextprotocol.io): the server
 * is a pure resource server — it validates bearer access tokens, serves RFC
 * 9728 discovery, and emits the `WWW-Authenticate` challenge via
 * `withMcpAuth`. It never mints tokens, never runs the authorize/DCR
 * endpoints itself (those live on the configured authorization server, e.g.
 * Keycloak), and never stores tokens or sessions.
 *
 * Token validation uses the off-the-shelf `jose` library (signature,
 * `iss`/`aud`/`exp`/`nbf`) — never hand-rolled crypto. The JWKS fetch is the
 * only hand-written part (in-memory TTL cache so rotation needs no restart,
 * same stateless precedent as the fetch cache); signatures always verify
 * through `jose`.
 *
 * Pitfall coverage, in one place:
 * - short-lived tokens: enforced via `exp` (+60s leeway for clock drift);
 *   operators should mint 5-15 min access tokens at the AS.
 * - audience/resource: always validated. `OAUTH_AUDIENCE` is preferred; when
 *   unset it falls back to the public resource URL (`MCP_PUBLIC_URL`), so a
 *   token minted for another API never passes.
 * - HTTPS: `http://` issuers, JWKS URIs, and resources fail closed unless
 *   they are loopback (`localhost`/`127.0.0.1`/`[::1]`) dev URLs.
 * - least-privilege scopes: `OAUTH_REQUIRED_SCOPES` (default `mcp:tools`)
 *   must all be present; the PRM advertises `scopes_supported`.
 * - credentials: never logged; 401s carry only the generic challenge while
 *   the specific `error` stays server-side (returned for tests/logs, never
 *   serialized to the client by `verifyMcpToken`).
 * - sessions: auth never touches `Mcp-Session-Id`; the same token works
 *   across sessions and rotation is purely JWKS-driven.
 */

/** Leeway for exp/nbf comparisons against issuer clock drift (seconds). */
export const OAUTH_CLOCK_SKEW_SECONDS = 60;

/** JWKS refetch interval; rotation inside the window resolves via unknown-kid refetch. */
export const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;

/** JWT algorithms accepted; passed straight to `jose` (no custom crypto). */
export const JWT_ALGORITHMS = ["RS256", "ES256"] as const;

/** Scopes this resource server understands (advertised as `scopes_supported`). */
export const MCP_SCOPES_SUPPORTED = ["mcp:tools"] as const;

/** Human-readable resource name advertised in the PRM document. */
export const OAUTH_RESOURCE_NAME = "Job Hunter MCP";

/** Default required scopes when `OAUTH_REQUIRED_SCOPES` is unset. */
export const OAUTH_DEFAULT_REQUIRED_SCOPES: readonly string[] = MCP_SCOPES_SUPPORTED;

export interface OAuthConfig {
	issuer: string;
	audience?: string;
	jwksUri: string;
}

export interface JwtVerification {
	ok: boolean;
	/** Subject the token was issued for (clientId surface). */
	sub?: string;
	/** Space-split `scope` claim from the verified token. */
	scopes: string[];
	/** Machine-readable failure code; server-side only, never sent to clients. */
	error?: string;
}

export interface McpAuthDecision {
	authorized: boolean;
	/** Generic outcome; safe to branch on. Detail lives in `error`. */
	reason: string;
	/** Specific failure code (`jwt-expired`, …); never serialized to the client. */
	error?: string;
	sub?: string;
	scopes: string[];
}

/**
 * Provider-agnostic env contract: OAUTH_ISSUER (required to enable),
 * OAUTH_AUDIENCE (recommended — Auth0-style issuers mint per audience; when
 * unset the public resource URL is expected instead), OAUTH_JWKS_URI
 * (defaults to <issuer>/.well-known/jwks.json where the provider follows
 * OIDC discovery).
 */
export function oauthConfigFromEnv(env: Record<string, string | undefined> = process.env): OAuthConfig | null {
	const issuer = (env["OAUTH_ISSUER"] ?? "").trim().replace(/\/+$/, "");
	if (!issuer) {
		return null;
	}
	const audience = (env["OAUTH_AUDIENCE"] ?? "").trim() || undefined;
	const jwksUri = (env["OAUTH_JWKS_URI"] ?? "").trim() || `${issuer}/.well-known/jwks.json`;
	return { issuer, audience, jwksUri };
}

/**
 * Required OAuth scopes: space-separated `OAUTH_REQUIRED_SCOPES`. Unset
 * defaults to `mcp:tools` (least privilege); set to an empty string to
 * explicitly opt into validity-only mode with the reasoning recorded in the
 * docs rather than silently.
 */
export function oauthRequiredScopesFromEnv(env: Record<string, string | undefined> = process.env): string[] {
	const raw = env["OAUTH_REQUIRED_SCOPES"];
	if (raw === undefined) {
		return [...OAUTH_DEFAULT_REQUIRED_SCOPES];
	}
	return raw
		.split(" ")
		.map((scope) => scope.trim())
		.filter(Boolean);
}

/** Scopes advertised in the RFC 9728 document. */
export function oauthScopesSupported(): string[] {
	return [...MCP_SCOPES_SUPPORTED];
}

interface Jwk {
	kid?: string;
	kty?: string;
	alg?: string;
	use?: string;
	[key: string]: unknown;
}

interface JwksCacheEntry {
	fetchedAt: number;
	keys: Jwk[];
}

const jwksCache = new Map<string, JwksCacheEntry>();

/** Test seam: drops the in-memory JWKS cache between fixture runs. */
export function resetJwksCacheForTests(): void {
	jwksCache.clear();
}

/** HTTPS everywhere except loopback dev URLs; plain-HTTP prod fails closed. */
export function isHttpsOrLocalhost(urlStr: string): boolean {
	let url: URL;
	try {
		url = new URL(urlStr);
	} catch {
		return false;
	}
	if (url.protocol === "https:") {
		return true;
	}
	if (url.protocol !== "http:") {
		return false;
	}
	const host = url.hostname.toLowerCase();
	return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
}

/** Canonical form for resource/audience comparison (trailing-slash insensitive). */
export function normalizeResource(urlStr: string): string {
	return urlStr.trim().replace(/\/+$/, "");
}

function isAudienceAllowed(aud: unknown, expected: string): boolean {
	const want = normalizeResource(expected);
	if (typeof aud === "string") {
		return normalizeResource(aud) === want;
	}
	if (Array.isArray(aud)) {
		return aud.some((entry) => typeof entry === "string" && normalizeResource(entry) === want);
	}
	return false;
}

async function loadJwks(jwksUri: string, force: boolean): Promise<{ keys: Jwk[] } | { error: string }> {
	const cached = jwksCache.get(jwksUri);
	if (!force && cached && Date.now() - cached.fetchedAt < JWKS_CACHE_TTL_MS) {
		return { keys: cached.keys };
	}
	let response: Response;
	try {
		response = await fetch(jwksUri);
	} catch {
		return { error: "jwks-unreachable" };
	}
	if (!response.ok) {
		return { error: "jwks-unreachable" };
	}
	let body: { keys?: Jwk[] };
	try {
		body = (await response.json()) as { keys?: Jwk[] };
	} catch {
		return { error: "jwks-malformed" };
	}
	if (!Array.isArray(body.keys)) {
		return { error: "jwks-malformed" };
	}
	jwksCache.set(jwksUri, { fetchedAt: Date.now(), keys: body.keys });
	return { keys: body.keys };
}

function decodePart(part: string): Record<string, unknown> | null {
	try {
		return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
	} catch {
		return null;
	}
}

/** Map a `jose` verification throw to the stable server-side error code. */
function mapJoseError(error: unknown): string {
	const code = (error as { code?: unknown })?.code;
	const message = error instanceof Error ? error.message : String(error);
	if (code === "ERR_JWT_EXPIRED" || /expired/i.test(message)) {
		return "jwt-expired";
	}
	if (code === "ERR_JWT_CLAIM_VALIDATION_FAILED" || /claim/i.test(message)) {
		if (/"iss"|issuer/i.test(message)) {
			return "jwt-wrong-issuer";
		}
		if (/"aud"|audience/i.test(message)) {
			return "jwt-wrong-audience";
		}
		if (/"nbf"|not yet valid|nbf/i.test(message)) {
			return "jwt-not-yet-valid";
		}
		if (/"exp"|expiration/i.test(message)) {
			return "jwt-expired";
		}
		return "jwt-invalid-claim";
	}
	if (code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED" || /signature/i.test(message)) {
		return "jwt-bad-signature";
	}
	if (code === "ERR_JWT_INVALID" || /invalid/i.test(message)) {
		return "jwt-malformed";
	}
	return "jwt-invalid";
}

export interface VerifyJwtOptions {
	/** Scopes that must all be present; empty skips the check (explicit opt-out). */
	requiredScopes?: string[];
	/** Public resource URL used as the expected audience when none is configured. */
	expectedResource?: string;
}

/**
 * Verifies a JWT access token with `jose` against the issuer's JWKS:
 * signature, `iss`, `aud` (always enforced — configured audience or the
 * public resource URL), `exp`/`nbf` with clock-skew leeway, then required
 * scopes. Fails closed on every malformed, mismatched, insecure-transport,
 * or unreachable input — never throws, never logs the token.
 */
export async function verifyJwt(
	token: string | undefined,
	config: OAuthConfig,
	nowMs: number = Date.now(),
	options: VerifyJwtOptions = {},
): Promise<JwtVerification> {
	const none: string[] = [];
	if (!token) {
		return { ok: false, scopes: none, error: "jwt-missing" };
	}
	const expectedAudience = (config.audience ?? options.expectedResource ?? "").trim();
	if (!expectedAudience) {
		return { ok: false, scopes: none, error: "jwt-missing-audience" };
	}
	if (!isHttpsOrLocalhost(config.issuer) || !isHttpsOrLocalhost(config.jwksUri)) {
		return { ok: false, scopes: none, error: "jwt-insecure-transport" };
	}
	try {
		// Only enforce transport on URL-shaped audiences; opaque API
		// identifiers (e.g. `my-api`) carry no scheme to check.
		new URL(expectedAudience);
		if (!isHttpsOrLocalhost(expectedAudience)) {
			return { ok: false, scopes: none, error: "jwt-insecure-transport" };
		}
	} catch {
		// Non-URL audience identifier — no transport to check.
	}
	const parts = token.split(".");
	if (parts.length !== 3) {
		return { ok: false, scopes: none, error: "jwt-malformed" };
	}
	const [headerB64] = parts as [string, string, string];
	const header = decodePart(headerB64);
	if (!header) {
		return { ok: false, scopes: none, error: "jwt-malformed" };
	}
	const alg = header["alg"];
	if (typeof alg !== "string" || !(JWT_ALGORITHMS as readonly string[]).includes(alg)) {
		return { ok: false, scopes: none, error: "jwt-unsupported-alg" };
	}
	const kid = header["kid"];
	if (typeof kid !== "string" || kid.length === 0) {
		return { ok: false, scopes: none, error: "jwt-missing-kid" };
	}
	const pick = (keys: Jwk[]): Jwk | undefined =>
		keys.find((key) => key.kid === kid && (!key.use || key.use === "sig") && (!key.alg || key.alg === alg));
	let loaded = await loadJwks(config.jwksUri, false);
	if ("error" in loaded) {
		return { ok: false, scopes: none, error: loaded.error };
	}
	let jwk = pick(loaded.keys);
	if (!jwk) {
		// Rotation inside the cache window: refetch once before giving up.
		loaded = await loadJwks(config.jwksUri, true);
		if ("error" in loaded) {
			return { ok: false, scopes: none, error: loaded.error };
		}
		jwk = pick(loaded.keys);
	}
	if (!jwk) {
		return { ok: false, scopes: none, error: "jwt-unknown-kid" };
	}
	let key: Awaited<ReturnType<typeof importJWK>>;
	try {
		key = await importJWK(jwk as unknown as Parameters<typeof importJWK>[0], alg);
	} catch {
		return { ok: false, scopes: none, error: "jwt-bad-key" };
	}
	let payload: Record<string, unknown>;
	try {
		const verified = await jwtVerify(token, key, {
			issuer: config.issuer,
			audience: expectedAudience,
			algorithms: [...JWT_ALGORITHMS],
			clockTolerance: OAUTH_CLOCK_SKEW_SECONDS,
			currentDate: new Date(nowMs),
		});
		payload = verified.payload as unknown as Record<string, unknown>;
	} catch (error) {
		return { ok: false, scopes: none, error: mapJoseError(error) };
	}
	// Belt-and-braces: `jose` already enforced `aud`, but array-vs-string
	// normalization stays explicit so trailing-slash variants behave.
	if (!isAudienceAllowed(payload["aud"], expectedAudience)) {
		return { ok: false, scopes: none, error: "jwt-wrong-audience" };
	}
	const sub = typeof payload["sub"] === "string" ? (payload["sub"] as string) : undefined;
	const scopeClaim = payload["scope"];
	const scopes =
		typeof scopeClaim === "string" ? scopeClaim.split(" ").map((scope) => scope.trim()).filter(Boolean) : none;
	const required = options.requiredScopes ?? [...OAUTH_DEFAULT_REQUIRED_SCOPES];
	const missing = required.filter((scope) => !scopes.includes(scope));
	if (missing.length > 0) {
		return { ok: false, scopes, error: "jwt-insufficient-scope" };
	}
	return { ok: true, sub, scopes };
}

export interface VerifyMcpAuthOptions {
	expectedToken?: string;
	oauth?: OAuthConfig | null;
	requiredScopes?: string[];
	expectedResource?: string;
}

/**
 * Single precedence point for MCP auth, documented in one place:
 * 1. exact static-bearer match wins (byte-for-byte legacy behavior);
 * 2. configured OAuth issuer verifies the token as a JWT via `jose`;
 * 3. configured static token without a match stays a mismatch;
 * 4. configured OAuth without a token stays closed;
 * 5. neither configured stays open for local dev.
 *
 * `reason` is generic by design (safe to branch on); the specific `error`
 * code is server-side only — `verifyMcpToken` never serializes it, so 401s
 * carry just the `WWW-Authenticate` challenge.
 */
export async function verifyMcpAuth(
	bearerToken: string | undefined,
	options: VerifyMcpAuthOptions,
): Promise<McpAuthDecision> {
	const { expectedToken, oauth, requiredScopes, expectedResource } = options;
	if (expectedToken && bearerToken && bearerToken === expectedToken) {
		return { authorized: true, reason: "bearer-match", scopes: [] };
	}
	if (oauth) {
		const jwt = await verifyJwt(bearerToken, oauth, Date.now(), { requiredScopes, expectedResource });
		if (jwt.ok) {
			return { authorized: true, reason: "jwt-valid", sub: jwt.sub, scopes: jwt.scopes };
		}
		if (bearerToken) {
			return { authorized: false, reason: "jwt-invalid", error: jwt.error ?? "jwt-invalid", scopes: [] };
		}
		if (expectedToken) {
			return { authorized: false, reason: "bearer-mismatch", scopes: [] };
		}
		return { authorized: false, reason: "jwt-invalid", error: jwt.error ?? "jwt-invalid", scopes: [] };
	}
	if (expectedToken) {
		return { authorized: false, reason: "bearer-mismatch", scopes: [] };
	}
	return { authorized: true, reason: "local-dev-open", scopes: [] };
}

/** RFC 9728 protected-resource metadata: resource identifier, its authorization server, and scopes. */
export function oauthResourceMetadata(
	resource: string,
	issuer: string,
): {
	resource: string;
	authorization_servers: string[];
	scopes_supported: string[];
	resource_name: string;
} {
	return {
		resource,
		authorization_servers: [issuer],
		scopes_supported: oauthScopesSupported(),
		resource_name: OAUTH_RESOURCE_NAME,
	};
}
