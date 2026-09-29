import type { Profile } from "./profile.ts";

export type EligibilityVerdict = "PASS" | "FAIL" | "PROCEED_UNVERIFIED";
export type LanguageVerdict = "PASS" | "FAIL" | "FLAG";

export interface GateResult<TVerdict extends string> {
	verdict: TVerdict;
	/** Exact posting line that triggered the verdict, when one matched. */
	quote?: string;
	note: string;
}

const CITIZENSHIP_PATTERNS = [
	/must be (a )?citizens? of/i,
	/citizenship (is )?required/i,
	/(only )?(citizens|permanent residents)( of| may| can| need)?/i,
	/permanent residen\w* (required|is required|essential)/i,
	/\bPR required\b/i,
	/full working rights/i,
];

const CLEARANCE_PATTERNS = [
	/security clearance/i,
	/security[-\s]?cleared/i,
	/\bSC cleared\b/i,
	/\bDV cleared\b/i,
	/must hold .*clearance/i,
];

const WELCOME_PATTERNS = [
	/international applicants/i,
	/visa holders considered/i,
	/we sponsor/i,
	/sponsorship (available|offered|considered|provided)/i,
];

/** The posting line containing the match, trimmed; whole text when single-line. */
function quoteLine(text: string, matchIndex: number): string {
	const lines = text.split(/\r?\n/);
	let offset = 0;
	for (const line of lines) {
		if (matchIndex >= offset && matchIndex < offset + line.length + 1) {
			return line.trim();
		}
		offset += line.length + 1;
	}
	return text.trim().slice(0, 280);
}

function firstMatch(text: string, patterns: RegExp[]): { quote: string } | null {
	for (const pattern of patterns) {
		const match = pattern.exec(text);
		if (match && match.index !== undefined) {
			return { quote: quoteLine(text, match.index) };
		}
	}
	return null;
}

/**
 * Eligibility Gate — hard filter before scoring (04-job-evaluation.md).
 * FAIL stops: quote the exact wording. Silence is not permission:
 * PROCEED_UNVERIFIED with a role-level check on the employer's own pages.
 */
export function checkEligibility(
	postingText: string,
	profile: Profile,
): GateResult<EligibilityVerdict> {
	const citizenship = firstMatch(postingText, CITIZENSHIP_PATTERNS);
	if (citizenship) {
		return {
			verdict: "FAIL",
			quote: citizenship.quote,
			note: "Posting states a citizenship or residency requirement. Do not score or draft; report the quoted wording to the user.",
		};
	}
	const clearance = firstMatch(postingText, CLEARANCE_PATTERNS);
	if (clearance) {
		return {
			verdict: "FAIL",
			quote: clearance.quote,
			note: "Posting requires a security clearance, which is normally gated on citizenship. Verify the specific scheme before ruling the role out entirely; report the quoted wording to the user.",
		};
	}

	const namedPermit = profile.permitClasses.find((permit) =>
		permit !== "" && postingText.toLowerCase().includes(permit.toLowerCase()),
	);
	if (namedPermit) {
		return {
			verdict: "PASS",
			quote: quoteLine(postingText, postingText.toLowerCase().indexOf(namedPermit.toLowerCase())),
			note: `Posting explicitly names the candidate's permit class (${namedPermit}). Verified acceptance.`,
		};
	}

	const welcome = firstMatch(postingText, WELCOME_PATTERNS);
	if (welcome) {
		return {
			verdict: "PASS",
			quote: welcome.quote,
			note: "Posting explicitly welcomes international applicants or offers sponsorship.",
		};
	}

	return {
		verdict: "PROCEED_UNVERIFIED",
		note: "Posting is silent on citizenship and residency. Silence is not permission: check the employer's own careers or international-applicant page for a role-level decision before drafting, especially for professional services, government/defence, banking, telecom, or critical infrastructure.",
	};
}

