import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { verifyBearerToken } from "../lib/auth.ts";

describe("verifyBearerToken", () => {
	it("leaves local dev open when no token is configured", () => {
		const result = verifyBearerToken(undefined, undefined);
		assert.equal(result.authorized, true);
	});

	it("authorizes the configured bearer token", () => {
		const result = verifyBearerToken("secret-token", "secret-token");
		assert.equal(result.authorized, true);
	});

	it("rejects a wrong bearer token", () => {
		const result = verifyBearerToken("wrong", "secret-token");
		assert.equal(result.authorized, false);
	});

	it("rejects a missing bearer token when one is configured", () => {
		const result = verifyBearerToken(undefined, "secret-token");
		assert.equal(result.authorized, false);
	});

	it("rejects an empty bearer token when one is configured", () => {
		const result = verifyBearerToken("", "secret-token");
		assert.equal(result.authorized, false);
	});
});
