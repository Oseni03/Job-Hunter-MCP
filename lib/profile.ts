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

/**
 * Prisma Profile row shape: the 15 ProfileSchema fields verbatim (arrays as
 * JSON, which runs on both SQLite and Postgres) plus storage columns. Keeping
 * this interface next to ProfileSchema means a schema drift breaks the
 * round-trip test instead of silently forking the stored profile from the
 * profile every tool passes around.
 */
export interface ProfileRow {
	userId: string;
	name: string;
	location: string;
	constraints: string;
	workCountry: string;
	citizenships: unknown;
	permitClasses: unknown;
	languages: unknown;
	primarySkills: unknown;
	secondarySkills: unknown;
	weakSkills: unknown;
	strongDomains: unknown;
	adjacentDomains: unknown;
	careerGoals: unknown;
	energizingTasks: unknown;
	drainingTasks: unknown;
	resumeHash: string | null;
}

/** Splits a validated profile into its Prisma row; the profile fields map 1:1. */
export function profileToRow(userId: string, profile: Profile, resumeHash: string | null): ProfileRow {
	return {
		userId,
		name: profile.name,
		location: profile.location,
		constraints: profile.constraints,
		workCountry: profile.workCountry,
		citizenships: profile.citizenships,
		permitClasses: profile.permitClasses,
		languages: profile.languages,
		primarySkills: profile.primarySkills,
		secondarySkills: profile.secondarySkills,
		weakSkills: profile.weakSkills,
		strongDomains: profile.strongDomains,
		adjacentDomains: profile.adjacentDomains,
		careerGoals: profile.careerGoals,
		energizingTasks: profile.energizingTasks,
		drainingTasks: profile.drainingTasks,
		resumeHash,
	};
}

/** Rebuilds the passed-around profile from a stored row; rejects drift via ProfileSchema. */
export function rowToProfile(row: Record<string, unknown>): Profile {
	const {
		userId: _userId,
		resumeHash: _resumeHash,
		updatedAt: _updatedAt,
		...profileFields
	} = row;
	return ProfileSchema.parse(profileFields);
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
