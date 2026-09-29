import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { McpServer } from "@modelcontextprotocol/server";

import { registerTailorCv } from "@/lib/mcp/tools/tailor-cv.ts";
import { registerWriteCoverLetter } from "@/lib/mcp/tools/write-cover-letter.ts";
import { registerAllResources } from "@/lib/mcp/server.ts";

type ToolResult = {
	content: { type: string; text: string }[];
	structuredContent?: Record<string, unknown>;
	isError?: boolean;
};

type LooseHandler = (input: Record<string, unknown>, extra: unknown) => Promise<ToolResult>;

function toolHandler(register: (server: McpServer) => void): LooseHandler {
	const captured: unknown[] = [];
	const server = {
		registerTool(_name: string, _config: unknown, handler: unknown) {
			captured.push(handler);
		},
	} as unknown as McpServer;
	register(server);
	return captured[0] as LooseHandler;
}

const PROFILE = {
	name: "Test Candidate",
	primarySkills: ["Python", "SQL"],
	strongDomains: ["fraud detection"],
	careerGoals: ["ML Engineer"],
};

const POSTING = [
	"Senior ML Engineer at Acme.",
	"We welcome international applicants and offer visa sponsorship.",
	"Requirements: Python, SQL.",
	"Domain: fraud detection.",
].join("\n");

describe("tailor-cv signals", () => {
	it("carries page-budget, LaTeX-safety, and layout signals with the TeX", async () => {
		const result = await toolHandler(registerTailorCv)(
			{
				postingText: POSTING,
				company: "Acme",
				role: "Senior ML Engineer",
				profile: PROFILE,
				experience: [
					{
						title: "Data Analyst",
						company: "R&D Corp",
						period: "2020-2024",
						bullets: ["Cut losses by 12% with Python models for fraud detection."],
					},
				],
			},
			{},
		);
		assert.equal(result.isError, undefined);
		const signals = (result.structuredContent as Record<string, unknown>)["signals"] as Record<string, unknown>;
		assert.equal((signals["pageBudget"] as { pageLimit: number }).pageLimit, 2);
		assert.equal(typeof (signals["latexSafety"] as { passed: boolean }).passed, "boolean");
		assert.equal((signals["layout"] as { degraded: boolean }).degraded, true);
		assert.ok(result.content[0].text.includes("Document signals"), "signals rendered for the host");
	});
});

describe("write-cover-letter signals", () => {
	it("carries the one-page word-budget signal with the TeX", async () => {
		const result = await toolHandler(registerWriteCoverLetter)(
			{
				postingText: POSTING,
				company: "Acme",
				role: "Senior ML Engineer",
				profile: PROFILE,
				companySpecifics: ["Acme processes payments across Europe."],
			},
			{},
		);
		assert.equal(result.isError, undefined);
		const signals = (result.structuredContent as Record<string, unknown>)["signals"] as Record<string, unknown>;
		assert.equal((signals["pageBudget"] as { pageLimit: number }).pageLimit, 1);
		assert.equal((signals["pageBudget"] as { wordBudgetMax: number }).wordBudgetMax, 300);
	});
});

describe("registered resources and prompts", () => {
	it("exposes the six versioned resources and five workflow prompts", () => {
		const resources: { name: string; uri: string }[] = [];
		const prompts: string[] = [];
		const server = {
			registerTool() {},
			registerResource(name: string, uri: string) {
				resources.push({ name, uri: typeof uri === "string" ? uri : String(uri) });
			},
			registerPrompt(name: string) {
				prompts.push(name);
			},
		} as unknown as McpServer;
		registerAllResources(server);
		assert.equal(resources.length, 6);
		assert.ok(resources.some((resource) => resource.uri === "job-hunter://framework/evaluation"));
		assert.deepEqual(prompts.sort(), ["apply", "interview", "rank", "scrape-health", "tailor-flow"]);
	});
});
