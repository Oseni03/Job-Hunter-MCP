import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { McpServer } from "@modelcontextprotocol/server";

import { registerCareerStrategy } from "@/lib/job-hunter/tools/career-strategy.ts";

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
	registerCareerStrategy(server);
	return captured;
}

const ARGS = {
	focusAreas: ["Astronaut"],
	evaluationSummary: { fitScore: 84, verdict: "Good Fit", gaps: ["Kubernetes"] },
};

describe("career-strategy tool", () => {
	it("registers under career-strategy", () => {
		const tools = registered();
		assert.equal(tools.length, 1);
		assert.equal(tools[0].name, "career-strategy");
	});

	it("invents no directions without a stored profile and skips nothing silently", async () => {
		const tools = registered();
		const result = await (tools[0].handler as LooseHandler)(ARGS, {});
		assert.equal(result.isError, undefined);
		const structured = result.structuredContent as Record<string, unknown>;
		assert.deepEqual(structured["directions"], []);
		assert.deepEqual(structured["skipped"], []);
		assert.deepEqual(structured["avoidNotes"], []);
		assert.deepEqual(JSON.parse(result.content[0].text), JSON.parse(JSON.stringify(structured)));
	});
});
