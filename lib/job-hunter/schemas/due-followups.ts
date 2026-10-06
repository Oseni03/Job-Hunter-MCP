import { z } from "zod";

/** Input/output contract for the due-followups tool. */

export const DueApplicationSchema = z
	.object({
		jobKey: z.string().min(1),
		company: z.string().min(1),
		role: z.string().min(1),
		status: z.string().min(1).describe("Open statuses count; final (rejected/withdrawn/no response/offer declined/hired/accepted) and saved excluded"),
		updatedAt: z.string().optional().describe("Last touch as YYYY-MM-DD; unknown treated as stale"),
		deadline: z.string().optional().describe("Deadline as YYYY-MM-DD; anything else ignored"),
	})
	.strict();

export const DueFollowupsInput = z
	.object({
		applications: z.array(DueApplicationSchema).optional().describe("Caller-held applications (preferred; mirrors Prisma rows)"),
		trackerText: z.string().optional().describe("Raw job_search_tracker.csv content; parsed when applications absent"),
		staleDays: z.number().int().positive().optional().describe("Untouched threshold in days (default 7)"),
		deadlineWithinDays: z.number().int().positive().optional().describe("Deadline horizon in days (default 3)"),
		limit: z.number().int().positive().optional().describe("Result cap (default 20)"),
		today: z.string().optional().describe("Today as YYYY-MM-DD; default is the UTC day"),
	})
	.strict();

export const DueFollowupsOutput = z
	.object({
		due: z.array(
			z.object({
				jobKey: z.string(),
				company: z.string(),
				role: z.string(),
				status: z.string(),
				daysStale: z.number().nullable(),
				reason: z.string(),
				suggestedAction: z.string(),
			}),
		),
		checked: z.number(),
		staleDays: z.number(),
		deadlineWithinDays: z.number(),
		note: z.string(),
	})
	.strict();
