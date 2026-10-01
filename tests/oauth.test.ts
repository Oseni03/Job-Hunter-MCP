import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";

import { withMcpAuth } from "mcp-handler";

import {
	JWKS_CACHE_TTL_MS,
	OAUTH_CLOCK_SKEW_SECONDS,
	OAUTH_RESOURCE_NAME,
	isHttpsOrLocalhost,
	oauthConfigFromEnv,
	oauthRequiredScopesFromEnv,
	oauthResourceMetadata,
	oauthScopesSupported,
	resetJwksCacheForTests,
	verifyJwt,
	verifyMcpAuth,
} from "@/lib/oauth.ts";
import { GET as metadataGet } from "@/app/.well-known/oauth-protected-resource/route.ts";

const NOW_MS = 1_750_000_000_000;
const NOW_SEC = Math.floor(NOW_MS / 1000);

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const { privateKey: otherKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PUBLIC_JWK = { ...(publicKey.export({ format: "jwk" }) as Record<string, unknown>), kid: "test-key-1" };

function b64url(text: string): string {
	return Buffer.from(text, "utf8").toString("base64url");
}

function mint(
	payload: Record<string, unknown>,
	options: { key?: typeof privateKey; alg?: string; kid?: string } = {},
): string {
	const { key = privateKey, alg = "RS256", kid = "test-key-1" } = options;
	const header = b64url(JSON.stringify({ alg, typ: "JWT", kid }));
	const body = b64url(JSON.stringify(payload));
	const signer = createSign(alg === "RS256" ? "RSA-SHA256" : "sha256");
	signer.update(`${header}.${body}`, "ascii");
	signer.end();
	return `${header}.${body}.${signer.sign(key, "base64url")}`;
}

let ISSUER_SEQ = 0;
function issuer(): string {
	ISSUER_SEQ += 1;
	return `https://issuer.test/${ISSUER_SEQ}`;
}

const AUDIENCE = "https://mcp.test/mcp";

function validPayload(iss: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		iss,
		aud: AUDIENCE,
		sub: "user-1",
		scope: "mcp:tools read write",
		iat: NOW_SEC - 10,
		exp: NOW_SEC + 300,
		...overrides,
	};
}

function stubFetch(keysOrSequence: Record<string, unknown>[] | Record<string, unknown>[][]): {
	calls: string[];
	restore: () => void;
} {
	const realFetch = globalThis.fetch;
	const sequence = (Array.isArray(keysOrSequence[0]) ? keysOrSequence : [keysOrSequence]) as Record<
		string,
		unknown
	>[][];
	const calls: string[] = [];
	globalThis.fetch = (async (input: string | URL | Request) => {
		const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
		calls.push(url);
		const keys = sequence[Math.min(calls.length - 1, sequence.length - 1)] ?? [];
		return { ok: true, json: async () => ({ keys }) };
	}) as typeof fetch;
	return { calls, restore: () => void (globalThis.fetch = realFetch) };
}

beforeEach(() => {
	resetJwksCacheForTests();
});

describe("oauthConfigFromEnv", () => {
	it("parses the provider-agnostic env contract with OIDC JWKS default", () => {
		const config = oauthConfigFromEnv({
			OAUTH_ISSUER: "https://login.example.com/",
			OAUTH_AUDIENCE: AUDIENCE,
		});
		assert.ok(config, "expected a config");
		assert.equal(config.issuer, "https://login.example.com");
		assert.equal(config.audience, AUDIENCE);
		assert.equal(config.jwksUri, "https://login.example.com/.well-known/jwks.json");
	});

	it("honors an explicit JWKS URI and stays null without an issuer", () => {
		const custom = oauthConfigFromEnv({
			OAUTH_ISSUER: "https://login.example.com",
			OAUTH_JWKS_URI: "https://login.example.com/keys.json",
		});
		assert.equal(custom?.jwksUri, "https://login.example.com/keys.json");
		assert.equal(oauthConfigFromEnv({}), null);
	});
});

describe("oauth scopes", () => {
	it("defaults required scopes to mcp:tools and advertises them", () => {
		assert.deepEqual(oauthRequiredScopesFromEnv({}), ["mcp:tools"]);
		assert.deepEqual(oauthScopesSupported(), ["mcp:tools"]);
	});

	it("parses OAUTH_REQUIRED_SCOPES and honors an explicit empty opt-out", () => {
		assert.deepEqual(oauthRequiredScopesFromEnv({ OAUTH_REQUIRED_SCOPES: "mcp:tools extra" }), [
			"mcp:tools",
			"extra",
		]);
		assert.deepEqual(oauthRequiredScopesFromEnv({ OAUTH_REQUIRED_SCOPES: "   " }), []);
	});
});

