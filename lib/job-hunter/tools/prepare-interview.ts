import type { McpServer } from "@modelcontextprotocol/server";

import { jobHunterAppMeta } from "@/lib/job-hunter/ui.ts";

import { planInterviewPrep } from "@/lib/job-hunter/prep.ts";
import { loadActiveProfile } from "@/lib/job-hunter/request-profile.ts";
import { PrepInterviewInput, PrepInterviewOutput } from "@/lib/job-hunter/schemas/prepare-interview.ts";

export function registerPrepareInterview(server: McpServer): void {
	server.registerTool(
		"prepare-interview",
		{
			title: "Prepare interview",
			description:
				"Builds a per-stage interview-prep pack from caller-held facts only: recorded feedback first, then fit gaps with honest bridge answers, then posting requirements, then stage type. Maps STAR examples by Use-for tags, drafts new STAR only from profile facts, lists probeable claims, customizes tough questions only with verified company hooks, and picks stage-appropriate questions to ask. Asks only for missing stage logistics; every absent input degrades to an explicit fallback and nothing is pulled from sibling roles. Returns the prep pack as JSON (packMarkdown carries the file text); the host owns the save.",
			inputSchema: PrepInterviewInput,
			outputSchema: PrepInterviewOutput,
			...jobHunterAppMeta(),
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async (input, extra) => {
			const result = planInterviewPrep({
				company: input.company,
				role: input.role,
				stage: input.stage,
				postingText: input.postingText,
				cvText: input.cvText,
				coverText: input.coverText,
				stageHistoryText: input.stageHistoryText,
				starExamples: input.starExamples,
				companyFacts: input.companyFacts,
				logistics: input.logistics,
				profile: await loadActiveProfile(extra),
				masterCvText: input.masterCvText,
				workspaceProfileText: input.workspaceProfileText,
				evaluation: input.evaluation,
			});
			return {
				content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
				structuredContent: result,
			};
		},
	);
}
