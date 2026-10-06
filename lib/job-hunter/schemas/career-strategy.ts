import { z } from "zod";

/** Input/output contract for the career-strategy tool. */

export const EvaluationSummaryInput = z
	.object({
		fitScore: z.number().min(0).max(100).optional(),
		verdict: z.string().optional(),
		strengths: z.array(z.string()).optional(),
		gaps: z.array(z.string()).optional(),
	})
	.strict();

export const StrategyInput = z
	.object({
		evaluationSummary: EvaluationSummaryInput.optional().describe("Caller-passed analyze-job output"),
		evaluationSummaries: z
			.array(EvaluationSummaryInput)
			.optional()
			.describe("More caller-passed analyze-job outputs; gaps recurring across summaries become priority gaps"),
		focusAreas: z.array(z.string()).optional().describe("Candidate-nominated directions to assess"),
		masterCvText: z.string().optional(),
		workspaceProfileText: z.string().optional(),
	})
	.strict();

export const StrategyOutput = z
	.object({
		directions: z.array(
			z.object({
				direction: z.string(),
				why: z.array(z.string()),
				evidence: z.array(z.string()),
				gapsToClose: z.array(z.string()),
				dimensions: z.array(z.string()),
			}),
		),
		skipped: z.array(z.string()).describe("Nominated areas with no grounding; honestly excluded"),
		priorityGaps: z.array(z.string()).describe("Gaps recurring across two or more evaluation summaries"),
		avoidNotes: z.array(z.string()),
		frameworkNote: z.string(),
		warnings: z.array(z.string()),
	})
	.strict();
