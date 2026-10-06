import { z } from "zod";

/** Input/output contract for the analyze-job tool. */

export const EvaluateJobInput = z
	.object({
		postingText: z
			.string()
			.min(1)
			.optional()
			.describe("Full posting text, pasted by the caller (preferred input)"),
		postingUrl: z.string().url().optional().describe("Posting URL to fetch when no text is pasted"),
		company: z.string().min(1).optional().describe("Employer name (drives employer-site search and research)"),
		role: z.string().min(1).optional().describe("Role title (drives employer-site search)"),
		companyUrl: z.string().url().optional().describe("Official company site override for research"),
		llm: z
			.object({
				mode: z.enum(["auto", "off"]).default("auto"),
				model: z.string().min(1).optional().describe("Groq model override (sampling uses the host model)"),
			})
			.strict()
			.optional()
			.describe("LLM refinement: sampling, then Groq, then heuristic scaffold unchanged"),
	})
	.strict();

const GateSchema = z.object({
	verdict: z.string(),
	quote: z.string().optional(),
	note: z.string(),
});

export const EvaluationSchema = z
	.object({
		scored: z.boolean(),
		eligibility: GateSchema,
		languageGate: GateSchema,
		dimensions: z.array(
			z.object({
				dimension: z.string(),
				score: z.number().nullable(),
				status: z.string().optional(),
				notes: z.string(),
			}),
		),
		overallScore: z.number().nullable(),
		verdict: z.string().nullable(),
		strengths: z.array(z.string()),
		gaps: z.array(z.string()),
		recommendation: z.string(),
		shouldCallEmployer: z.object({ suggest: z.boolean(), reason: z.string() }),
		needsConfirmation: z.literal(true),
		deadline: z.string().nullable(),
		source: z.string(),
		archive: z.string(),
		companyResearch: z.object({
			cached: z.boolean(),
			cacheFile: z.string(),
			websiteUrl: z.string().nullable(),
			websiteNotes: z.string().nullable(),
		}),
		refinement: z.object({
			source: z.enum(["sampling", "groq", "heuristic"]),
			model: z.string().nullable(),
			note: z.string(),
		}),
		fetchSteps: z.array(z.string()),
		discrepancies: z.array(z.string()),
	})
	.strict();
