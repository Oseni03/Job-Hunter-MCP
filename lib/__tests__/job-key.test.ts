import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isCanonical, makeJobSlug, makeKey } from "../job-key.ts";

describe("makeKey", () => {
	it("builds the canonical company_role key for a simple posting", () => {
		assert.equal(makeKey("Acme Corp", "SOC Analyst (L2)"), "acme-corp_soc-analyst-l2");
	});

	it("caps long slugs deterministically with a hash of the full slug", () => {
		assert.equal(
			makeKey(
				"International Business Machines Corporation Global Services Division",
				"Senior Machine Learning Engineer for Fraud Detection and Risk Analytics Platform",
			),
			"international-business-machines-corporat-6d4995_senior-machine-learning-engineer-for-fraud-detection-and-ris-8b0543",
		);
	});

	it("falls back to a hashed company slug for non-Latin names", () => {
		assert.equal(makeKey("丹麦银行", "Senior Engineer"), "company-d7c257_senior-engineer");
	});

	it("falls back to the portal numeric id for a non-Latin title", () => {
		assert.equal(
			makeKey("Acme", "工程师", "https://example.com/jobs/12345678"),
			"acme_12345678",
		);
	});
});

describe("makeJobSlug", () => {
	it("returns an empty slug when company, role, and url are all blank", () => {
		assert.equal(makeJobSlug("", "", ""), "");
		assert.equal(makeJobSlug(undefined, undefined), "");
		assert.equal(makeJobSlug("  ", "  "), "");
	});

	it("keeps the portal-id fallback when only a url-bearing title is missing", () => {
		assert.equal(makeJobSlug("", "", "https://example.com/jobs/12345678"), "unknown-company_12345678");
	});

	it("matches makeKey when company and role are given", () => {
		assert.equal(
			makeJobSlug("Acme Corp", "SOC Analyst (L2)"),
			makeKey("Acme Corp", "SOC Analyst (L2)"),
		);
	});
});

describe("isCanonical", () => {
	it("accepts canonical keys", () => {
		assert.equal(isCanonical("acme-corp_soc-analyst-l2"), true);
	});

	it("rejects empty, legacy three-part, and malformed keys", () => {
		assert.equal(isCanonical(""), false);
		assert.equal(isCanonical("acme_corp_copenhagen"), false);
		assert.equal(isCanonical("Acme Corp_soc"), false);
	});
});
