import type { McpServer } from "@modelcontextprotocol/server";

import { planCareerStrategy } from "@/lib/strategy.ts";
import { StrategyInput, StrategyOutput } from "@/lib/mcp/schemas.ts";
import { renderStrategyMarkdown } from "@/lib/mcp/render.ts";

export function registerCareerStrategy(server: McpServer): void {
	server.registerTool(
		"career-strategy",
		{
			title: "Career strategy",
			description:
				"Recommends career directions from the profile plus the evaluation framework: career goals and strong domains become grounded directions ranked by evidence depth, nominated focus areas are assessed when a skills/experience phrase grounds them and honestly skipped otherwise (goal-only overlap is circular, never grounding). Accepts one or several evaluate-job summaries; recurring gaps surface as priority gaps and summary strengths reinforce evidence labeled as evaluation strengths. Every direction cites profile evidence and framework dimensions; draining tasks become steer-away notes. Never invents experience.",
			inputSchema: StrategyInput,
			outputSchema: StrategyOutput,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async (input) => {
			const result = planCareerStrategy({
				profile: input.profile,
				evaluationSummary: input.evaluationSummary,
				evaluationSummaries: input.evaluationSummaries,
				focusAreas: input.focusAreas,
				masterCvText: input.masterCvText,
				workspaceProfileText: input.workspaceProfileText,
			});
			return {
				content: [{ type: "text" as const, text: renderStrategyMarkdown(result) }],
				structuredContent: result,
			};
		},
	);
}
