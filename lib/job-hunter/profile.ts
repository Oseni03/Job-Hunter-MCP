import { z } from "zod";

export const LanguageSchema = z
	.object({
		language: z.string().min(1),
		level: z.string().min(1),
		notes: z.string().optional(),
	})
	.strict();

/** Structured achievement inside an Experience entry. String pool derived for matching; never invent. */
export const EvidenceSchema = z
	.object({
		statement: z.string().min(1),
		metrics: z.array(z.string()).default([]),
		skills: z.array(z.string()).default([]),
		technologies: z.array(z.string()).default([]),
		impact: z.string().default(""),
	})
	.strict();

export type Evidence = z.infer<typeof EvidenceSchema>;

/** Stored career history (resume-core). Per-call tailor input keeps its own lightweight shape. */
export const CareerExperienceSchema = z
	.object({
		company: z.string().min(1),
		position: z.string().min(1),
		location: z.string().default(""),
		startDate: z.string().default(""),
		endDate: z.string().default(""),
		current: z.boolean().default(false),
		description: z.string().default(""),
		achievements: z.array(EvidenceSchema).default([]),
		technologies: z.array(z.string()).default([]),
	})
	.strict();

export type CareerExperience = z.infer<typeof CareerExperienceSchema>;

export const CareerEducationSchema = z
	.object({
		institution: z.string().min(1),
		degree: z.string().min(1),
		field: z.string().default(""),
		location: z.string().default(""),
		startDate: z.string().default(""),
		endDate: z.string().default(""),
		grade: z.string().default(""),
		description: z.string().default(""),
	})
	.strict();

export type CareerEducation = z.infer<typeof CareerEducationSchema>;

/** Unified skill with legacy category so old weighting survives the migration. */
export const UnifiedSkillSchema = z
	.object({
		name: z.string().min(1),
		category: z.enum(["primary", "secondary", "weak"]).default("secondary"),
		proficiency: z.string().optional(),
		years: z.number().nonnegative().optional(),
	})
	.strict();

export type UnifiedSkill = z.infer<typeof UnifiedSkillSchema>;

export const DomainItemSchema = z
	.object({
		name: z.string().min(1),
		category: z.enum(["strong", "adjacent"]).default("adjacent"),
	})
	.strict();

export type DomainItem = z.infer<typeof DomainItemSchema>;

export const ProjectSchema = z
	.object({
		name: z.string().min(1),
		description: z.string().default(""),
		technologies: z.array(z.string()).default([]),
		url: z.string().default(""),
		github: z.string().default(""),
		achievements: z.array(z.string()).default([]),
	})
	.strict();

export type Project = z.infer<typeof ProjectSchema>;

export const CertificationSchema = z
	.object({
		name: z.string().min(1),
		issuer: z.string().default(""),
		date: z.string().default(""),
		url: z.string().default(""),
	})
	.strict();

export type Certification = z.infer<typeof CertificationSchema>;

export const JobPreferencesSchema = z
	.object({
		targetRoles: z.array(z.string()).optional(),
		locations: z.array(z.string()).optional(),
		remote: z.boolean().optional(),
		employmentTypes: z.array(z.string()).optional(),
		industries: z.array(z.string()).optional(),
		preferredTechnologies: z.array(z.string()).optional(),
		salaryMin: z.number().nonnegative().optional(),
		salaryCurrency: z.string().optional(),
	})
	.strict();

export type JobPreferences = z.infer<typeof JobPreferencesSchema>;

export const DEFAULT_PREFERENCES: JobPreferences = {
	targetRoles: [],
	locations: [],
	remote: undefined,
	employmentTypes: [],
	industries: [],
	preferredTechnologies: [],
	salaryMin: undefined,
	salaryCurrency: "",
};

export const ProfileSchema = z
	.object({
		name: z.string().min(1),
		location: z.string(),
		workCountry: z.string(),
		permitClasses: z.array(z.string()),
		languages: z.array(LanguageSchema),
		energizingTasks: z.array(z.string()),
		drainingTasks: z.array(z.string()),
		// Resume-core (LLM-extracted). Optional during migration so stored
		// rows without the new columns still parse; new code reads them via
		// helpers with neutral defaults. Stored contact keeps full text for
		// tailoring; EventLog notes stay PII-redacted.
		headline: z.string().optional(),
		email: z.string().optional(),
		phone: z.string().optional(),
		website: z.string().optional(),
		linkedin: z.string().optional(),
		github: z.string().optional(),
		summary: z.string().optional(),
		experience: z.array(CareerExperienceSchema).optional(),
		education: z.array(CareerEducationSchema).optional(),
		skills: z.array(UnifiedSkillSchema).optional(),
		domains: z.array(DomainItemSchema).optional(),
		projects: z.array(ProjectSchema).optional(),
		certifications: z.array(CertificationSchema).optional(),
		preferences: JobPreferencesSchema.optional(),
	})
	.strict();

