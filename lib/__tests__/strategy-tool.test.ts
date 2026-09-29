import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { McpServer } from "@modelcontextprotocol/server";

import { registerCareerStrategy } from "../mcp/tools/career-strategy.ts";

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
	profile: {
		name: "Test Candidate",
		primarySkills: ["Python"],
		strongDomains: ["fraud detection"],
		careerGoals: ["ML Engineer"],
		drainingTasks: ["on-call maintenance"],
	},
	focusAreas: ["Astronaut"],
	evaluationSummary: { fitScore: 84, verdict: "Good Fit", gaps: ["Kubernetes"] },
};

describe("career-strategy tool", () => {
	it("registers under career-strategy", () => {
		const tools = registered();
		assert.equal(tools.length, 1);
		assert.equal(tools[0].name, "career-strategy");
	});

	it("recommends grounded directions and skips the ungrounded area", async () => {
		const tools = registered();
		const result = await (tools[0].handler as LooseHandler)(ARGS, {});
		assert.equal(result.isError, undefined);
		const structured = result.structuredContent as Record<string, unknown>;
		const directions = structured["directions"] as { direction: string; gapsToClose: string[] }[];
		assert.ok(directions.some((direction) => direction.direction.includes("ML Engineer")));
		assert.ok((structured["skipped"] as string[]).some((entry) => entry.includes("Astronaut")));
		assert.ok((structured["avoidNotes"] as string[]).some((note) => note.includes("on-call maintenance")));
		assert.ok(result.content[0].text.includes("## Career strategy"));
	});
});
