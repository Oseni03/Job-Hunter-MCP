import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { McpServer } from "@modelcontextprotocol/server";

import { parseTrackerApplications, planDueFollowups } from "@/lib/job-hunter/followups.ts";
import { registerDueFollowups } from "@/lib/job-hunter/tools/due-followups.ts";
import { registerSetupProfile } from "@/lib/job-hunter/tools/setup-profile.ts";
import { registerJobHunterTools } from "@/lib/job-hunter/server.ts";
import { getPrompt } from "@/lib/job-hunter/resources.ts";

function registered(register: (server: McpServer) => void): {
	name: string;
	config: { _meta?: { ui?: { resourceUri?: string }; "ui/resourceUri"?: string } };
	handler: unknown;
}[] {
	const captured: {
		name: string;
		config: { _meta?: { ui?: { resourceUri?: string }; "ui/resourceUri"?: string } };
		handler: unknown;
	}[] = [];
	const server = {
		registerTool(
			name: string,
			config: { _meta?: { ui?: { resourceUri?: string }; "ui/resourceUri"?: string } },
			handler: unknown,
		) {
			captured.push({ name, config, handler });
		},
		registerResource(_name: string, _uri: string, _config: unknown, _read: unknown) {
			// App UI resource; not a tool, so nothing to capture.
		},
	} as unknown as McpServer;
	register(server);
	return captured;
}

const APPS = [
	{ jobKey: "acme||backend", company: "Acme", role: "Backend", status: "applied", updatedAt: "2026-09-20", deadline: null },
	{ jobKey: "beta||ml", company: "Beta", role: "ML", status: "interviewing", updatedAt: "2026-09-29", deadline: null },
	{ jobKey: "gamma||fe", company: "Gamma", role: "FE", status: "saved", updatedAt: "2026-08-01", deadline: null },
	{ jobKey: "delta||ds", company: "Delta", role: "DS", status: "rejected", updatedAt: "2026-09-01", deadline: null },
	{ jobKey: "eps||dev", company: "Eps", role: "Dev", status: "applied", updatedAt: "2026-09-29", deadline: "2026-10-03" },
];

describe("due-followups core", () => {
	it("flags stale opens, excludes saved and finals", () => {
		const plan = planDueFollowups(APPS, { today: "2026-10-01" });
		const keys = plan.due.map((item) => item.jobKey);
		assert.ok(keys.includes("acme||backend"), "stale applied is due");
		assert.ok(!keys.includes("beta||ml"), "fresh interviewing is not due");
		assert.ok(!keys.includes("gamma||fe"), "saved excluded");
		assert.ok(!keys.includes("delta||ds"), "final excluded");
	});

	it("flags near deadlines even when fresh", () => {
		const plan = planDueFollowups(APPS, { today: "2026-10-01" });
		assert.ok(plan.due.some((item) => item.jobKey === "eps||dev"), "near deadline is due");
	});

	it("treats unknown touch dates as stale", () => {
		const plan = planDueFollowups(
			[{ jobKey: "x||y", company: "X", role: "Y", status: "applied", updatedAt: null, deadline: null }],
			{ today: "2026-10-01" },
		);
		assert.equal(plan.due.length, 1);
	});

	it("parses tracker CSV rows into applications", () => {
		const tracker = [
			"date,company,sector,role,role_type,channel,status,contact_person,fit_rating,notes,cv_file,cover_letter_file,source,deadline",
			"2026-09-20,Acme,,Backend,,,,applied,,,,,,,",
		].join("\n");
		const apps = parseTrackerApplications(tracker);
		assert.equal(apps.length, 1);
		assert.equal(apps[0].company, "Acme");
	});
});

describe("new tools + prompts", () => {
	it("registers setup-profile and due-followups", () => {
		assert.equal(registered(registerSetupProfile)[0].name, "setup-profile");
		assert.equal(registered(registerDueFollowups)[0].name, "due-followups");
	});

	it("due-followups serves tracker CSV end to end", async () => {
		const tools = registered(registerDueFollowups);
		const handler = tools[0].handler as (input: Record<string, unknown>, extra: unknown) => Promise<{
			content: { text: string }[];
			structuredContent: { due: unknown[]; checked: number };
		}>;
		const tracker = [
			"date,company,sector,role,role_type,channel,status,contact_person,fit_rating,notes,cv_file,cover_letter_file,source,deadline",
			"2026-09-20,Acme,,Backend,,,,applied,,,,,,,",
		].join("\n");
		const result = await handler({ trackerText: tracker, today: "2026-10-01" }, {});
		assert.equal(result.structuredContent.checked, 1);
		assert.equal(result.structuredContent.due.length, 1);
	});

	it("registers the twelve tools under one canonical name each", () => {
		const names = registered(registerJobHunterTools).map((tool) => tool.name);
		assert.deepEqual(
			[...names].sort(),
			[
				"analyze-job",
				"career-strategy",
				"draft-application-answers",
				"due-followups",
				"generate-cover-letter",
				"prepare-interview",
				"rank-jobs",
				"research-company",
				"search-jobs",
				"setup-profile",
				"tailor-resume",
				"track-application",
			],
		);
	});

	it("points every tool at the shared dashboard UI resource", () => {
		for (const tool of registered(registerJobHunterTools)) {
			assert.equal(
				tool.config._meta?.ui?.resourceUri,
				"ui://job-hunter/dashboard.html",
				`${tool.name} must render the dashboard via _meta.ui.resourceUri`,
			);
			assert.equal(
				tool.config._meta?.["ui/resourceUri"],
				"ui://job-hunter/dashboard.html",
				`${tool.name} must carry the legacy ui/resourceUri key for older hosts`,
			);
		}
	});

	it("adds apply-to-job and interview-prep orchestration prompts", () => {
		for (const name of ["apply-to-job", "interview-prep"]) {
			const prompt = getPrompt(name);
			assert.equal(prompt.ok, true, `missing prompt ${name}`);
		}
		const apply = getPrompt("apply-to-job");
		assert.ok(
			apply.ok && apply.text.includes("track-application"),
			"apply-to-job routes through canonical tools",
		);
	});
});