const LEVEL_RANKS: Array<[RegExp, number]> = [
	[/\ba1\b/i, 1],
	[/\ba2\b/i, 2],
	[/\bb1\b/i, 3],
		[/conversational/i, 3],
	[/\bb2\b/i, 4],
	[/professional/i, 5],
	[/business[-\s]?level/i, 5],
	[/\bc1\b/i, 6],
	[/fluent/i, 6],
	[/\bc2\b/i, 7],
	[/native/i, 8],
];

const KNOWN_LANGUAGES = [
	"English",
	"Danish",
	"German",
	"French",
	"Spanish",
	"Swedish",
	"Norwegian",
	"Dutch",
	"Polish",
	"Russian",
	"Ukrainian",
	"Italian",
	"Portuguese",
	"Arabic",
	"Turkish",
	"Chinese",
	"Mandarin",
	"Cantonese",
	"Japanese",
	"Korean",
	"Hindi",
	"Urdu",
	"Bengali",
	"Finnish",
	"Icelandic",
	"Greek",
	"Czech",
	"Slovak",
	"Hungarian",
	"Romanian",
	"Bulgarian",
	"Croatian",
	"Serbian",
	"Slovenian",
	"Lithuanian",
	"Latvian",
	"Estonian",
	"Hebrew",
	"Persian",
	"Farsi",
	"Thai",
	"Vietnamese",
	"Indonesian",
	"Malay",
	"Tagalog",
	"Swahili",
	"Catalan",
	"Basque",
	"Galician",
	"Welsh",
	"Irish",
	"Gaelic",
	"Maltese",
	"Luxembourgish",
	"Frisian",
	"Faroese",
	"Greenlandic",
	"Albanian",
	"Macedonian",
	"Bosnian",
	"Belarusian",
	"Georgian",
	"Armenian",
	"Azerbaijani",
	"Kazakh",
	"Nepali",
	"Tamil",
	"Telugu",
	"Malayalam",
	"Kannada",
	"Marathi",
	"Gujarati",
	"Punjabi",
	"Sinhala",
	"Burmese",
	"Khmer",
	"Lao",
	"Mongolian",
	"Amharic",
	"Somali",
	"Yoruba",
	"Hausa",
	"Zulu",
	"Afrikaans",
];

const REQUIREMENT_CONTEXT = /requir|essential|must|mandatory|fluent|proficient|native|needed|plus\b|desirable/i;

function rankOf(levelText: string): number | null {
	let rank: number | null = null;
	for (const [pattern, value] of LEVEL_RANKS) {
		if (pattern.test(levelText)) {
			rank = rank === null ? value : Math.max(rank, value);
		}
	}
	return rank;
}

interface LanguageRequirement {
	language: string;
	line: string;
	barRank: number | null;
}

/** Languages required as a job condition: named language on a requirement-context line. */
function extractLanguageRequirements(postingText: string): LanguageRequirement[] {
	const found: LanguageRequirement[] = [];
	for (const rawLine of postingText.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || !REQUIREMENT_CONTEXT.test(line)) {
			continue;
		}
		for (const language of KNOWN_LANGUAGES) {
			if (new RegExp(`\\b${language}\\b`, "i").test(line)) {
				found.push({ language, line, barRank: rankOf(line) });
			}
		}
	}
	return found;
}

/**
 * Language Gate — hard filter before scoring (04-job-evaluation.md).
 * Undeclared required language FAILs. A plausibly higher bar FLAGs with
 * both the posting requirement and the declared level quoted, then proceeds.
 */
