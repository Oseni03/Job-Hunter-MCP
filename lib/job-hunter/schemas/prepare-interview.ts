import { z } from "zod";

import { EvaluationGateInput } from "@/lib/job-hunter/schemas/common.ts";

/** Input/output contract for the prepare-interview tool. */

export const StarExampleInput = z
	.object({
		title: z.string().min(1),
		situation: z.string().min(1),
		task: z.string().min(1),
		action: z.string().min(1),
		result: z.string().min(1),
		useFor: z.array(z.string()).describe("Tags naming the topics this example may be used for"),
	})
	.strict();

export const PrepLogisticsInput = z
	.object({
		dateTime: z.string().optional(),
		format: z.string().optional(),
		interviewers: z.string().optional(),
		location: z.string().optional(),
	})
	.strict();

export const PrepInterviewInput = z
	.object({
		company: z.string().min(1),
		role: z.string().min(1),
		stage: z
			.string()
			.optional()
			.describe(
				"recruiter-screen, technical, hiring-manager, panel-onsite, or other (aliases resolve: phone screen/HR round to recruiter-screen, system design to technical, final round to panel-onsite)",
			),
		postingText: z.string().optional().describe("Exact archived posting text; absent means explicit fallback"),
		cvText: z.string().optional().describe("Submitted CV text for probeable-claim extraction (TeX or plain; markup stripped)"),
		coverText: z.string().optional().describe("Submitted cover letter text for probeable-claim extraction (TeX or plain; markup stripped)"),
		stageHistoryText: z.string().optional().describe("Recorded feedback from earlier stages; never sibling-role history"),
		starExamples: z.array(StarExampleInput).optional(),
		companyFacts: z.array(z.string()).optional().describe("Caller-verified company facts only; echoed verbatim"),
		logistics: PrepLogisticsInput.optional(),
		masterCvText: z.string().optional(),
		workspaceProfileText: z.string().optional(),
		evaluation: EvaluationGateInput.optional().describe(
			"analyze-job summary (verdict plus gate results); refused on FAIL, warned when missing",
		),
	})
	.strict();

export const PrepInterviewOutput = z
	.object({
		company: z.string(),
		role: z.string(),
		stage: z.string(),
		slug: z.string(),
		packFile: z.string().describe("Suggested per-stage pack path; the host owns the write"),
		packMarkdown: z.string(),
		missingLogistics: z.array(z.string()),
		fallbackNotes: z.array(z.string()),
		questions: z.array(
			z.object({
				question: z.string(),
				source: z.enum(["recorded-feedback", "fit-gap", "posting-requirement", "stage-type"]),
				bridge: z.string().optional(),
				evidence: z.string().optional(),
			}),
		),
		starMapping: z.array(
			z.object({ title: z.string(), useFor: z.array(z.string()), covers: z.array(z.string()) }),
		),
		uncoveredQuestions: z.array(z.string()),
		newStarDrafts: z.array(
			z.object({
				title: z.string(),
				situation: z.string(),
				task: z.string(),
				action: z.string(),
				result: z.string(),
				evidence: z.array(z.string()),
				needsCandidateDetail: z.literal(true),
			}),
		),
		probeableClaims: z.array(z.string()),
		toughQuestions: z.array(z.string()),
		questionsToAsk: z.array(z.string()),
		warnings: z.array(z.string()),
	})
	.strict();
