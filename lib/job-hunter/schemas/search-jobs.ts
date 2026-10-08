import { z } from "zod";

/** Input/output contract for the search-jobs tool. */

export const SearchJobsInput = z
	.object({
		keywords: z.string().optional().describe("Explicit keyword query; absent derives from the profile"),
		location: z.string().optional().describe("Explicit location; absent derives from the profile"),
		remoteMode: z
			.enum(["remote", "hybrid", "onsite"])
			.optional()
			.describe("Workplace filter for the scraper search"),
		jobType: z.string().optional().describe("Job-type filter for the scraper search"),
		limit: z.number().int().positive().optional().describe("Result cap; capped at 20 server-side"),
		cursor: z
			.string()
			.optional()
			.describe("Opaque resume token from a previous page; the server holds no state"),
	})
	.strict();

export const SearchCandidateSchema = z
	.object({
		key: z.string(),
		title: z.string(),
		company: z.string(),
		url: z.string(),
		postedDate: z.string().nullable(),
		deadline: z.string().nullable(),
		dateUnknown: z.boolean(),
		status: z.enum(["active", "expired", "unknown"]),
		portal: z.string(),
		quickFit: z
			.object({
				score: z.number(),
				band: z.enum(["high", "medium", "low", "unscored"]),
				strengths: z.array(z.string()),
				gaps: z.array(z.string()),
				lowEvidence: z.boolean(),
				textLength: z.number(),
			})
			.strict(),
		language: z
			.object({
				verdict: z.enum(["PASS", "FLAG", "FAIL"]),
				note: z.string(),
			})
			.strict(),
		consolidationNote: z.string().nullable(),
		referralLinks: z.array(z.string()),
		needsVerification: z.boolean(),
	})
	.strict();

export const SearchJobsOutput = z
	.object({
		filters: z
			.object({
				keywords: z.string(),
				location: z.string(),
				remoteMode: z.enum(["remote", "hybrid", "onsite"]).optional(),
				jobType: z.string().optional(),
				limit: z.number(),
			})
			.strict(),
		queries: z.array(
			z.object({ category: z.string(), language: z.string(), query: z.string() }).strict(),
		),
		candidates: z.array(SearchCandidateSchema),
		staleCount: z.number(),
		seenSkipped: z.number(),
		appliedSkipped: z.number(),
		queriesRun: z.array(z.string()),
		nextCursor: z.string().nullable(),
		notes: z.array(z.string()),
		errors: z.array(z.string()),
	})
	.strict();
