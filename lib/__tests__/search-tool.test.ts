import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { McpServer } from "@modelcontextprotocol/server";

import { registerSearchJobs } from "../mcp/tools/search-jobs.ts";

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
	profile: {
		name: "Test Candidate",
		primarySkills: ["Python", "SQL"],
		strongDomains: ["fraud detection"],
		careerGoals: ["ML Engineer"],
		languages: [{ language: "English", level: "C1" }],
	},
	portalResults: [
		{
			title: "ML Engineer",
			company: "Acme",
			url: "https://example.com/jobs/1",
			description: "Python and SQL for fraud detection.",
			postedDate: "2026-09-20",
		},
	],
};

describe("search-jobs tool", () => {
	it("registers under search-jobs", () => {
		const tools = registered();
		assert.equal(tools.length, 1);
		assert.equal(tools[0].name, "search-jobs");
	});

	it("plans caller-supplied portal output with stable keys", async () => {
		const tools = registered();
		const result = await (tools[0].handler as LooseHandler)(ARGS, {});
		assert.equal(result.isError, undefined);
		const structured = result.structuredContent as Record<string, unknown>;
		const candidates = structured["candidates"] as { key: string; url: string }[];
		assert.equal(candidates.length, 1);
		assert.match(candidates[0].key, /^[a-z0-9][a-z0-9-]*_[a-z0-9][a-z0-9-]*$/);
		assert.ok(result.content[0].text.includes("evaluate-job"));
	});

	it("dedupes caller-passed seen keys without owning state", async () => {
		const tools = registered();
		const first = await (tools[0].handler as LooseHandler)(ARGS, {});
		const key = (first.structuredContent as Record<string, unknown>)["candidates"] as { key: string }[];
		const second = await (tools[0].handler as LooseHandler)({ ...ARGS, seenKeys: [key[0].key] }, {});
		const structured = second.structuredContent as Record<string, unknown>;
		assert.deepEqual(structured["candidates"], []);
		assert.equal(structured["seenSkipped"], 1);
	});

	it("plans empty caller-supplied output without fetching or inventing", async () => {
		const tools = registered();
		const result = await (tools[0].handler as LooseHandler)({ ...ARGS, portalResults: [] }, {});
		const structured = result.structuredContent as Record<string, unknown>;
		assert.deepEqual(structured["candidates"], []);
		assert.deepEqual(structured["sources"], ["portal-live"]);
	});
});
