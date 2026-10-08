import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { McpServer } from "@modelcontextprotocol/server";

import { registerTailorResume } from "@/lib/job-hunter/tools/tailor-resume.ts";
import { registerGenerateCoverLetter } from "@/lib/job-hunter/tools/generate-cover-letter.ts";
import { registerJobHunterResources } from "@/lib/job-hunter/server.ts";
import { sectionHeadings } from "@/lib/job-hunter/document.ts";
import type { FetchLike } from "@/lib/job-hunter/fetch-posting.ts";

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
	preferences: { targetRoles: ["ML Engineer"] },
	skills: [{ name: "Python", category: "primary" as const }, { name: "SQL", category: "primary" as const }],
	domains: [{ name: "fraud detection", category: "strong" as const }],
};

const POSTING = [
	"Senior ML Engineer at Acme.",
	"We welcome international applicants and offer visa sponsorship.",
	"Requirements: Python, SQL.",
	"Domain: fraud detection.",
].join("\n");

/** Canned model output; the tool test stubs Groq so no key or network is needed. */
const RENDER = {
	name: "Test Candidate",
	statement: "Test Candidate brings Python and SQL to ML Engineer work in fraud detection.",
	competencies: [{ label: "Python", body: "Direct match to a stated requirement." }],
	headings: sectionHeadings("en"),
};

function stubFetch(data: unknown): FetchLike {
	return async () => ({
		status: 200,
		body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(data) } }] }),
	});
}

describe("tailor-resume signals", () => {
	it("carries page-budget, HTML render-safety, and layout signals with the HTML", async () => {
		const hadKey = process.env["GROQ_API_KEY"];
		process.env["GROQ_API_KEY"] = "test-key";
		let result: ToolResult;
		try {
			result = await toolHandler((server) =>
				registerTailorResume(server, { fetchImpl: stubFetch(RENDER) }),
			)(
				{
					postingText: POSTING,
					company: "Acme",
					role: "Senior ML Engineer",
					profile: PROFILE,
				},
				{},
			);
		} finally {
			if (hadKey === undefined) delete process.env["GROQ_API_KEY"];
			else process.env["GROQ_API_KEY"] = hadKey;
		}
		assert.equal(result.isError, undefined);
		const signals = (result.structuredContent as Record<string, unknown>)["signals"] as Record<string, unknown>;
		assert.equal((signals["pageBudget"] as { pageLimit: number }).pageLimit, 2);
		assert.equal(typeof (signals["renderSafety"] as { passed: boolean }).passed, "boolean");
		assert.equal((signals["layout"] as { degraded: boolean }).degraded, true);
		assert.deepEqual(
			JSON.parse(result.content[0].text),
			JSON.parse(JSON.stringify(result.structuredContent)),
			"text carries the signals JSON",
		);
	});
});

describe("generate-cover-letter signals", () => {
	it("carries the one-page word-budget signal with the TeX", async () => {
		const result = await toolHandler(registerGenerateCoverLetter)(
			{
				postingText: POSTING,
				company: "Acme",
				role: "Senior ML Engineer",
				profile: PROFILE,
				companySpecifics: [
					{ text: "Acme processes payments across Europe.", sourceUrl: "https://acme.example/about" },
				],
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
	it("exposes the full versioned catalog and workflow prompts", () => {
		const resources: { name: string; uri: string }[] = [];
		const prompts: string[] = [];
		const server = {
			registerTool() { },
			registerResource(name: string, uri: string) {
				resources.push({ name, uri: typeof uri === "string" ? uri : String(uri) });
			},
			registerPrompt(name: string) {
				prompts.push(name);
			},
		} as unknown as McpServer;
		registerJobHunterResources(server);
		assert.equal(resources.length, 16);
		for (const uri of [
			"job-hunter://framework/evaluation",
			"job-hunter://reference/cv-master",
			"job-hunter://reference/cover-example",
			"job-hunter://strategy/search-queries",
			"job-hunter://templates/cv-variants",
			"job-hunter://state/seen-keys",
			"job-hunter://state/tracker",
			"job-hunter://research/companies",
		]) {
			assert.ok(
				resources.some((resource) => resource.uri === uri),
				`missing registered resource ${uri}`,
			);
		}
		assert.deepEqual(prompts.sort(), ["apply", "apply-to-job", "interview", "interview-prep", "rank", "scrape-health", "tailor-flow"]);
	});
});
