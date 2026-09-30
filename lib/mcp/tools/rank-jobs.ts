import type { McpServer } from "@modelcontextprotocol/server";

import { resolveProfile } from "@/lib/profile.ts";
import { planRank } from "@/lib/rank.ts";
import { RankJobsInput, RankJobsOutput } from "@/lib/mcp/schemas.ts";
import { renderRankMarkdown } from "@/lib/mcp/render.ts";

export function registerRankJobs(server: McpServer): void {
	server.registerTool(
		"rank-jobs",
		{
			title: "Rank jobs",
			description:
				"Batch triage from fetched posting text only: five-dimension weights (30/25/15/30) and verdict bands (75/60/45/30) with no company research, salary lookup, or reviewer. Applies location and language-gate vetoes (FAIL excluded with quoted reason, FLAG stays flagged), urgency tiebreak for deadlines within 7 days, past-deadline to expired, and staleness flags without veto. Returns additive-only rank fields plus a stored-deadline sweep; the host owns every write. Route picks back to evaluate-job, which always re-runs.",
			inputSchema: RankJobsInput,
			outputSchema: RankJobsOutput,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
		},
		async (input) => {
			const profile = resolveProfile(input.profile);
			const plan = await planRank({
				profile,
				items: (input.items ?? []).map((item) => ({
					key: item.key,
					title: item.title,
					company: item.company,
					url: item.url,
					portal: item.portal,
					postedDate: item.postedDate ?? null,
					deadline: item.deadline ?? null,
					postingText: item.postingText,
					postingUrl: item.postingUrl,
					status: item.status,
					fitNotes: item.fitNotes,
				})),
				focus: input.focus,
				limit: input.limit,
				top: input.top,
				all: input.all,
				appliedPairs: input.appliedPairs,
				storedRanks: input.storedRanks,
			});
			return {
				content: [{ type: "text" as const, text: renderRankMarkdown(plan) }],
				structuredContent: { ...plan },
			};
		},
	);
}
