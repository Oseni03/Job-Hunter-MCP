import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { McpServer } from "@modelcontextprotocol/server";

import { registerPrepareInterview } from "@/lib/mcp/tools/prepare-interview.ts";

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
	registerPrepareInterview(server);
	return captured;
}

const ARGS = {
	company: "Acme",
	role: "Senior ML Engineer",
	stage: "technical",
	postingText: "Senior ML Engineer at Acme.\nRequirements: Python, Kubernetes.",
	stageHistoryText: "Feedback: concern about Kubernetes depth.",
	profile: {
		name: "Test Candidate",
		primarySkills: ["Python"],
		strongDomains: ["fraud detection"],
		careerGoals: ["ML Engineer"],
	},
	logistics: { format: "video" },
};

describe("prepare-interview tool", () => {
	it("registers under prepare-interview", () => {
		const tools = registered();
		assert.equal(tools.length, 1);
		assert.equal(tools[0].name, "prepare-interview");
	});

	it("builds an ordered pack and asks for missing logistics", async () => {
		const tools = registered();
		const result = await (tools[0].handler as LooseHandler)(ARGS, {});
		assert.equal(result.isError, undefined);
		const structured = result.structuredContent as Record<string, unknown>;
		assert.equal(structured["packFile"], "documents/applications/acme_senior-ml-engineer/technical-prep.md");
		assert.deepEqual(structured["missingLogistics"], ["dateTime", "interviewers", "location"]);
		const sources = (structured["questions"] as { source: string }[]).map((question) => question.source);
		assert.ok(sources.indexOf("recorded-feedback") < sources.indexOf("fit-gap"));
		assert.ok(result.content[0].text.includes("Mock run"));
	});
});