describe("transport policy", () => {
	it("requires HTTPS outside loopback", () => {
		assert.equal(isHttpsOrLocalhost("https://login.example.com"), true);
		assert.equal(isHttpsOrLocalhost("http://localhost:8080/realms/master"), true);
		assert.equal(isHttpsOrLocalhost("http://127.0.0.1:8080/x"), true);
		assert.equal(isHttpsOrLocalhost("http://evil.test/"), false);
		assert.equal(isHttpsOrLocalhost("not-a-url"), false);
	});

	it("fails closed on plain-HTTP issuers without touching JWKS", async () => {
		const config = {
			issuer: "http://evil.test/realms/master",
			audience: AUDIENCE,
			jwksUri: "http://evil.test/keys.json",
		};
		let fetched = false;
		const realFetch = globalThis.fetch;
		globalThis.fetch = (async () => {
			fetched = true;
			return { ok: true, json: async () => ({ keys: [] }) };
		}) as unknown as typeof fetch;
		try {
			const result = await verifyJwt(mint(validPayload(config.issuer)), config, NOW_MS, { requiredScopes: [] });
			assert.equal(result.ok, false);
			assert.equal(result.error, "jwt-insecure-transport");
			assert.equal(fetched, false);
		} finally {
			globalThis.fetch = realFetch;
		}
	});

	it("allows loopback HTTP for local Keycloak-style dev", async () => {
		const iss = "http://localhost:8080/realms/master";
		const config = { issuer: iss, audience: AUDIENCE, jwksUri: `${iss}/keys.json` };
		const { restore } = stubFetch([PUBLIC_JWK]);
		try {
			const result = await verifyJwt(mint(validPayload(iss)), config, NOW_MS, { requiredScopes: [] });
			assert.equal(result.ok, true);
		} finally {
			restore();
		}
	});
});

