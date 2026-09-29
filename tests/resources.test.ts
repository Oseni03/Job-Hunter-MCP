import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	getCvVariant,
	getPrompt,
	getResource,
	listCvVariants,
	listPrompts,
	listResources,
	resolveBaseContent,
} from "@/lib/resources.ts";

describe("listResources", () => {
	it("exposes the six versioned materials with stable URIs", () => {
		const resources = listResources();
		const uris = resources.map((resource) => resource.uri);
		for (const uri of [
			"job-hunter://profile/candidate",
			"job-hunter://profile/behavioral",
			"job-hunter://rules/writing",
			"job-hunter://framework/evaluation",
			"job-hunter://templates/cv",
			"job-hunter://templates/cover-letter",
		]) {
			assert.ok(uris.includes(uri), `missing resource ${uri}`);
		}
		for (const resource of resources) {
			assert.ok(resource.version >= 1, `${resource.uri} carries a version`);
			assert.ok(resource.name.length >= 2, `${resource.uri} has a name`);
		}
	});
});

describe("getResource", () => {
	it("returns the private server default with its version", () => {
		const result = getResource("job-hunter://framework/evaluation");
		assert.equal(result.ok, true);
		assert.ok(result.ok && result.text.includes("Technical"), "framework default names dimensions");
		assert.ok(result.ok && result.version >= 1, "version marked on every resource");
	});

	it("lets a per-call override win everywhere", () => {
		const result = getResource("job-hunter://rules/writing", "Custom house style: Oxford commas.");
		assert.equal(result.ok, true);
		assert.ok(result.ok && result.overridden, "override flagged");
		assert.equal(result.ok && result.text, "Custom house style: Oxford commas.");
	});

	it("degrades to an explicit message for unknown URIs, never a guess", () => {
		const result = getResource("job-hunter://nope/missing");
		assert.equal(result.ok, false);
		assert.ok(!result.ok && result.error.includes("job-hunter://nope/missing"), "names the missing entry");
	});
});

describe("CV variants", () => {
	it("lists base variants for fetch", () => {
		const variants = listCvVariants();
		assert.ok(variants.length > 0, "at least one base variant");
		for (const variant of variants) {
			assert.ok(variant.name.length >= 2 && variant.description.length >= 2, "listable with description");
		}
	});

	it("fetches a variant by name", () => {
		const first = listCvVariants()[0].name;
		const result = getCvVariant(first);
		assert.equal(result.ok, true);
		assert.ok(result.ok && result.text.length > 0, "variant carries content");
	});

	it("passes caller-supplied base content straight through", () => {
		const result = resolveBaseContent("moderncv-banking", "\\documentclass{moderncv} % caller master");
		assert.equal(result.ok, true);
		assert.ok(result.ok && result.text.includes("caller master"), "caller content wins over server disk");
		assert.ok(result.ok && result.fromCaller, "passthrough flagged");
	});

	it("falls back to the server variant when the caller supplies nothing", () => {
		const first = listCvVariants()[0].name;
		const result = resolveBaseContent(first);
		assert.equal(result.ok, true);
		assert.ok(result.ok && !result.fromCaller, "server fallback flagged");
	});

	it("errors explicitly for unknown variants", () => {
		const result = getCvVariant("no-such-variant");
		assert.equal(result.ok, false);
		assert.ok(!result.ok && result.error.includes("no-such-variant"), "names the missing variant");
	});
});

describe("prompts", () => {
	it("lists the workflow prompts with versions", () => {
		const prompts = listPrompts();
		const names = prompts.map((prompt) => prompt.name);
		for (const name of ["apply", "rank", "interview", "scrape-health", "tailor-flow"]) {
			assert.ok(names.includes(name), `missing prompt ${name}`);
		}
		for (const prompt of prompts) {
			assert.ok(prompt.version >= 1, `${prompt.name} carries a version`);
		}
	});

	it("lets a per-call override win for prompts too", () => {
		const result = getPrompt("apply", "Custom checklist.");
		assert.equal(result.ok, true);
		assert.ok(result.ok && result.overridden, "override flagged");
		assert.equal(result.ok && result.text, "Custom checklist.");
	});

	it("errors explicitly for unknown prompts", () => {
		const result = getPrompt("no-such-prompt");
		assert.equal(result.ok, false);
	});
});
