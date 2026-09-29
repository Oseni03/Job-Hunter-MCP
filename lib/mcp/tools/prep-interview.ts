import type { McpServer } from "@modelcontextprotocol/server";

import { planInterviewPrep } from "../../prep.ts";
import { PrepInterviewInput, PrepInterviewOutput } from "../schemas.ts";
import { renderPrepMarkdown } from "../render.ts";

export function registerPrepInterview(server: McpServer): void {
	server.registerTool(
		"prep-interview",
		{
			title: "Prep interview",
			description:
				"Builds a per-stage interview-prep pack from caller-held facts only: recorded feedback first, then fit gaps with honest bridge answers, then posting requirements, then stage type. Maps STAR examples by Use-for tags, drafts new STAR only from profile facts, lists probeable claims, customizes tough questions only with verified company hooks, and picks stage-appropriate questions to ask. Asks only for missing stage logistics; every absent input degrades to an explicit fallback and nothing is pulled from sibling roles. Returns the pack markdown; the host owns the save.",
			inputSchema: PrepInterviewInput,
			outputSchema: PrepInterviewOutput,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async (input) => {
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
				profile: input.profile,
				masterCvText: input.masterCvText,
				workspaceProfileText: input.workspaceProfileText,
			});
			return {
				content: [{ type: "text" as const, text: renderPrepMarkdown(result) }],
				structuredContent: result,
			};
		},
	);
}