export function checkLanguage(postingText: string, profile: Profile): GateResult<LanguageVerdict> {
	const requirements = extractLanguageRequirements(postingText);
	if (requirements.length === 0) {
		return { verdict: "PASS", note: "No explicit language requirement stated for the role." };
	}

	const declared = new Map(
		profile.languages.map((entry) => [entry.language.toLowerCase(), entry.level]),
	);

	for (const req of requirements) {
		const declaredLevel = declared.get(req.language.toLowerCase());
		if (declaredLevel === undefined) {
			return {
				verdict: "FAIL",
				quote: req.line,
				note: `${req.language} is required as a job condition but is not on the candidate's Languages table. Do not score or draft.`,
			};
		}
		if (req.barRank !== null) {
			const haveRank = rankOf(declaredLevel);
			if (haveRank === null || req.barRank > haveRank) {
				return {
					verdict: "FLAG",
					quote: req.line,
					note: `Posting bar may exceed the declared level (${req.language}: ${declaredLevel}). Score and draft normally, but surface this gap so the candidate can judge it.`,
				};
			}
		}
	}
	return { verdict: "PASS", note: "Stated language requirements are within declared levels." };
}

export type LocationStatus = "PASS" | "FAIL" | "FLAG";

export interface DimensionScore {
	dimension: "technical" | "experience" | "behavioral" | "location" | "career";
	/** 0-100 for scored dimensions; null for location (pass/fail, unweighted). */
	score: number | null;
	status?: LocationStatus;
	notes: string;
}

export const WEIGHTS = {
	technical: 0.3,
	experience: 0.25,
	behavioral: 0.15,
	career: 0.3,
} as const;

function normalized(text: string): string {
	return text.toLowerCase();
}

/** Fraction of phrases present in the posting, full weight for primary, half for secondary. */
function coverage(posting: string, primary: string[], secondary: string[]): number | null {
	const text = normalized(posting);
	const primaryHits = primary.filter((p) => p !== "" && text.includes(normalized(p)));
	const secondaryHits = secondary.filter((s) => s !== "" && text.includes(normalized(s)));
	const denom = primary.length + 0.5 * secondary.length;
	if (denom === 0) {
		return null;
	}
	return Math.round((100 * (primaryHits.length + 0.5 * secondaryHits.length)) / denom);
}

/**
 * Five scoring dimensions (04-job-evaluation.md). Heuristic v0: deterministic
 * keyword coverage against the profile, so results are stable and testable.
 * Location is pass/fail and never weighted.
 */
export function scoreDimensions(postingText: string, profile: Profile): DimensionScore[] {
	const text = normalized(postingText);

	const technical = coverage(postingText, profile.primarySkills, profile.secondarySkills);
	const experience = coverage(postingText, profile.strongDomains, profile.adjacentDomains);

	let behavioral: number | null = null;
	if (profile.energizingTasks.length > 0 || profile.drainingTasks.length > 0) {
		const energizing = profile.energizingTasks.filter((t) => t !== "" && text.includes(normalized(t)));
		const draining = profile.drainingTasks.filter((t) => t !== "" && text.includes(normalized(t)));
		behavioral = Math.max(0, Math.min(100, 50 + 10 * energizing.length - 15 * draining.length));
	}

	const career =
		profile.careerGoals.length > 0
			? Math.round(
					(100 *
						profile.careerGoals.filter((g) => g !== "" && text.includes(normalized(g))).length) /
						profile.careerGoals.length,
				)
			: null;

	let location: LocationStatus = "PASS";
	let locationNotes = "Verify the commute against the candidate's constraints.";
	if (/relocat/i.test(postingText)) {
		location = "FAIL";
		locationNotes = "Posting requires relocation (deal-breaker).";
	} else if (/international travel|frequent travel|travel \d+%/i.test(postingText)) {
		location = "FLAG";
		locationNotes = "Posting involves significant travel; discuss with the candidate.";
	} else if (/remote|hybrid/i.test(postingText)) {
		locationNotes = "Remote/hybrid arrangement stated; confirm the exact onsite expectation.";
	}

	const setupNote = "Profile not set up yet; run /setup for a real score.";
	return [
		{
			dimension: "technical",
			score: technical ?? 50,
			notes:
				technical === null
					? setupNote
					: `${profile.primarySkills.filter((p) => text.includes(normalized(p))).length}/${profile.primarySkills.length} primary skills mentioned.`,
		},
		{
			dimension: "experience",
			score: experience ?? 50,
			notes:
				experience === null
					? setupNote
					: "Matched on the function and nature of the work, not literal job titles.",
		},
		{
			dimension: "behavioral",
			score: behavioral ?? 50,
			notes: behavioral === null ? setupNote : "Energizing tasks add, draining tasks subtract.",
		},
		{ dimension: "location", score: null, status: location, notes: locationNotes },
		{
			dimension: "career",
			score: career ?? 50,
			notes: career === null ? setupNote : "Coverage of stated career goals in the posting.",
		},
	];
}

