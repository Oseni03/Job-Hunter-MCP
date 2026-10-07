import { z } from "zod";

/** Input/output contract for the track-application tool. */

export const RecordApplicationInput = z
	.object({
		company: z.string().min(1).describe("Employer name (case-insensitive match key)"),
		role: z.string().min(1).describe("Role title (case-insensitive match key)"),
		sector: z.string().optional().describe("Sector for a new row, from the posting or empty"),
		roleType: z.string().optional().describe("Role type for a new row, from the posting or empty"),
		contactPerson: z.string().optional().describe("Contact person for a new row, or empty"),
		channel: z.string().optional().describe("Explicit channel; wins over portal and derivation"),
		portal: z.string().optional().describe("Producing portal or skill; feeds channel derivation"),
		fitScore: z
			.number()
			.min(0)
			.max(100)
			.nullable()
			.describe("Bare 0-100 fit score; null when unscored"),
		cvFile: z.string().min(1).describe("Tailored CV path, e.g. cv/main_<slug>.html"),
		coverLetterFile: z.string().min(1).describe("Cover letter path, e.g. cover_letters/cover_<slug>.html"),
		postingUrl: z.string().url().optional().describe("Posting URL; empty source for pasted text"),
		deadline: z
			.string()
			.optional()
			.describe("Deadline as YYYY-MM-DD; anything else records as empty, never guessed"),
		postingText: z
			.string()
			.optional()
			.describe("Held verbatim posting text for the archive; absent archives nothing"),
		trackerText: z
			.string()
			.optional()
			.describe("Current job_search_tracker.csv content; empty when the tracker is missing"),
		today: z
			.string()
			.optional()
			.describe("Row date as YYYY-MM-DD; the host passes the user's local day (server default is UTC, a day off near midnight elsewhere)"),
	})
	.strict();

export const RecordApplicationOutput = z
	.object({
		action: z.enum(["append", "update"]),
		trackerText: z.string().describe("Full updated tracker; the host writes it verbatim"),
		row: z.string().describe("CSV line for the new or updated row"),
		rowIndex: z.number().nullable().describe("Zero-based data-row index for updates; null for appends"),
		appendedAlongsideFinal: z.boolean(),
		headerUpgraded: z.boolean(),
		openMatchCount: z.number().describe("Open matching rows; above 1 means the ledger needs deduplication"),
		duplicateNote: z.string().nullable().describe("Names the duplicate count when several open rows match"),
		trackerHash: z
			.string()
			.describe("SHA-1 of the input tracker text; host writes only if the file still matches, else re-reads"),
		archiveFile: z.string().nullable(),
		archiveText: z.string().nullable().describe("Verbatim posting text; null when no longer held"),
		archiveNote: z.string().nullable(),
	})
	.strict();
