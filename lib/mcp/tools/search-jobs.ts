import type { McpServer } from "@modelcontextprotocol/server";

import { defaultFetch } from "@/lib/fetch-posting.ts";
import { resolveProfile } from "@/lib/profile.ts";
import { createBrightDataFetcher, createWebFallbackFetch, planSearch } from "@/lib/search.ts";
import { SearchJobsInput, SearchJobsOutput } from "@/lib/mcp/schemas.ts";
import { renderSearchMarkdown } from "@/lib/mcp/render.ts";

export function registerSearchJobs(server: McpServer): void {
	server.registerTool(
		"search-jobs",
		{
			title: "Search jobs",
			description:
				"Finds fresh postings with explicit filters (keywords, location, remote mode, job type, limit capped at 20) or profile-derived auto-queries, scoped to the last 14 days with unknown dates flagged. Plans caller-supplied portal output, then structured board JSON (Greenhouse/Lever/Ashby refs run ahead of scrapers), then the BrightData key when configured, otherwise degrades to a site:-scoped web-search fallback; never scrapes people-search pages and never invents postings. Runs the query set per source up to a visible cap and reports queriesRun; returns stability-ready keys with caller-passed dedupe; the host owns all writes to the seen store and tracker.",
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
			const brightDataKey = process.env.BRIGHTDATA_API_KEY || undefined;
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
				brightDataKey,
				brightDataFetch: brightDataKey
					? createBrightDataFetcher(brightDataKey, process.env.BRIGHTDATA_ZONE ?? "job_hunter", defaultFetch)
					: undefined,
				webFallbackFetch: brightDataKey ? undefined : createWebFallbackFetch(defaultFetch),
			});
			return {
				content: [{ type: "text" as const, text: renderSearchMarkdown(plan) }],
				structuredContent: { ...plan },
			};
		},
	);
}
