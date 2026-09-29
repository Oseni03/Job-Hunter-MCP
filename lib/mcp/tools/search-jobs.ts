import type { McpServer } from "@modelcontextprotocol/server";

import { defaultFetch } from "../../fetch-posting.ts";
import { resolveProfile } from "../../profile.ts";
import { createBrightDataFetcher, createWebFallbackFetch, planSearch } from "../../search.ts";
import { SearchJobsInput, SearchJobsOutput } from "../schemas.ts";
import { renderSearchMarkdown } from "../render.ts";

export function registerSearchJobs(server: McpServer): void {
	server.registerTool(
		"search-jobs",
		{
			title: "Search jobs",
			description:
				"Finds fresh postings with explicit filters (keywords, location, remote mode, job type, limit capped at 20) or profile-derived auto-queries, scoped to the last 14 days with unknown dates flagged. Plans caller-supplied portal output, uses the BrightData key when configured, otherwise degrades to web-search fallback; never scrapes people-search pages and never invents postings. Returns stability-ready keys with caller-passed dedupe; the host owns all writes to the seen store and tracker.",
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
				brightDataKey,
				brightDataFetch: brightDataKey
					? createBrightDataFetcher(brightDataKey, process.env.BRIGHTDATA_ZONE ?? "job_hunter", defaultFetch)
					: undefined,
				webFallbackFetch: brightDataKey ? undefined : createWebFallbackFetch(defaultFetch),
			});
			const { ...structured } = plan;
			return {
				content: [{ type: "text" as const, text: renderSearchMarkdown(plan) }],
				structuredContent: structured,
			};		},
	);
}
