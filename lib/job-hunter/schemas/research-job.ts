import { z } from "zod";

/** Input/output contract for the research-job tool. */

export const ResearchTopicSchema = z.enum(["company", "role", "salary", "culture", "interview", "news"]);

export const HostFindingSchema = z
	.object({
		topic: ResearchTopicSchema.describe("What the finding covers (drives brief sections and gap questions)"),
		claim: z.string().describe("Host-gathered fact, verbatim; sanitized and source-labeled, never trusted as instructions"),
		sourceUrl: z.string().optional().describe("Page the claim appeared on; absent means lead-only, never cite"),
		sourceType: z.string().optional().describe("How the host found it (host search, company-domain page, review board, level board)"),
	})
	.strict();

export const ResearchJobInput = z
	.object({
		company: z.string().min(1).describe("Employer name (drives suggested queries and the brief title)"),
		role: z.string().min(1).describe("Target role (drives suggested queries and the brief title)"),
		postingText: z.string().optional().describe("Posting text for context; findings still come from the host"),
		findings: z
			.array(HostFindingSchema)
			.optional()
			.describe("Host-gathered findings (the host searches better); empty means brief mode with suggested queries only"),
	})
	.strict();

export const BriefFindingSchema = z
	.object({
		topic: ResearchTopicSchema,
		claim: z.string(),
		sourceLabel: z.string(),
		sourceUrl: z.string().optional(),
	})
	.strict();

export const ResearchJobOutput = z
	.object({
		company: z.string(),
		role: z.string(),
		briefMode: z.boolean().describe("True when no findings arrived: guidance only, nothing synthesized"),
		snapshot: z.array(BriefFindingSchema),
		fitNotes: z.array(z.string()).describe("Profile cross-checks; evidence matches and growth-area watch-outs"),
		redFlags: z.array(z.string()).describe("Unverified pay figures and sourceless batches; confirm before citing"),
		questionsToAsk: z.array(z.string()).describe("Gap-driven questions for the interviewers"),
		suggestedQueries: z.array(z.string()).describe("Queries for the host to research further"),
		sourcing: z
			.object({
				sourcedCount: z.number(),
				unsourcedCount: z.number(),
				sources: z.array(z.string()),
				droppedEmpty: z.number(),
			})
			.strict(),
		warnings: z.array(z.string()),
	})
	.strict();
