import type { McpServer } from "@modelcontextprotocol/server";

import { defaultFetch } from "@/lib/fetch-posting.ts";
import { resolveProfile } from "@/lib/profile.ts";
import { planSearch } from "@/lib/search.ts";
import { SearchJobsInput, SearchJobsOutput } from "@/lib/mcp/schemas.ts";
import { renderSearchMarkdown } from "@/lib/mcp/render.ts";

export function registerSearchJobs(server: McpServer): void {
	server.registerTool(
		"search-jobs",
		{
			title: "Search jobs",
			description:
				"Finds fresh postings with explicit filters (keywords, location, remote mode, job type, limit capped at 20) or profile-derived auto-queries, scoped to the last 14 days with unknown dates flagged. Plans caller-supplied portal output, then structured board JSON (Greenhouse/Lever/Ashby refs run ahead of scrapers), then local scrapers when scraperAdapters is passed; with no source configured it returns an honest error and never invents postings. Never scrapes people-search pages. Runs the query set per source up to a visible cap and reports queriesRun; returns stability-ready keys with caller-passed dedupe; the host owns all writes to the seen store and tracker. Token budget: the model decides keywords, location, mode, and limit only — the host harness supplies portal output and the dedupe stores (delta-only seen keys; full state on store loss). Large result sets page via the opaque next cursor; the server holds no state.",
			inputSchema: SearchJobsInput,
			outputSchema: SearchJobsOutput,
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: true,
			},
		},
		async (input) => {
			const profile = resolveProfile(input.profile);
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
				portalResults: input.portalResults,
				boards: input.boards,
				boardFetch: defaultFetch,
				scraperAdapters: input.scraperAdapters,
				cursor: input.cursor,
			});
			return {
				content: [{ type: "text" as const, text: renderSearchMarkdown(plan) }],
				structuredContent: { ...plan },
			};
		},
	);
}
