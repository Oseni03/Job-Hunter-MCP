import { auditClaim, checkSourceConsistency, englishOnlyNote } from "@/lib/tailor.ts";
import { resolveProfile, evidencePool } from "@/lib/profile.ts";

export const PORTAL_FIELDS_FILE = "documents/portal-fields.md";

export const FIELD_ROLE_TYPES = ["technical", "specialist"] as const;
export type FieldRoleType = (typeof FIELD_ROLE_TYPES)[number];

const DEFAULT_PITCH_CONTEXTS = ["networking", "linkedin-message", "recruiter-email", "application-summary"];

export interface FieldExperience {
	title: string;
	company: string;
	period: string;
	bullets: string[];
}

export interface FieldProject {
	name: string;
	role: string;
	dates: string;
	description: string;
	inProgress?: boolean;
}

export interface FieldsInput {
	profile?: unknown;
	/** Employer name for the self-introduction tie; omitted when absent. */
	company?: string;
	/** Caller-verified employer facts for the tie; never invented. */
	employerPoints?: string[];
	experience?: FieldExperience[];
	projects?: FieldProject[];
	roleTypes?: string[];
	/** Self-introduction target word count; output states the count plus a trim note when over. */
	targetWords?: number;
	pitchContexts?: string[];
	masterCvText?: string;
	workspaceProfileText?: string;
	/** Submitted CV text; joins the audit union and consistency check. */
	cvText?: string;
	/** Submitted cover letter text; joins the audit union and consistency check. */
	coverText?: string;
	/** Forms/posting language; the audit and stopwords are English-only. */
	postingLanguage?: string;
}

export interface SelfIntro {
	roleType: string;
	text: string;
	wordCount: number;
	targetWords: number | null;
	trimNote: string | null;
}

export interface ProjectEntry {
	name: string;
	text: string;
	wordCount: number;
	lengthNote: string | null;
	short: string;
	shortWordCount: number;
	scopeNote: string;
	inProgressNote: string | null;
}

export interface Pitch {
	text: string;
	charCount: number;
	context: string;
	recommended: boolean;
}

export interface FieldsPlan {
	filePath: string;
	copyPasteText: string;
	selfIntros: SelfIntro[];
	projectEntries: ProjectEntry[];
	pitches: Pitch[];
	datesReference: string[];
	scopeNotes: string[];
	/** Generated claims that fail the union audit; flagged, never silently kept. */
	ungrounded: string[];
	warnings: string[];
}

export function countWords(text: string): number {
	return text.split(/\s+/).filter(Boolean).length;
}

export function countChars(text: string): number {
	return [...text].length;
}

/** Every caller-held fact joins the audit union; generated claims must trace to it. */
function unionSources(input: FieldsInput): string[] {
	const profile = resolveProfile(input.profile);
	const sources: string[] = [
		profile.name,
		...evidencePool(profile),
		input.masterCvText ?? "",
		input.workspaceProfileText ?? "",
		input.cvText ?? "",
		input.coverText ?? "",
		input.company ?? "",
		...(input.employerPoints ?? []),
	];
	for (const experience of input.experience ?? []) {
		sources.push(experience.title, experience.company, experience.period, ...experience.bullets);
	}
	for (const project of input.projects ?? []) {
		sources.push(project.name, project.role, project.dates, project.description);
	}
	return sources;
}

function splitSentences(text: string): string[] {
	return text
		.split(/(?<=\.)\s+/)
		.map((sentence) => sentence.trim())
		.filter((sentence) => sentence.length > 0);
}

function buildShort(description: string): string {
	const sentences: string[] = [];
	let total = 0;
	for (const sentence of splitSentences(description)) {
		const words = countWords(sentence);
		if (sentences.length > 0 && total + words > 60) {
			break;
		}
		sentences.push(sentence);
		total += words;
	}
	return sentences.join(" ");
}

/**
 * Drafts portal copy-paste fields from caller-held facts only. Generated
 * prose reuses the caller's own words, so every claim audits against the
 * profile union; counts are measured; shortfalls and in-progress work are
 * stated instead of smoothed over.
 */
