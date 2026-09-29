import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { McpServer } from "@modelcontextprotocol/server";

import { registerPortalFields } from "../mcp/tools/portal-fields.ts";

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
	registerPortalFields(server);
	return captured;
}

const ARGS = {
	profile: {
		name: "Test Candidate",
		primarySkills: ["Python", "SQL"],
		strongDomains: ["fraud detection"],
		careerGoals: ["ML Engineer"],
	},
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

describe("portal-fields tool", () => {
	it("registers under portal-fields", () => {
		const tools = registered();
		assert.equal(tools.length, 1);
		assert.equal(tools[0].name, "portal-fields");
	});

	it("drafts intros, project entries, and pitches with measured counts", async () => {
		const tools = registered();
		const result = await (tools[0].handler as LooseHandler)(ARGS, {});
		assert.equal(result.isError, undefined);
		const structured = result.structuredContent as Record<string, unknown>;
		assert.equal(structured["filePath"], "documents/portal-fields.md");
		assert.equal((structured["selfIntros"] as unknown[]).length, 2);
		const pitches = structured["pitches"] as { charCount: number; text: string }[];
		assert.ok(pitches.length >= 4 && pitches.length <= 6);
		assert.deepEqual(structured["ungrounded"], []);
		assert.ok(result.content[0].text.includes("# Portal fields (copy-paste)"));
	});
});
