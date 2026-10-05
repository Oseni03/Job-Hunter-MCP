import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { McpServer } from "@modelcontextprotocol/server";

import { registerSearchJobs } from "@/lib/job-hunter/tools/search-jobs.ts";

type ToolResult = {
	content: { type: string; text: string }[];
	structuredContent?: Record<string, unknown>;
	isError?: boolean;
};

type LooseHandler = (input: Record<string, unknown>, extra: unknown) => Promise<ToolResult>;

function registered(): { name: string; handler: unknown }[] {
	const captured: { name: string; handler: unknown }[] = [];
	const server = {
		registerTool(name: string, _config: unknown, handler: unknown) {
			captured.push({ name, handler });
		},
	} as unknown as McpServer;
	registerSearchJobs(server);
	return captured;
}

const ARGS = {
	keywords: "Python ML Engineer",
	location: "Berlin, Germany",
	limit: 10,
	// No scraperFetch injection at the tool boundary: tests pin the
	// no-network paths (registration, honest errors), while planning
	// behavior is covered at the planSearch level with stub fetchers.
	scraperAdapters: [] as string[],
};

describe("search-jobs tool", () => {
	it("registers under search-jobs", () => {
		const tools = registered();
		assert.equal(tools.length, 1);
		assert.equal(tools[0].name, "search-jobs");
	});

	it("returns an honest no-source error when scraping is disabled, inventing nothing", async () => {
		const tools = registered();
		const result = await (tools[0].handler as LooseHandler)(ARGS, {});
		assert.equal(result.isError, undefined);
		const structured = result.structuredContent as Record<string, unknown>;
		assert.deepEqual(structured["candidates"], []);
		assert.ok((structured["errors"] as string[]).length > 0, "expected an explicit no-source error");
		assert.ok(result.content[0].text.includes("analyze-job"));
	});

	it("passes caller-held dedupe stores through without owning state", async () => {
		const tools = registered();
		const result = await (tools[0].handler as LooseHandler)({ ...ARGS, seenKeys: ["acme_ml-engineer"] }, {});
		const structured = result.structuredContent as Record<string, unknown>;
		assert.deepEqual(structured["candidates"], []);
		assert.equal(structured["seenSkipped"], 0, "nothing to dedupe against, nothing skipped");
	});
});
