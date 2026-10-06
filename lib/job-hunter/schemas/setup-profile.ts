import { z } from "zod";

import { ProfileSchema } from "@/lib/job-hunter/profile.ts";

/** Input/output contract for the setup-profile tool. */

export const SetupProfileInput = z
	.object({
		resumeText: z.string().min(1).describe("Verbatim uploaded resume text (paste of the file the user uploaded)"),
		profile: ProfileSchema.partial()
			.optional()
			.describe("Structured corrections; wins over anything derived, validated field by field"),
		displayName: z.string().min(1).optional().describe("Display name for the User row; never parsed from the resume"),
		dbWrite: z.boolean().optional().describe("Opt-in server-side persist to the caller's Profile row; degraded to a note when the database or user is unavailable"),
	})
	.strict();

export const SetupProfileOutput = z
	.object({
		profile: ProfileSchema,
		resumeHash: z.string().describe("SHA-1 of the resume text; host stores alongside the profile"),
		notes: z.array(z.string()),
		warnings: z.array(z.string()),
		dbNote: z.string(),
	})
	.strict();