export function planPortalFields(input: FieldsInput): FieldsPlan {
	const profile = resolveProfile(input.profile);
	const pool = evidencePool(profile);
	const union = unionSources(input);
	const warnings = checkSourceConsistency(profile, input.masterCvText, input.workspaceProfileText);
	if ((input.postingLanguage ?? "en").toLowerCase() !== "en") {
		warnings.push(englishOnlyNote(input.postingLanguage ?? "en"));
	}
	if (!profile.name.includes("YOUR")) {
		const submitted: Array<[string, string | undefined]> = [
			["submitted CV", input.cvText],
			["submitted cover letter", input.coverText],
		];
		for (const [label, text] of submitted) {
			if (text && !text.toLowerCase().includes(profile.name.toLowerCase())) {
				warnings.push(
					`Profile name '${profile.name}' not found in ${label}; confirm which source is current before drafting.`,
				);
			}
		}
	}
	const ungrounded: string[] = [];

	const audit = (label: string, text: string) => {
		const result = auditClaim(text, union);
		if (!result.grounded) {
			ungrounded.push(`${label} drifts from the union (missing: ${result.missing.join(", ")}).`);
		}
	};

	const placeholder = profile.name.includes("YOUR") || pool.length === 0;
	if (placeholder) {
		warnings.push("Profile is still a placeholder; no self-introductions or pitches drafted until /setup provides real facts.");
	}

	const roleTypes = (input.roleTypes ?? [...FIELD_ROLE_TYPES]).filter((role): role is FieldRoleType =>
		(FIELD_ROLE_TYPES as readonly string[]).includes(role),
	);
	const effectiveRoles = roleTypes.length > 0 ? roleTypes : [...FIELD_ROLE_TYPES];

	const skillLine = [...profile.primarySkills, ...profile.secondarySkills].slice(0, 2).join(", ");
	const domain = profile.strongDomains[0] ?? profile.adjacentDomains[0] ?? "";
	const goal = profile.careerGoals[0] ?? "";
	const energizing = profile.energizingTasks[0] ?? "";

	const selfIntros: SelfIntro[] = [];
	if (!placeholder && skillLine) {
		for (const roleType of effectiveRoles) {
			const lead = roleType === "technical" ? `${skillLine}; ${domain}.` : `${domain}; ${skillLine}.`;
			const parts = [`${profile.name} — ${lead}`];
			const second = [
				...(goal ? [goal] : []),
				...(energizing ? [energizing] : []),
				...profile.secondarySkills,
			];
			if (second.length > 0) {
				parts.push(`${second.join("; ")}.`);
			}
			if (input.company && input.employerPoints?.[0]) {
				parts.push(`${input.company}: ${input.employerPoints[0]}`);
			} else if (input.company) {
				parts.push(`For ${input.company}.`);
			}
			const text = parts.join(" ");
			audit(`self-introduction (${roleType})`, text);
			const wordCount = countWords(text);
			const targetWords = input.targetWords ?? null;
			selfIntros.push({
				roleType,
				text,
				wordCount,
				targetWords,
				trimNote:
					targetWords !== null && wordCount > targetWords
						? `${wordCount - targetWords} words over the ${targetWords}-word target; drop the middle sentence to fit.`
						: null,
			});
		}
	}

	const projectEntries: ProjectEntry[] = [];
	for (const project of input.projects ?? []) {
		const text = `${project.name} — ${project.role}, ${project.dates}. ${project.description}`.trim();
		audit(`project entry (${project.name})`, text);
		const wordCount = countWords(text);
		const lengthNote =
			wordCount < 100
				? `${wordCount} words, below the 100-150 band; add detail from your records rather than padding.`
				: wordCount > 150
					? `${wordCount} words, above the 100-150 band; trim detail rather than compressing claims.`
					: null;
		const short = buildShort(project.description);
		audit(`project short (${project.name})`, short);
		projectEntries.push({
			name: project.name,
			text,
			wordCount,
			lengthNote,
			short,
			shortWordCount: countWords(short),
			scopeNote: `Ownership scoped to the stated project role (${project.role}); team outcomes are not claimed as solo.`,
			inProgressNote: project.inProgress ? `In progress — stated as such; dates read "${project.dates}".` : null,
		});
	}

	const skills = [...profile.primarySkills, ...profile.secondarySkills];
	const domains = [...profile.strongDomains, ...profile.adjacentDomains];
	const candidates: string[] = [];
	for (const skill of skills.slice(0, 3)) {
		for (const item of domains.slice(0, 2)) {
			candidates.push(`${skill} for ${item}.`);
		}
	}
	for (const item of profile.careerGoals.slice(0, 2)) {
		for (const skill of skills.slice(0, 2)) {
			candidates.push(`${item} — ${skill}.`);
		}
	}
	if (domains[0] && skills[1]) {
		candidates.push(`${domains[0]}, ${skills[0]} and ${skills[1]}.`);
	}
	const seen = new Set<string>();
	const pitchTexts = candidates.filter((text) => {
		if (seen.has(text)) {
			return false;
		}
		seen.add(text);
		return true;
	}).slice(0, 6);

	const contexts = input.pitchContexts ?? DEFAULT_PITCH_CONTEXTS;
	const pitches: Pitch[] = pitchTexts.map((text, index) => {
		audit(`pitch (${text})`, text);
		return {
			text,
			charCount: countChars(text),
			context: contexts[index % contexts.length],
			recommended: index < contexts.length,
		};
	});
	if (!placeholder && pitches.length === 0) {
		warnings.push("No pitches drafted: the profile holds no skills, domains, or goals to pitch from.");
	} else if (!placeholder && pitches.length < 4) {
		warnings.push(
			`Only ${pitches.length} pitches drafted from thin profile facts; add skills, domains, or goals to reach 4-6.`,
		);
	}

	const datesReference: string[] = [];
	for (const experience of input.experience ?? []) {
		if (!datesReference.includes(experience.period)) {
			datesReference.push(experience.period);
		}
	}
	for (const project of input.projects ?? []) {
		if (!datesReference.includes(project.dates)) {
			datesReference.push(project.dates);
		}
	}

	const scopeNotes = [
		input.company
			? "Employer tie is a caller-provided fact, not a profile claim; verify it before submitting."
			: "No employer tie held; self-introductions end without one rather than inventing it.",
		"Project scope notes sit on each entry; team outcomes are never claimed as solo.",
	];

	const copyPasteText = renderCopyPaste({
		selfIntros,
		projectEntries,
		pitches,
		datesReference,
		scopeNotes,
	});

	return {
		filePath: PORTAL_FIELDS_FILE,
		copyPasteText,
		selfIntros,
		projectEntries,
		pitches,
		datesReference,
		scopeNotes,
		ungrounded,
		warnings,
	};
}