export type Profile = z.infer<typeof ProfileSchema>;

/**
 * Embedded default profile (mirrors 01-candidate-profile.md).
 * Placeholder values until the owner runs setup-profile; tools load the
 * stored profile for the authenticated caller and fall back here.
 */
export const DEFAULT_PROFILE: Profile = {
	name: "[YOUR_NAME]",
	location: "[YOUR_CITY], [YOUR_COUNTRY]",
	workCountry: "[YOUR_COUNTRY]",
	permitClasses: [],
	languages: [],
	energizingTasks: [],
	drainingTasks: [],
	headline: "",
	email: "",
	phone: "",
	website: "",
	linkedin: "",
	github: "",
	summary: "",
	experience: [],
	education: [],
	skills: [],
	domains: [],
	projects: [],
	certifications: [],
	preferences: { ...DEFAULT_PREFERENCES },
};

/** Merges a planner-level partial over the embedded default; the partial wins per field. */
export function resolveProfile(override: unknown): Profile {
	if (override === undefined || override === null) {
		return {
			...DEFAULT_PROFILE,
			preferences: { ...DEFAULT_PREFERENCES },
		};
	}
	return parseProfile({ ...DEFAULT_PROFILE, ...(override as Record<string, unknown>) });
}

/**
 * Legacy field names dropped from the table (ADR-0003). Old stored rows,
 * caller overrides, and pasted payloads may still carry them; fold into the
 * unified shape before strict parsing so nothing is silently lost. New code
 * must never emit these keys.
 */
const LEGACY_SKILL_FOLD: Array<[string, "primary" | "secondary" | "weak"]> = [
	["primarySkills", "primary"],
	["secondarySkills", "secondary"],
	["weakSkills", "weak"],
];

const LEGACY_DOMAIN_FOLD: Array<[string, "strong" | "adjacent"]> = [
	["strongDomains", "strong"],
	["adjacentDomains", "adjacent"],
];

const DROPPED_FIELDS = ["constraints", "citizenships"] as const;

function stringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export function foldLegacyFields(input: Record<string, unknown>): Record<string, unknown> {
	const folded: Record<string, unknown> = { ...input };
	const skills = Array.isArray(folded["skills"]) ? [...(folded["skills"] as unknown[])] : [];
	for (const [key, category] of LEGACY_SKILL_FOLD) {
		for (const name of stringArray(folded[key])) {
			if (!skills.some((entry) => (entry as { name?: unknown })?.name === name)) {
				skills.push({ name, category });
			}
		}
		delete folded[key];
	}
	const domains = Array.isArray(folded["domains"]) ? [...(folded["domains"] as unknown[])] : [];
	for (const [key, category] of LEGACY_DOMAIN_FOLD) {
		for (const name of stringArray(folded[key])) {
			if (!domains.some((entry) => (entry as { name?: unknown })?.name === name)) {
				domains.push({ name, category });
			}
		}
		delete folded[key];
	}
	const goals = stringArray(folded["careerGoals"]);
	if (goals.length > 0) {
		const preferences =
			folded["preferences"] !== null && typeof folded["preferences"] === "object" && !Array.isArray(folded["preferences"])
				? { ...folded["preferences"] as Record<string, unknown> }
				: {};
		const targetRoles = [...stringArray(preferences["targetRoles"]), ...goals].filter(
			(role, index, all) => all.indexOf(role) === index,
		);
		preferences["targetRoles"] = targetRoles;
		folded["preferences"] = preferences;
	}
	delete folded["careerGoals"];
	for (const key of DROPPED_FIELDS) delete folded[key];
	if (skills.length > 0 || "skills" in folded) folded["skills"] = skills;
	if (domains.length > 0 || "domains" in folded) folded["domains"] = domains;
	return folded;
}

/** Strict parse with legacy folding: old payloads migrate, new payloads pass through. */
export function parseProfile(input: unknown): Profile {
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		throw new Error("profile must be an object of Profile fields; nothing was stored.");
	}
	return ProfileSchema.parse(foldLegacyFields(input as Record<string, unknown>));
}

/**
 * Prisma Profile row shape: ProfileSchema fields verbatim (arrays/objects as
 * JSON, which runs on both SQLite and Postgres) plus storage columns. Keeping
 * this interface next to ProfileSchema means a schema drift breaks the
 * round-trip test instead of silently forking the stored profile from the
 * profile every tool passes around.
 */
export interface ProfileRow {
	userId: string;
	name: string;
	location: string;
	workCountry: string;
	permitClasses: unknown;
	languages: unknown;
	energizingTasks: unknown;
	drainingTasks: unknown;
	headline: string;
	email: string;
	phone: string;
	website: string;
	linkedin: string;
	github: string;
	summary: string;
	experience: unknown;
	education: unknown;
	skills: unknown;
	domains: unknown;
	projects: unknown;
	certifications: unknown;
	preferences: unknown;
	resumeHash: string | null;
}

