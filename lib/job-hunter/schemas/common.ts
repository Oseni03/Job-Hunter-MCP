import { z } from "zod";

/**
 * Shared schema building blocks used by more than one tool's input/output
 * contract. Tool-specific contracts live next to their tool name in this
 * directory (analyze-job.ts, tailor-resume.ts, ...).
 */

export const TemplateOverrideInput = z
	.object({
		name: z.string().min(1).optional(),
		sourceExtension: z.string().min(1).optional(),
		compileCommand: z.string().min(1).optional(),
		pageLimit: z.number().int().positive().optional(),
		styleRules: z.string().optional(),
		engine: z.string().optional(),
	})
	.strict();

export const ExperienceInput = z
	.object({
		title: z.string().min(1),
		company: z.string().min(1),
		period: z.string().min(1),
		bullets: z.array(z.string()),
	})
	.strict();

export const EducationInput = z
	.object({
		degree: z.string().min(1),
		period: z.string().min(1),
		institution: z.string().min(1),
		inProgress: z.boolean().optional(),
		expectedDate: z.string().optional(),
	})
	.strict();

export const ContactInput = z
	.object({
		email: z.string().optional(),
		phone: z.string().optional(),
		linkedin: z.string().optional(),
		github: z.string().optional(),
	})
	.strict();

export const CoverageSchema = z.array(
	z.object({
		requirement: z.string(),
		kind: z.enum(["essential", "nice-to-have"]),
		status: z.enum(["matched", "bridged", "gap"]),
		evidence: z.string().optional(),
	}),
);

export const PageBudgetSchema = z
	.object({
		kind: z.enum(["cv", "letter"]),
		pageLimit: z.number(),
		wordCount: z.number(),
		wordBudgetMin: z.number().nullable(),
		wordBudgetMax: z.number().nullable(),
		overBudget: z.boolean(),
		shapingNotes: z.array(z.string()),
	})
	.strict();

export const SafetyCheckSchema = z
	.object({ name: z.string(), pass: z.boolean(), detail: z.string() })
	.strict();

export const LatexSafetySchema = z
	.object({ passed: z.boolean(), checks: z.array(SafetyCheckSchema) })
	.strict();

export const LayoutSignalsSchema = z
	.object({ degraded: z.boolean(), note: z.string().nullable(), problems: z.array(z.string()) })
	.strict();

export const DocumentSignalsSchema = z
	.object({
		pageBudget: PageBudgetSchema,
		latexSafety: LatexSafetySchema,
		layout: LayoutSignalsSchema,
	})
	.strict();

export const VerificationSchema = z
	.object({
		compiles: z.boolean(),
		keywordOverlap: z.number(),
		noNewEmployers: z.boolean(),
	})
	.strict();

export const EvaluationGateInput = z
	.object({
		verdict: z.string().nullable().optional().describe("analyze-job verdict; null when a gate failed"),
		eligibility: z.object({ verdict: z.string() }).optional().describe("Eligibility gate result"),
		languageGate: z.object({ verdict: z.string() }).optional().describe("Language gate result"),
	})
	.strict();

export const DroppedBulletSchema = z
	.object({ role: z.string(), bullet: z.string() })
	.strict();

export const VerifiedSpecificInput = z
	.object({ text: z.string().min(1), sourceUrl: z.string().min(1) })
	.strict();
