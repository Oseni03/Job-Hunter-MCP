import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { McpServer } from "@modelcontextprotocol/server";

import { TRACKER_HEADER } from "@/lib/job-hunter/record.ts";
import { registerTrackApplication } from "@/lib/job-hunter/tools/track-application.ts";

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
	registerTrackApplication(server);
	return captured;
}

const ARGS = {
	company: "Acme",
	role: "Senior ML Engineer",
	fitScore: 84,
	cvFile: "cv/main_acme_senior-ml-engineer.tex",
	coverLetterFile: "cover_letters/cover_acme_senior-ml-engineer.tex",
	postingUrl: "https://example.com/jobs/1",
	deadline: "2026-04-01",
	postingText: "Senior ML Engineer at Acme.",
	trackerText: "",
	today: "2026-03-01",
};

describe("track-application tool", () => {
	it("registers under track-application", () => {
		const tools = registered();
		assert.equal(tools.length, 1);
		assert.equal(tools[0].name, "track-application");
	});

	it("appends a drafted row and archive payload for a fresh tracker", async () => {
		const tools = registered();
		const result = await (tools[0].handler as LooseHandler)(ARGS, {});
		assert.equal(result.isError, undefined);
		const structured = result.structuredContent as Record<string, unknown>;
		assert.equal(structured["action"], "append");
		assert.ok((structured["trackerText"] as string).startsWith(`${TRACKER_HEADER}\n`));
		assert.ok((structured["row"] as string).includes(",drafted,"));
		assert.equal(structured["archiveFile"], "documents/applications/acme_senior-ml-engineer/job_posting.md");
		assert.equal(structured["archiveText"], "Senior ML Engineer at Acme.");
		assert.ok(result.content[0].text.includes("## Record application: append"));
	});

	it("updates the open row when the tracker already holds one", async () => {
		const open =
			"2026-02-01,Acme,,Senior ML Engineer,,online,drafted,,70,,cv/old.tex,cover_letters/old.tex,https://example.com/jobs/1,2026-05-01";
		const tools = registered();
		const result = await (tools[0].handler as LooseHandler)(
			{ ...ARGS, trackerText: `${TRACKER_HEADER}\n${open}\n`, deadline: undefined },
			{},
		);
		assert.equal(result.isError, undefined);
		const structured = result.structuredContent as Record<string, unknown>;
		assert.equal(structured["action"], "update");
		assert.equal(structured["rowIndex"], 0);
		assert.ok((structured["row"] as string).includes(",redrafted,"));
		assert.ok((structured["row"] as string).endsWith(",2026-05-01"));
	});

	it("reports an error for an unrecognized tracker header", async () => {
		const tools = registered();
		const result = await (tools[0].handler as LooseHandler)(
			{ ...ARGS, trackerText: "foo,bar\n1,2\n" },
			{},
		);
		assert.equal(result.isError, true);
		assert.ok(result.content[0].text.includes("Unrecognized tracker header"));
	});
});
