import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { McpServer } from "@modelcontextprotocol/server";

import { DEFAULT_PROFILE } from "@/lib/job-hunter/profile.ts";
import { loadActiveProfile, resolveActiveProfile, userIdFromRequest } from "@/lib/job-hunter/request-profile.ts";
import { registerJobHunterResources } from "@/lib/job-hunter/server.ts";

// Request-scoped profile resolution: identity comes from the request
// context (extra.http.authInfo.clientId), never from tool inputs.
describe("userIdFromRequest", () => {
	it("extracts the client id from the request context", () => {
		assert.equal(userIdFromRequest({ http: { authInfo: { clientId: "user-123", scopes: [], token: "t" } } }), "user-123");
	});

	it("rejects anonymous and placeholder identities", () => {
		assert.equal(userIdFromRequest(undefined), undefined);
		assert.equal(userIdFromRequest(null), undefined);
		assert.equal(userIdFromRequest({}), undefined);
		assert.equal(userIdFromRequest({ http: {} }), undefined);
		assert.equal(userIdFromRequest({ http: { authInfo: {} } }), undefined);
		assert.equal(userIdFromRequest({ http: { authInfo: { clientId: 42 } } }), undefined);
		for (const placeholder of ["", "  ", "local-user", "job-hunter-client", "static-bearer", "local-dev"]) {
			assert.equal(userIdFromRequest({ http: { authInfo: { clientId: placeholder } } }), undefined, placeholder);
		}
	});

	it("trims a padded client id", () => {
		assert.equal(userIdFromRequest({ http: { authInfo: { clientId: "  user-123  " } } }), "user-123");
	});
});

describe("loadActiveProfile", () => {
	it("degrades to the embedded default without identity or database", async () => {
		for (const extra of [undefined, {}, { http: { authInfo: { clientId: "user-123" } } }]) {
			const profile = await loadActiveProfile(extra);
			assert.deepEqual(profile, DEFAULT_PROFILE);
		}
	});

	it("reports storage provenance alongside the profile", async () => {
		const resolved = await resolveActiveProfile({});
		assert.equal(resolved.stored, false);
		assert.deepEqual(resolved.profile, DEFAULT_PROFILE);
	});
});

describe("candidate-profile resource", () => {
	function readCallback(): (uri: URL, ctx: unknown) => Promise<{ contents: { text: string }[] }> {
		const captured: { name: string; callback: unknown }[] = [];
		const server = {
			registerTool() {},
			registerResource(name: string, _uri: unknown, _config: unknown, callback: unknown) {
				captured.push({ name, callback });
			},
			registerPrompt() {},
		} as unknown as McpServer;
		registerJobHunterResources(server);
		const entry = captured.find((item) => item.name === "candidate-profile");
		assert.ok(entry, "candidate-profile registered");
		return entry.callback as (uri: URL, ctx: unknown) => Promise<{ contents: { text: string }[] }>;
	}

	it("serves embedded defaults without an authenticated caller", async () => {
		const read = readCallback();
		const result = await read(new URL("job-hunter://profile/candidate"), {});
		assert.ok(result.contents[0].text.includes("# Candidate profile (server default v1)"));
		assert.ok(result.contents[0].text.includes("Embedded defaults; run setup-profile"));
	});
});