function renderCopyPaste(plan: {
	selfIntros: SelfIntro[];
	projectEntries: ProjectEntry[];
	pitches: Pitch[];
	datesReference: string[];
	scopeNotes: string[];
}): string {
	const lines = [
		"# Portal fields (copy-paste)",
		"",
		`- Host: save this file to \`${PORTAL_FIELDS_FILE}\` verbatim.`,
		"",
		"## Self-introductions (strongest evidence first)",
		...(plan.selfIntros.length > 0
			? plan.selfIntros.flatMap((intro) => [
					`### ${intro.roleType} (${intro.wordCount} words${intro.targetWords !== null ? `, target ${intro.targetWords}` : ""})`,
					intro.text,
					...(intro.trimNote ? [`_${intro.trimNote}_`] : []),
					"",
				])
			: ["- None drafted.", ""]),
		"## Project entries",
		...(plan.projectEntries.length > 0
			? plan.projectEntries.flatMap((entry) => [
					`### ${entry.name} (${entry.wordCount} words; short ${entry.shortWordCount} words)`,
					entry.text,
					"",
					`Short (60 words max): ${entry.short}`,
					"",
					`- ${entry.scopeNote}`,
					...(entry.inProgressNote ? [`- ${entry.inProgressNote}`] : []),
					...(entry.lengthNote ? [`- _${entry.lengthNote}_`] : []),
					"",
				])
			: ["- None held.", ""]),
		"## Character pitches",
		...(plan.pitches.length > 0
			? plan.pitches.map(
					(pitch) =>
						`- ${pitch.text} (${pitch.charCount} characters) — ${pitch.context}${pitch.recommended ? " — recommended" : ""}`,
				)
			: ["- None drafted."]),
		"",
		"## Dates reference",
		...(plan.datesReference.length > 0 ? plan.datesReference.map((dates) => `- ${dates}`) : ["- None held."]),
		"",
		"## Scope notes (internal — do not paste)",
		...plan.scopeNotes.map((note) => `- ${note}`),
	];
	return lines.join("\n");
}
