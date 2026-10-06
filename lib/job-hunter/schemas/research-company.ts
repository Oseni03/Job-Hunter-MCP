import { z } from "zod";

/** Input/output contract for the research-company tool. */

export const ResearchCompanyInput = z
	.object({
		company: z.string().min(1).describe("Employer name (drives employer-site search and research)"),
		companyUrl: z.string().url().optional().describe("Official company site override; skips discovery search"),
		cacheText: z
			.string()
			.optional()
			.describe("Caller-held company_research/<slug>.json content; fresh entries reuse discovery without fetching"),
	})
	.strict();

export const ResearchSourceSchema = z
	.object({ url: z.string(), notes: z.string() })
	.strict();

export const ResearchEntrySchema = z
	.object({
		company: z.string(),
		fetched_date: z.string(),
		sources: z
			.object({
				website: ResearchSourceSchema.optional(),
				reviews: ResearchSourceSchema.optional(),
				linkedin: ResearchSourceSchema.optional(),
				media: ResearchSourceSchema.optional(),
			})
			.strict(),
		network_contacts_note: z.string().optional(),
		interviewer_notes: z.string().optional(),
	})
	.strict();

export const SourcedClaimSchema = z
	.object({
		text: z.string(),
		fetched: z.literal(true),
		sourceUrl: z.string(),
		sourcedFrom: z.enum(["company-domain", "independent-reporting"]),
	})
	.strict();

/** Deprecated alias; use SourcedClaimSchema. */
export const VerifiedClaimSchema = SourcedClaimSchema;

export const SourcingReportSchema = z
	.object({
		sourcedCount: z.number(),
		droppedCount: z.number(),
		sources: z.array(z.string()),
		notes: z.array(z.string()),
	})
	.strict();

/** Deprecated alias; use SourcingReportSchema. */
export const VerificationReportSchema = SourcingReportSchema;

export const ResearchCompanyOutput = z
	.object({
		company: z.string(),
		cached: z.boolean(),
		cacheFile: z.string(),
		cacheText: z.string().describe("JSON cache payload; the host writes it verbatim to cacheFile"),
		entry: ResearchEntrySchema,
		claims: z.array(SourcedClaimSchema),
		sourcing: SourcingReportSchema,
		fetchSteps: z.array(z.string()),
		trustNote: z.string(),
	})
	.strict();