/** Splits a validated profile into its Prisma row; the profile fields map 1:1. */
export function profileToRow(userId: string, profile: Profile, resumeHash: string | null): ProfileRow {
	return {
		userId,
		name: profile.name,
		location: profile.location,
		workCountry: profile.workCountry,
		permitClasses: profile.permitClasses,
		languages: profile.languages,
		energizingTasks: profile.energizingTasks,
		drainingTasks: profile.drainingTasks,
		headline: profile.headline ?? "",
		email: profile.email ?? "",
		phone: profile.phone ?? "",
		website: profile.website ?? "",
		linkedin: profile.linkedin ?? "",
		github: profile.github ?? "",
		summary: profile.summary ?? "",
		experience: profile.experience ?? [],
		education: profile.education ?? [],
		skills: profile.skills ?? [],
		domains: profile.domains ?? [],
		projects: profile.projects ?? [],
		certifications: profile.certifications ?? [],
		preferences: profile.preferences ?? { ...DEFAULT_PREFERENCES },
		resumeHash,
	};
}

/** Rebuilds the passed-around profile from a stored row; pre-prune columns fold via parseProfile. */
export function rowToProfile(row: Record<string, unknown>): Profile {
	const {
		userId: _userId,
		resumeHash: _resumeHash,
		updatedAt: _updatedAt,
		...profileFields
	} = row;
	return parseProfile(profileFields);
}

/**
 * Requirement-matching pool: unified skills/domains, career targets,
 * Evidence, and preferences/projects/experience. Deliberately excludes
 * energizing/drainingTasks (behavioral is its own dimension); letting an
 * energizer like "model building" satisfy a "model validation" requirement
 * would turn genuine gaps into bridges.
 */
export function matchingPool(profile: Profile): string[] {
	const skills = (profile.skills ?? []).filter((s) => s.category !== "weak");
	const domains = profile.domains ?? [];
	const preferences = profile.preferences;
	const projects = profile.projects ?? [];
	const experience = profile.experience ?? [];
	const targetRoles = preferences?.targetRoles ?? [];
	return [
		...skills.map((s) => s.name),
		...domains.map((d) => d.name),
		...(preferences?.preferredTechnologies ?? []),
		...targetRoles,
		...projects.flatMap((p) => [p.name, p.description, ...p.technologies]),
		...experience.flatMap((e) => [
			e.company,
			e.position,
			e.description,
			...e.technologies,
			...e.achievements.flatMap((a) => [a.statement, ...a.skills, ...a.technologies]),
		]),
	].filter((phrase) => phrase.trim().length >= 2);
}
export function evidencePool(profile: Profile): string[] {
	const skills = (profile.skills ?? []).filter((s) => s.category !== "weak");
	const domains = profile.domains ?? [];
	const preferences = profile.preferences;
	const projects = profile.projects ?? [];
	const experience = profile.experience ?? [];
	const targetRoles = preferences?.targetRoles ?? [];
	const unified = [
		...skills.map((s) => s.name),
		...domains.map((d) => d.name),
		...(preferences?.preferredTechnologies ?? []),
		...targetRoles,
		...projects.flatMap((p) => [p.name, p.description, ...p.technologies]),
		...experience.flatMap((e) => [
			e.company,
			e.position,
			e.description,
			...e.technologies,
			...e.achievements.flatMap((a) => [a.statement, ...a.skills, ...a.technologies]),
		]),
	];
	return [
		...unified,
		...profile.energizingTasks,
	].filter((phrase) => phrase.trim().length >= 2);
}

/** Primary-weighted names over the unified skill shape. */
export function primarySkillNames(profile: Profile): string[] {
	return (profile.skills ?? []).filter((s) => s.category === "primary").map((s) => s.name);
}

export function secondarySkillNames(profile: Profile): string[] {
	return (profile.skills ?? []).filter((s) => s.category === "secondary").map((s) => s.name);
}

/** Self-declared growth areas: gap-watch only, never coverage (claiming them would over-claim). */
export function weakSkillNames(profile: Profile): string[] {
	return (profile.skills ?? []).filter((s) => s.category === "weak").map((s) => s.name);
}

export function strongDomainNames(profile: Profile): string[] {
	return (profile.domains ?? []).filter((d) => d.category === "strong").map((d) => d.name);
}

export function adjacentDomainNames(profile: Profile): string[] {
	return (profile.domains ?? []).filter((d) => d.category !== "strong").map((d) => d.name);
}

/** Career targets: the folded replacement for the dropped careerGoals field. */
export function careerTargetNames(profile: Profile): string[] {
	return profile.preferences?.targetRoles ?? [];
}
