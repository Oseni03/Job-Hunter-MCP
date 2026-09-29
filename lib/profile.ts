import { z } from "zod";

export const LanguageSchema = z
	.object({
		language: z.string().min(1),
		level: z.string().min(1),
		notes: z.string().optional(),
	})
	.strict();

export const ProfileSchema = z
	.object({
		name: z.string().min(1),
		location: z.string(),
		constraints: z.string(),
		workCountry: z.string(),
		citizenships: z.array(z.string()),
		permitClasses: z.array(z.string()),
		languages: z.array(LanguageSchema),
		primarySkills: z.array(z.string()),
		secondarySkills: z.array(z.string()),
		weakSkills: z.array(z.string()),
		strongDomains: z.array(z.string()),
		adjacentDomains: z.array(z.string()),
		careerGoals: z.array(z.string()),
		energizingTasks: z.array(z.string()),
		drainingTasks: z.array(z.string()),
	})
	.strict();

export type Profile = z.infer<typeof ProfileSchema>;

/**
 * Embedded default profile (mirrors 01-candidate-profile.md).
 * Placeholder values until the owner runs /setup; every call may
 * override any field, and the per-call override always wins.
 */
export const DEFAULT_PROFILE: Profile = {
	name: "[YOUR_NAME]",
	location: "[YOUR_CITY], [YOUR_COUNTRY]",
	constraints: "[YOUR_COMMUTE_CONSTRAINTS]",
	workCountry: "[YOUR_COUNTRY]",
	citizenships: [],
	permitClasses: [],
	languages: [],
	primarySkills: [],
	secondarySkills: [],
	weakSkills: [],
	strongDomains: [],
	adjacentDomains: [],
	careerGoals: [],
	energizingTasks: [],
	drainingTasks: [],
};

/** Merges a per-call override over the embedded default; override wins per field. */
export function resolveProfile(override: unknown): Profile {
	if (override === undefined || override === null) {
		return { ...DEFAULT_PROFILE };
	}
	return ProfileSchema.parse({ ...DEFAULT_PROFILE, ...(override as Record<string, unknown>) });
}

/** Candidate-stated phrases other tools ground their output in (skills, domains, goals, energizers). */
export function evidencePool(profile: Profile): string[] {
	return [
		...profile.primarySkills,
		...profile.secondarySkills,
		...profile.strongDomains,
		...profile.adjacentDomains,
		...profile.careerGoals,
		...profile.energizingTasks,
	].filter((phrase) => phrase.trim().length >= 2);
}
