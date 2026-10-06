import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { McpServer } from "@modelcontextprotocol/server";

import { registerDraftApplicationAnswers } from "@/lib/job-hunter/tools/draft-application-answers.ts";

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
	registerDraftApplicationAnswers(server);
	return captured;
}

const ARGS = {
	company: "Acme",
	projects: [
		{
			name: "Fraud scoring pipeline",
			role: "ML Engineer",
			dates: "2024-present",
			description: "Built a Python scoring pipeline for fraud detection with SQL features.",
		},
	],
	targetWords: 200,
};

describe("draft-application-answers tool", () => {
	it("registers under draft-application-answers", () => {
		const tools = registered();
		assert.equal(tools.length, 1);
		assert.equal(tools[0].name, "draft-application-answers");
	});

	it("drafts nothing without a stored profile instead of inventing", async () => {
		const tools = registered();
		const result = await (tools[0].handler as LooseHandler)(ARGS, {});
		assert.equal(result.isError, undefined);
		const structured = result.structuredContent as Record<string, unknown>;
		assert.equal(structured["filePath"], "documents/portal-fields.md");
		assert.deepEqual(structured["selfIntros"], []);
		assert.deepEqual(structured["pitches"], []);
		assert.deepEqual(structured["ungrounded"], []);
		assert.deepEqual(JSON.parse(result.content[0].text), JSON.parse(JSON.stringify(structured)));
	});
});
