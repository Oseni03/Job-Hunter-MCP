import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	BAD_VERSION_ID_ERROR,
	EMPTY_RENDER_SOURCE_ERROR,
	pdfCachePathFor,
	recompilePlanFor,
} from "@/lib/job-hunter/resume-version.ts";

describe("resumeversion ephemeral pdf (ticket 04)", () => {
	it("plans a host recompile cached under generated keyed by version", () => {
		const result = recompilePlanFor({ id: 7, jobKey: "acme_senior-ml-engineer", html: "<p>X</p>" });
		assert.equal(result.ok, true);
		if (!result.ok) return;
		assert.equal(result.plan.versionId, 7);
		assert.equal(result.plan.htmlPath, "cv/main_acme_senior-ml-engineer.html");
		assert.equal(result.plan.renderer, "puppeteer");
		assert.equal(result.plan.cachePath, "generated/resume/7.pdf");
		assert.ok(!("bytes" in result.plan), "no PDF bytes travel with the plan");
	});

	it("keys each version to its own cache path", () => {
		assert.deepEqual(pdfCachePathFor(1), { ok: true, cachePath: "generated/resume/1.pdf" });
		assert.deepEqual(pdfCachePathFor(2), { ok: true, cachePath: "generated/resume/2.pdf" });
	});

	it("fails loudly on empty source with no plan", () => {
		const result = recompilePlanFor({ id: 7, jobKey: "acme_role", html: "  \n " });
		assert.equal(result.ok, false);
		if (result.ok) return;
		assert.equal(result.error, EMPTY_RENDER_SOURCE_ERROR);
		assert.ok(!("plan" in result));
	});

	it("fails loudly on bad version ids", () => {
		for (const id of [0, -3, 1.5, Number.NaN]) {
			const cached = pdfCachePathFor(id);
			assert.equal(cached.ok, false);
			if (cached.ok) return;
			assert.equal(cached.error, BAD_VERSION_ID_ERROR);
			const planned = recompilePlanFor({ id, jobKey: "acme_role", html: "<p>X</p>" });
			assert.equal(planned.ok, false);
		}
	});
});