/** Weighted average of the four scored dimensions; location is never weighted. */
export function overallScore(dims: DimensionScore[]): number {
	let total = 0;
	for (const dim of dims) {
		if (dim.score === null || dim.dimension === "location") {
			continue;
		}
		total += WEIGHTS[dim.dimension] * dim.score;
	}
	return Math.round(total);
}

export type Verdict = "Strong Fit" | "Good Fit" | "Moderate Fit" | "Weak Fit" | "Poor Fit";

export function verdictFor(score: number): Verdict {
	if (score >= 75) {
		return "Strong Fit";
	}
	if (score >= 60) {
		return "Good Fit";
	}
	if (score >= 45) {
		return "Moderate Fit";
	}
	if (score >= 30) {
		return "Weak Fit";
	}
	return "Poor Fit";
}

function profileVocabulary(profile: Profile): Set<string> {
	const words = new Set<string>();
	for (const phrase of [
		...profile.primarySkills,
		...profile.secondarySkills,
		...profile.strongDomains,
		...profile.adjacentDomains,
		...profile.careerGoals,
	]) {
		for (const word of normalized(phrase).split(/[^a-z0-9+#]+/)) {
			if (word.length >= 2) {
				words.add(word);
			}
		}
	}
	return words;
}

/** Profile skills and domains mentioned in the posting (max 5). */
export function extractStrengths(postingText: string, profile: Profile): string[] {
	const text = normalized(postingText);
	const strengths: string[] = [];
	for (const skill of [...profile.primarySkills, ...profile.strongDomains]) {
		if (skill !== "" && text.includes(normalized(skill))) {
			strengths.push(skill);
		}
		if (strengths.length >= 5) {
			break;
		}
	}
	return strengths;
}

const STOPWORDS = new Set([
	"with",
	"from",
	"that",
	"have",
	"will",
	"role",
	"work",
	"team",
	"experience",
	"years",
	"year",
	"requirements",
	"required",
	"essential",
	"desirable",
	"ability",
	"strong",
	"good",
	"plus",
	"including",
	"within",
	"their",
	"them",
	"such",
	"than",
	"then",
	"when",
	"also",
	"into",
]);

/** Distinctive requirement-line tokens absent from the profile (max 5, by frequency). */
export function extractGaps(postingText: string, profile: Profile): string[] {
	const vocab = profileVocabulary(profile);
	const counts = new Map<string, number>();
	for (const rawLine of postingText.split(/\r?\n/)) {
		if (!/requir|essential|desirable|nice.to.have|must have|plus\b/i.test(rawLine)) {
			continue;
		}
		for (const token of normalized(rawLine).split(/[^a-z0-9+#]+/)) {
			if (token.length >= 4 && !STOPWORDS.has(token) && !vocab.has(token)) {
				counts.set(token, (counts.get(token) ?? 0) + 1);
			}
		}
	}
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, 5)
		.map(([token]) => token);
}

export function recommendationFor(verdict: Verdict): string {
	switch (verdict) {
		case "Strong Fit":
			return "Definitely apply; tailor the CV and cover letter to this role.";
		case "Good Fit":
			return "Apply, and address the listed gaps explicitly in the cover letter.";
		case "Moderate Fit":
			return "Consider carefully and discuss with the candidate before applying.";
		case "Weak Fit":
			return "Probably skip unless there are strategic reasons to apply.";
		case "Poor Fit":
			return "Skip this role.";
	}
}

export interface EmployerCall {
	suggest: boolean;
	reason: string;
}

const CONTACT_PATTERNS = [
	/contact \w+/i,
	/questions\??.{0,60}(contact|call|reach out|get in touch)/i,
	/happy to (help|answer|discuss)/i,
	/please (call|contact)/i,
];

const VAGUE_PATTERNS = [
	/various tasks/i,
	/to be defined/i,
	/\bTBD\b/,
	/details (to follow|tbd)/i,
	/diverse tasks/i,
	/flexible role/i,
];

/** Only suggest calling when there are substantive questions — never just to be remembered. */
export function shouldCallEmployer(postingText: string): EmployerCall {
	if (CONTACT_PATTERNS.some((pattern) => pattern.test(postingText))) {
		return {
			suggest: true,
			reason: "A named contact invites questions about the role.",
		};
	}
	if (VAGUE_PATTERNS.some((pattern) => pattern.test(postingText))) {
		return {
			suggest: true,
			reason: "The posting is vague about day-to-day tasks; clarify before drafting.",
		};
	}
	const hasRequirements = /requir|essential/i.test(postingText);
	const hasSplit = /desirable|nice.to.have/i.test(postingText);
	if (hasRequirements && !hasSplit) {
		return {
			suggest: false,
			reason: "Posting lists requirements without an essential/desirable split, but is specific enough to draft from.",
		};
	}
	return { suggest: false, reason: "Posting is specific; no substantive questions identified." };
}

const DEADLINE_PATTERN =
	/(apply by|deadline|closing date|closes?( on| at)?|applications close)\s*:?\s*(\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?|[A-Z][a-z]+ \d{1,2}(,? \d{4})?|\d{1,2} [A-Z][a-z]+( \d{4})?)/i;

/** Extracts the stated application deadline, if any. */
export function extractDeadline(postingText: string): string | null {
	const match = DEADLINE_PATTERN.exec(postingText);
	if (!match) {
		return null;
	}
	return match[3].replace(/,$/, "").trim();
}

export interface Evaluation {
	scored: boolean;
	eligibility: GateResult<EligibilityVerdict>;
	languageGate: GateResult<LanguageVerdict>;
	dimensions: DimensionScore[];
	overallScore: number | null;
	verdict: Verdict | null;
	strengths: string[];
	gaps: string[];
	recommendation: string;
	shouldCallEmployer: EmployerCall;
	needsConfirmation: true;
	deadline: string | null;
	source: string;
	/** Full posting text retained for archiving. */
	archive: string;
}

/**
 * Full fit evaluation: gates first (a FAIL stops before scoring),
 * then weighted dimensions, verdict, strengths, gaps, and recommendation.
 */
export function evaluateJob(input: {
	postingText: string;
	profile: Profile;
	source?: string;
}): Evaluation {
	const source = input.source ?? "pasted-text";
	const eligibility = checkEligibility(input.postingText, input.profile);
	const languageGate = checkLanguage(input.postingText, input.profile);
	const base = {
		eligibility,
		languageGate,
		shouldCallEmployer: shouldCallEmployer(input.postingText),
		needsConfirmation: true as const,
		deadline: extractDeadline(input.postingText),
		source,
		archive: input.postingText,
	};

	if (eligibility.verdict === "FAIL" || languageGate.verdict === "FAIL") {
		const failed = eligibility.verdict === "FAIL" ? eligibility : languageGate;
		return {
			...base,
			scored: false,
			dimensions: [],
			overallScore: null,
			verdict: null,
			strengths: [],
			gaps: [],
			recommendation: `Do not apply: gate failed (${failed.quote ?? failed.note}).`,
		};
	}

	const dimensions = scoreDimensions(input.postingText, input.profile);
	const overall = overallScore(dimensions);
	const verdict = verdictFor(overall);
	return {
		...base,
		scored: true,
		dimensions,
		overallScore: overall,
		verdict,
		strengths: extractStrengths(input.postingText, input.profile),
		gaps: extractGaps(input.postingText, input.profile),
		recommendation: recommendationFor(verdict),
	};
}
