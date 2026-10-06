import { z } from "zod";

import { ExperienceInput, VerifiedSpecificInput } from "@/lib/job-hunter/schemas/common.ts";

/** Input/output contract for the draft-application-answers tool. */

export const ProjectInput = z
	.object({
		name: z.string().min(1).describe("Descriptive project name"),
		role: z.string().min(1).describe("True project role; ownership is scoped to it"),
		dates: z.string().min(1),
		description: z.string().min(1),
		inProgress: z.boolean().optional().describe("In-progress work is stated as such"),
	})
	.strict();

export const PortalFieldsInput = z
	.object({
		company: z.string().min(1).optional().describe("Employer name for the self-introduction tie"),
		employerPoints: z
			.array(z.union([z.string(), VerifiedSpecificInput]))
			.optional()
			.describe("Caller-verified employer facts with fetched source URLs; URL-less entries are refused"),
		experience: z.array(ExperienceInput).optional(),
		projects: z.array(ProjectInput).optional(),
		roleTypes: z.array(z.string()).optional().describe("Intro versions to draft; default technical and specialist"),
		targetWords: z.number().int().positive().optional().describe("Self-introduction target word count"),
		pitchContexts: z.array(z.string()).optional(),
		masterCvText: z.string().optional(),
		workspaceProfileText: z.string().optional(),
		cvText: z.string().optional().describe("Submitted CV text; joins the audit union and consistency check"),
		coverText: z.string().optional().describe("Submitted cover letter text; joins the audit union and check"),
		postingLanguage: z.string().optional().describe("Forms/posting language; the audit and stopwords are English-only"),
	})
	.strict();

export const PortalFieldsOutput = z
	.object({
		filePath: z.string().describe("Copy-paste file path; the host owns the write"),
		copyPasteText: z.string(),
		selfIntros: z.array(
			z.object({
				roleType: z.string(),
				text: z.string(),
				wordCount: z.number(),
				targetWords: z.number().nullable(),
				trimNote: z.string().nullable(),
			}),
		),
		projectEntries: z.array(
			z.object({
				name: z.string(),
				text: z.string(),
				wordCount: z.number(),
				lengthNote: z.string().nullable(),
				short: z.string(),
				shortWordCount: z.number(),
				shortNote: z.string().nullable().describe("Overshoot warning when the short exceeds the 60-word soft target"),
				scopeNote: z.string(),
				inProgressNote: z.string().nullable(),
			}),
		),
		pitches: z.array(
			z.object({ text: z.string(), charCount: z.number(), context: z.string(), recommended: z.boolean() }),
		),
		datesReference: z.array(z.string()),
		scopeNotes: z.array(z.string()),
		ungrounded: z.array(z.string()),
		warnings: z.array(z.string()),
	})
	.strict();
