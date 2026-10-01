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
				"Batch triage from fetched posting text only: five-dimension weights (30/25/15/30) and verdict bands (75/60/45/30) with no company research, salary lookup, or reviewer. Applies location and language-gate vetoes (FAIL excluded with quoted reason, FLAG stays flagged), urgency tiebreak for deadlines within 7 days, genuine past-deadline to expired, and staleness flags without veto. Fetch failures become unavailable (bounded retry: max 3 attempts, 3-day cooldown; server stateless, retry memory travels host-side), vetoes become excluded (re-scored on profile-hash mismatch; host persists profileHash as lastProfileHash), expired stays terminal. Fresh deadlines win only for explicit-year unambiguous dates (ISO or month-name + year); yearless/ambiguous/zoned phrases keep stored + note. Returns additive-only rank fields plus a stored-deadline sweep; the host owns every write. Route picks back to evaluate-job, which always re-runs. Token budget: the model decides focus keywords, limit, and top only — the host harness supplies items (keys + URLs, never pasted text dumps: the server fetches with a 6h/15min URL cache), applied pairs, and stored ranks. Caller quick-fit scores pre-order the slice; the opaque next cursor resumes the deferred set without resending everything.",
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
					callerQuickFit: item.callerQuickFit,
					lastProfileHash: item.lastProfileHash,
					lastAttemptDate: item.lastAttemptDate ?? null,
					attemptCount: item.attemptCount,
				})),
				focus: input.focus,
				limit: input.limit,
				top: input.top,
				all: input.all,
				appliedPairs: input.appliedPairs,
				storedRanks: input.storedRanks,
				cursor: input.cursor,
			});
			return {
				content: [{ type: "text" as const, text: renderRankMarkdown(plan) }],
				structuredContent: { ...plan },
			};
		},
	);
}
