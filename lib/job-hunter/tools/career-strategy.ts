import type { McpServer } from "@modelcontextprotocol/server";

import { jobHunterAppMeta } from "@/lib/job-hunter/ui.ts";

import { planCareerStrategy } from "@/lib/job-hunter/strategy.ts";
import { loadActiveProfile } from "@/lib/job-hunter/request-profile.ts";
import { StrategyInput, StrategyOutput } from "@/lib/job-hunter/schemas/career-strategy.ts";

export function registerCareerStrategy(server: McpServer): void {
	server.registerTool(
		"career-strategy",
		{
			title: "Career strategy",
			description:
				"Recommends career directions from the profile plus the evaluation framework: career goals and strong domains become grounded directions ranked by evidence depth, nominated focus areas are assessed when a skills/experience phrase grounds them and honestly skipped otherwise (goal-only overlap is circular, never grounding). Accepts one or several analyze-job summaries; recurring gaps surface as priority gaps and summary strengths reinforce evidence labeled as evaluation strengths. Every direction cites profile evidence and framework dimensions; draining tasks become steer-away notes. Never invents experience.",
			inputSchema: StrategyInput,
			outputSchema: StrategyOutput,
			...jobHunterAppMeta(),
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async (input, extra) => {
			const result = planCareerStrategy({
				profile: await loadActiveProfile(extra),
				evaluationSummary: input.evaluationSummary,
				evaluationSummaries: input.evaluationSummaries,
				focusAreas: input.focusAreas,
				masterCvText: input.masterCvText,
				workspaceProfileText: input.workspaceProfileText,
			});
			return {
				content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
				structuredContent: result,
			};
		},
	);
}
