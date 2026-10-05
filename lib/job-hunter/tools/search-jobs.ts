import type { McpServer } from "@modelcontextprotocol/server";

import { loadActiveProfile } from "@/lib/job-hunter/request-profile.ts";
import { planSearch } from "@/lib/job-hunter/search.ts";
import { SearchJobsInput, SearchJobsOutput } from "@/lib/job-hunter/schemas.ts";
import { renderSearchMarkdown } from "@/lib/job-hunter/render.ts";

export function registerSearchJobs(server: McpServer): void {
	server.registerTool(
		"search-jobs",
		{
			title: "Search jobs",
			description:
				"Finds fresh postings through the local scraper adapters (Indeed/LinkedIn Site clients plus remote and Nigerian boards; defaults to all adapters, pass [] to disable live fetching, or named adapters to narrow), with explicit filters (keywords, location, remote mode, job type, limit capped at 20) or profile-derived auto-queries, scoped to the last 14 days with unknown dates flagged. With no adapters configured it returns an honest error and never invents postings. Never scrapes people-search pages. Runs the query set up to a visible cap and reports queriesRun; returns stability-ready keys with caller-passed dedupe; the host owns all writes to the seen store and tracker. Token budget: the model decides keywords, location, mode, and limit only — the host harness supplies the dedupe stores (delta-only seen keys; full state on store loss). Large result sets page via the opaque next cursor; the server holds no state.",
			inputSchema: SearchJobsInput,
			outputSchema: SearchJobsOutput,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
		},
		async (input, extra) => {
			const profile = await loadActiveProfile(extra);
			const plan = await planSearch({
				filters: {
					keywords: input.keywords,
					location: input.location,
					remoteMode: input.remoteMode,
					jobType: input.jobType,
					limit: input.limit,
				},
				profile,
				seenKeys: input.seenKeys,
				appliedPairs: input.appliedPairs,
				scraperAdapters: input.scraperAdapters ?? ["all"],
				cursor: input.cursor,
			});
			return {
				content: [{ type: "text" as const, text: renderSearchMarkdown(plan) }],
				structuredContent: { ...plan },
			};
		},
	);
}