describe("verifyJwt", () => {
	it("accepts a valid token with subject and scopes via jose", async () => {
		const iss = issuer();
		const { restore } = stubFetch([PUBLIC_JWK]);
		try {
			const result = await verifyJwt(mint(validPayload(iss)), { issuer: iss, audience: AUDIENCE, jwksUri: `${iss}/.well-known/jwks.json` }, NOW_MS);
			assert.equal(result.ok, true);
			assert.equal(result.sub, "user-1");
			assert.deepEqual(result.scopes, ["mcp:tools", "read", "write"]);
		} finally {
			restore();
		}
	});

	it("rejects wrong-issuer, wrong-audience, and expired tokens", async () => {
		const iss = issuer();
		const config = { issuer: iss, audience: AUDIENCE, jwksUri: `${iss}/.well-known/jwks.json` };
		const { restore } = stubFetch([PUBLIC_JWK]);
		try {
			const wrongIss = await verifyJwt(mint(validPayload("https://evil.test")), config, NOW_MS);
			assert.equal(wrongIss.ok, false);
			assert.equal(wrongIss.error, "jwt-wrong-issuer");

			const wrongAud = await verifyJwt(mint(validPayload(iss, { aud: "https://other.test" })), config, NOW_MS);
			assert.equal(wrongAud.ok, false);
			assert.equal(wrongAud.error, "jwt-wrong-audience");

			const expired = await verifyJwt(
				mint(validPayload(iss, { exp: NOW_SEC - OAUTH_CLOCK_SKEW_SECONDS - 10 })),
				config,
				NOW_MS,
			);
			assert.equal(expired.ok, false);
			assert.equal(expired.error, "jwt-expired");

			const withinSkew = await verifyJwt(
				mint(validPayload(iss, { exp: NOW_SEC - OAUTH_CLOCK_SKEW_SECONDS + 10 })),
				config,
				NOW_MS,
			);
			assert.equal(withinSkew.ok, true, "clock-skew leeway covers slight drift");
		} finally {
			restore();
		}
	});

	it("rejects bad signatures, unknown algorithms, and missing kids", async () => {
		const iss = issuer();
		const config = { issuer: iss, audience: AUDIENCE, jwksUri: `${iss}/.well-known/jwks.json` };
		const { restore } = stubFetch([PUBLIC_JWK]);
		try {
			const forged = await verifyJwt(mint(validPayload(iss), { key: otherKey }), config, NOW_MS);
			assert.equal(forged.ok, false);
			assert.equal(forged.error, "jwt-bad-signature");

			const [, payloadB64] = mint(validPayload(iss)).split(".");
			const noneAlg = `${b64url(JSON.stringify({ alg: "none", typ: "JWT" }))}.${payloadB64}.`;
			const algRejected = await verifyJwt(noneAlg, config, NOW_MS);
			assert.equal(algRejected.ok, false);
			assert.equal(algRejected.error, "jwt-unsupported-alg");

			const noKid = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${payloadB64}.sig`;
			const kidRejected = await verifyJwt(noKid, config, NOW_MS);
			assert.equal(kidRejected.ok, false);
			assert.equal(kidRejected.error, "jwt-missing-kid");
		} finally {
			restore();
		}
	});

	it("enforces required scopes with least privilege", async () => {
		const iss = issuer();
		const config = { issuer: iss, audience: AUDIENCE, jwksUri: `${iss}/.well-known/jwks.json` };
		const { restore } = stubFetch([PUBLIC_JWK]);
		try {
			const scopedOut = await verifyJwt(mint(validPayload(iss, { scope: "read write" })), config, NOW_MS);
			assert.equal(scopedOut.ok, false);
			assert.equal(scopedOut.error, "jwt-insufficient-scope");

			const optedOut = await verifyJwt(mint(validPayload(iss, { scope: "read" })), config, NOW_MS, {
				requiredScopes: [],
			});
			assert.equal(optedOut.ok, true, "explicit empty requiredScopes opts out");
		} finally {
			restore();
		}
	});

	it("falls back to the public resource URL when no audience is configured", async () => {
		const iss = issuer();
		const resource = "https://mcp.test/mcp";
		const config = { issuer: iss, jwksUri: `${iss}/.well-known/jwks.json` };
		const { restore } = stubFetch([PUBLIC_JWK]);
		try {
			const matched = await verifyJwt(mint(validPayload(iss, { aud: resource })), config, NOW_MS, {
				expectedResource: resource,
			});
			assert.equal(matched.ok, true);

			const mismatched = await verifyJwt(mint(validPayload(iss, { aud: "https://other.test" })), config, NOW_MS, {
				expectedResource: resource,
			});
			assert.equal(mismatched.ok, false);
			assert.equal(mismatched.error, "jwt-wrong-audience");

			const missing = await verifyJwt(mint(validPayload(iss)), config, NOW_MS);
			assert.equal(missing.ok, false);
			assert.equal(missing.error, "jwt-missing-audience");
		} finally {
			restore();
		}
	});

	it("refetches once on unknown kid so rotation needs no restart", async () => {
		const iss = issuer();
		const config = { issuer: iss, audience: AUDIENCE, jwksUri: `${iss}/.well-known/jwks.json` };
		const rotatedJwk = { ...(publicKey.export({ format: "jwk" }) as Record<string, unknown>), kid: "test-key-2" };
		const { calls, restore } = stubFetch([[{ ...PUBLIC_JWK, kid: "stale-key" }], [rotatedJwk]]);
		try {
			const result = await verifyJwt(
				mint(validPayload(iss), { kid: "test-key-2" }),
				config,
				NOW_MS,
			);
			assert.equal(result.ok, true, "rotation resolves after one refetch");
			assert.equal(calls.length, 2);
		} finally {
			restore();
		}
	});

	it("caches JWKS within the TTL and fails closed when unreachable", async () => {
		const iss = issuer();
		const config = { issuer: iss, audience: AUDIENCE, jwksUri: `${iss}/.well-known/jwks.json` };
		assert.ok(JWKS_CACHE_TTL_MS > 0, "named cache TTL present");
		const { calls, restore } = stubFetch([PUBLIC_JWK]);
		try {
			const first = await verifyJwt(mint(validPayload(iss)), config, NOW_MS);
			const second = await verifyJwt(mint(validPayload(iss)), config, NOW_MS);
			assert.equal(first.ok, true);
			assert.equal(second.ok, true);
			assert.equal(calls.length, 1, "second verify rides the in-memory cache");
		} finally {
			restore();
		}
		const realFetch = globalThis.fetch;
		globalThis.fetch = (async () => {
			throw new Error("down");
		}) as unknown as typeof fetch;
		try {
			resetJwksCacheForTests();
			const closed = await verifyJwt(mint(validPayload(issuer())), config, NOW_MS);
			assert.equal(closed.ok, false);
			assert.equal(closed.error, "jwks-unreachable");
		} finally {
			globalThis.fetch = realFetch;
		}
	});
});

describe("verifyMcpAuth precedence", () => {
	it("keeps the exact-match bearer path byte-for-byte", async () => {
		const match = await verifyMcpAuth("secret", { expectedToken: "secret", oauth: null });
		assert.deepEqual({ authorized: match.authorized, reason: match.reason }, { authorized: true, reason: "bearer-match" });
		const mismatch = await verifyMcpAuth("wrong", { expectedToken: "secret", oauth: null });
		assert.deepEqual({ authorized: mismatch.authorized, reason: mismatch.reason }, { authorized: false, reason: "bearer-mismatch" });
		const open = await verifyMcpAuth(undefined, {});
		assert.deepEqual({ authorized: open.authorized, reason: open.reason }, { authorized: true, reason: "local-dev-open" });
	});

	it("prefers the static bearer when both shapes are configured", async () => {
		const iss = issuer();
		let fetched = false;
		const realFetch = globalThis.fetch;
		globalThis.fetch = (async () => {
			fetched = true;
			return { ok: true, json: async () => ({ keys: [] }) };
		}) as unknown as typeof fetch;
		try {
			const decision = await verifyMcpAuth("secret", {
				expectedToken: "secret",
				oauth: { issuer: iss, audience: AUDIENCE, jwksUri: `${iss}/.well-known/jwks.json` },
			});
			assert.equal(decision.authorized, true);
			assert.equal(decision.reason, "bearer-match");
			assert.equal(fetched, false, "static match never touches JWKS");
		} finally {
			globalThis.fetch = realFetch;
		}
	});

	it("stays closed on OAuth alone without a token and keeps detail server-side", async () => {
		const iss = issuer();
		const decision = await verifyMcpAuth(undefined, {
			oauth: { issuer: iss, audience: AUDIENCE, jwksUri: `${iss}/.well-known/jwks.json` },
		});
		assert.equal(decision.authorized, false);
		assert.equal(decision.reason, "jwt-invalid");
		assert.equal(decision.error, "jwt-missing");
	});

	it("returns a generic reason on JWT failure so 401s never leak detail", async () => {
		const iss = issuer();
		const config = { issuer: iss, audience: AUDIENCE, jwksUri: `${iss}/.well-known/jwks.json` };
		const { restore } = stubFetch([PUBLIC_JWK]);
		try {
			const decision = await verifyMcpAuth(mint(validPayload("https://evil.test")), { oauth: config });
			assert.equal(decision.authorized, false);
			assert.equal(decision.reason, "jwt-invalid");
			assert.equal(decision.error, "jwt-wrong-issuer");
		} finally {
			restore();
		}
	});
});

describe("oauth discovery metadata", () => {
	it("returns the public MCP URL with its authorization server and scopes", () => {
		const metadata = oauthResourceMetadata("https://mcp.test/mcp", "https://login.example.com");
		assert.equal(metadata.resource, "https://mcp.test/mcp");
		assert.deepEqual(metadata.authorization_servers, ["https://login.example.com"]);
		assert.deepEqual(metadata.scopes_supported, ["mcp:tools"]);
		assert.equal(metadata.resource_name, OAUTH_RESOURCE_NAME);
	});

	it("emits the WWW-Authenticate challenge with resource metadata on 401", async () => {
		const wrapped = withMcpAuth(
			async () => new Response("ok"),
			async () => undefined,
			{ required: true },
		);
		const response = await wrapped(new Request("https://mcp.test/mcp", { method: "POST" }));
		assert.equal(response.status, 401);
		const challenge = response.headers.get("www-authenticate") ?? "";
		assert.ok(challenge.includes("Bearer"), `expected a Bearer challenge, got: ${challenge}`);
		assert.ok(challenge.includes("resource_metadata"), `expected discovery metadata, got: ${challenge}`);
		assert.ok(
			challenge.includes(".well-known/oauth-protected-resource"),
			`expected the metadata path, got: ${challenge}`,
		);
	});

	it("serves the configured identifiers from the metadata endpoint", async () => {
		const saved = { ...process.env };
		try {
			process.env["OAUTH_ISSUER"] = "https://login.example.com";
			process.env["MCP_PUBLIC_URL"] = "https://mcp.test/mcp";
			const response = metadataGet(new Request("https://mcp.test/.well-known/oauth-protected-resource"));
			assert.equal(response.status, 200);
			const body = (await response.json()) as {
				resource: string;
				authorization_servers: string[];
				scopes_supported: string[];
				resource_name: string;
			};
			assert.equal(body.resource, "https://mcp.test/mcp");
			assert.deepEqual(body.authorization_servers, ["https://login.example.com"]);
			assert.deepEqual(body.scopes_supported, ["mcp:tools"]);
			assert.equal(body.resource_name, OAUTH_RESOURCE_NAME);
		} finally {
			process.env = saved;
		}
	});

	it("returns 404 from the metadata endpoint without an issuer", async () => {
		const saved = { ...process.env };
		try {
			delete process.env["OAUTH_ISSUER"];
			const response = metadataGet(new Request("https://mcp.test/.well-known/oauth-protected-resource"));
			assert.equal(response.status, 404);
		} finally {
			process.env = saved;
		}
	});
});
