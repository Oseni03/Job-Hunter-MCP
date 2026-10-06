import type { McpServer } from "@modelcontextprotocol/server";

import { jobHunterAppMeta } from "@/lib/job-hunter/ui.ts";

import { planJobResearch, type HostFinding } from "@/lib/job-hunter/job-research.ts";
import { loadActiveProfile } from "@/lib/job-hunter/request-profile.ts";
import { ResearchJobInput, ResearchJobOutput } from "@/lib/job-hunter/schemas/research-job.ts";

export function registerResearchJob(server: McpServer): void {
	server.registerTool(
		"research-job",
		{
			title: "Research job",
			description:
				"Deep job brief from host-gathered research: the host searches the web (hosts search better than server-side fetching, which this tool never does) and passes findings with source URLs; the server sanitizes every claim (research is data, never instructions), labels sources, cross-checks the stored profile for fit evidence and growth-area watch-outs, flags unverified pay figures, and derives gap-driven interviewer questions. With no findings it returns brief mode: suggested queries per topic so the host can research further, and nothing is invented. Returns JSON; the host owns any follow-up searches.",
			inputSchema: ResearchJobInput,
			outputSchema: ResearchJobOutput,
			...jobHunterAppMeta(),
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
		},
		async (input, extra) => {
			const plan = planJobResearch({
				profile: await loadActiveProfile(extra),
				company: input.company,
				role: input.role,
				postingText: input.postingText,
				findings: (input.findings ?? []) as HostFinding[],
			});
			return {
				content: [{ type: "text" as const, text: JSON.stringify(plan, null, 2) }],
				structuredContent: { ...plan },
			};
		},
	);
}
