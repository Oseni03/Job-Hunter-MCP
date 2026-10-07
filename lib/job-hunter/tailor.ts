import { extractDeadline, phraseMatches, profileVocabulary } from "@/lib/job-hunter/evaluate.ts";
import {
	braceItem,
	checkWritingBans,
	escapeLatex,
	sectionHeadings,
	toAsciiDateRange,
} from "@/lib/job-hunter/latex.ts";
import type { SectionHeadings } from "@/lib/job-hunter/latex.ts";
import { EMPTY_SLUG_ERROR, makeJobSlug } from "@/lib/job-key.ts";
import type { Profile } from "@/lib/job-hunter/profile.ts";
import {
	adjacentDomainNames,
	matchingPool,
	primarySkillNames,
	secondarySkillNames,
	strongDomainNames,
} from "@/lib/job-hunter/profile.ts";

/**
 * Slice A: requirement coverage, logistics extraction, and factual
 * auditing for the two document tools. Pure functions over the posting
 * text and the profile; LaTeX builders arrive in slices B and C.
 */

export interface RequirementMatch {
	requirement: string;
	kind: "essential" | "nice-to-have";
	status: "matched" | "bridged" | "gap";
	/** The profile phrase that matches, when status is matched. */
	evidence?: string;
}

const NICE_PATTERN = /nice.to.have|desirable|\bbonus\b|preferred|a plus|advantage/i;
const REQUIREMENT_LINE =
	/requir|essential|must have|must be|should have|need (to|you)|looking for|you (have|bring|will)|domain|experience (with|in|of)|familiar|proficient|skilled|background in/i;

/** Shared content-word stopwords (issue 12 family): also screens STAR Use-for tags in prep. */
export const CONTENT_STOPWORDS = new Set([
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
	"and",
	"the",
	"for",
	"are",
	"you",
	"your",
	"our",
]);

const STOPWORDS = CONTENT_STOPWORDS;

function profilePhrases(profile: Profile): string[] {
	return [
		...matchingPool(profile),
		...profile.languages.map((entry) => entry.language),
	].filter((phrase) => phrase.trim().length >= 2);
}

/** Profile vocabulary plus declared languages, for requirement matching. */
function tailorVocabulary(profile: Profile): Set<string> {
	const vocab = profileVocabulary(profile);
	for (const entry of profile.languages) {
		for (const word of entry.language.toLowerCase().split(/[^a-z0-9+#]+/)) {
			if (word.length >= 2) {
				vocab.add(word);
			}
		}
	}
	return vocab;
}

function contentWords(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[^a-z0-9+#]+/)
		.filter((word) => word.length >= 4 && !STOPWORDS.has(word));
}

/**
 * Shared word-overlap machinery (issue 12 family): counts content words
 * shared between two texts, with the same singular tolerance as the
 * audit. Both bridge pickers (letter gap anchors, prep fit-gap
 * evidence) score candidates through here.
 */
export function wordOverlap(a: string, b: string): number {
	const aWords = new Set(contentWords(a));
	let score = 0;
	for (const word of contentWords(b)) {
		if (
			aWords.has(word) ||
			(word.endsWith("s") && aWords.has(word.slice(0, -1))) ||
			(aWords.has(`${word}s`) && word.length >= 4)
		) {
			score += 1;
		}
	}
	return score;
}

/** Picks the candidate sharing the most content words with the gap; null names no anchor rather than an unrelated one. */
export function pickBridgeAnchor(gapText: string, candidates: string[]): string | null {
	let best: string | null = null;
	let bestScore = 0;
	for (const candidate of candidates.map((entry) => entry.trim()).filter(Boolean)) {
		const score = wordOverlap(gapText, candidate);
		if (score > bestScore) {
			bestScore = score;
			best = candidate;
		}
	}
	return best;
}

/** Splits a requirement line into items: strips labels and list markers, then splits lists. */
function splitItems(line: string): string[] {
	const unlabeled = line
		.replace(/^[^:]{0,40}:\s*/, "")
		.replace(/^(?:[-*•]|\d+[.)])\s+/, "")
		.trim();
	const parts = unlabeled.includes(",") || unlabeled.includes(";")
		? unlabeled.split(/[,;]/)
		: [unlabeled];
	return parts
		.map((part) => part.trim().replace(/[.]+$/, ""))
		.filter((part) => part.length >= 2);
}

/**
 * Every stated requirement, matched against the profile or honestly
 * marked: matched (a profile phrase names it), bridged (word overlap
 * only), or gap (no overlap at all). Nice-to-haves keep their kind so
 * the letter can engage them by name.
 */
export function matchRequirements(postingText: string, profile: Profile): RequirementMatch[] {
	const phrases = profilePhrases(profile);
	const vocab = tailorVocabulary(profile);
	const coverage: RequirementMatch[] = [];
	const emitted = new Set<string>();
	for (const rawLine of postingText.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || (!NICE_PATTERN.test(line) && !REQUIREMENT_LINE.test(line))) {
			continue;
		}
		const kind = NICE_PATTERN.test(line) ? "nice-to-have" : "essential";
		for (const item of splitItems(line)) {
			const match = matchItem(item, kind, phrases, vocab);
			if (match && !emitted.has(match.requirement)) {
				emitted.add(match.requirement);
				coverage.push(match);
			}
		}
	}
	// Second pass: bare list lines carry requirements without a label.
	// Only list-marked lines qualify, so headers and prose stay out.
	for (const rawLine of postingText.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || NICE_PATTERN.test(line) || REQUIREMENT_LINE.test(line)) {
			continue;
		}
		if (!/^[-*•\d.)\s]/.test(line)) {
			continue;
		}
		if (!phrases.some((phrase) => phraseMatches(line, phrase))) {
			continue;
		}
		for (const item of splitItems(line)) {
			const match = matchItem(item, "essential", phrases, vocab);
			if (match && !emitted.has(match.requirement)) {
				emitted.add(match.requirement);
				coverage.push(match);
			}
		}
	}
	return coverage;
}

function matchItem(
	item: string,
	kind: "essential" | "nice-to-have",
	phrases: string[],
	vocab: Set<string>,
): RequirementMatch | null {
	if (item.length < 2) {
		return null;
	}
	// Matched only when item and phrase mutually mention each other as whole
	// words (modulo aliases): the item IS the profile phrase, not merely a
	// longer string containing it. One-direction containment ("machine
	// learning operations" naming "Machine Learning") bridges honestly
	// instead of over-claiming a direct match.
	const evidence = phrases.find((phrase) => phraseMatches(item, phrase) && phraseMatches(phrase, item));
	if (evidence) {
		return { requirement: item, kind, status: "matched", evidence };
	}
	// The item names a profile phrase plus extra specialization, or
	// shares vocabulary with it: bridge honestly, never over-claim.
	const overlaps =
		phrases.some((phrase) => phraseMatches(item, phrase)) ||
		contentWords(item).some((word) => vocab.has(word));
	return { requirement: item, kind, status: overlaps ? "bridged" : "gap" };
}

export interface Logistics {
	workMode: string | null;
	deadline: string | null;
	referenceId: string | null;
}

const REFERENCE_PATTERN =
	/(?:ref(?:erence)?(?:\s*(?:id|no\.?|number))?|requisition|job\s?id)\s*[:#]\s*([A-Za-z0-9][A-Za-z0-9-]*)/i;

/** Work mode, deadline, and reference id the cover letter must address. */
export function extractLogistics(postingText: string): Logistics {
	const workMode = extractWorkMode(postingText);
	const referenceMatch = REFERENCE_PATTERN.exec(postingText);
	return {
		workMode,
		deadline: extractDeadline(postingText),
		referenceId: referenceMatch ? referenceMatch[1] : null,
	};
}

/**
 * Work-mode with onsite-evidence priority (issue 19). A bare culture
 * mention ("remote-first culture") is not an arrangement: explicit
 * onsite commitment ("onsite twice a week") wins over it, hybrid keeps
 * its own signal, and lone culture praise without an arrangement
 * reports null instead of a false Remote.
 */
export function extractWorkMode(postingText: string): string | null {
	const onsiteCommitment =
		/(onsite|on-site|on site|in[ -]office|office-based)[^.]*?(twice|days|a week|per week|required|expected|must)|days in (the )?office/i.test(
			postingText,
		);
	if (onsiteCommitment) {
		return "Onsite";
	}
	if (/hybrid/i.test(postingText)) {
		return "Hybrid";
	}
	const withoutCulture = postingText.replace(
		/remote-first culture|remote culture|remote[ -]friendly|remote friendly/gi,
		"",
	);
	if (/\bremote\b/i.test(withoutCulture)) {
		return "Remote";
	}
	if (/(onsite|on-site|on site|in[ -]office|office-based)/i.test(postingText)) {
		return "Onsite";
	}
	return null;
}

export interface ClaimAudit {
	grounded: boolean;
	missing: string[];
}

/** Every numeral (years, counts, percentages, dates) in generated prose. Trailing punctuation stays out. */
export function extractNumerals(text: string): string[] {
	return text.match(/\d[\d,]*(?:[.\/-]\d+)*/g) ?? [];
}

/**
 * Audits one draft claim against the union of fact sources (candidate
 * profile, master CV, workspace profile). Grounded when every content
 * word appears in the union AND every numeral appears in the union;
 * otherwise reports the missing words so the drafter can rephrase or
 * drop the claim. Zero drift allowed. Short numbers skip the word audit
 * by length, so the numeral check closes that hole explicitly.
 */
export function auditClaim(claim: string, sources: string[]): ClaimAudit {
	const tokens = new Set(sources.join("\n").toLowerCase().split(/[^a-z0-9+#]+/).filter(Boolean));
	const missing = contentWords(claim).filter(
		(word) => !tokens.has(word) && !(word.endsWith("s") && tokens.has(word.slice(0, -1))),
	);
	const unionText = sources.join("\n").toLowerCase();
	for (const numeral of extractNumerals(claim)) {
		if (!unionText.includes(numeral.toLowerCase()) && !missing.includes(numeral)) {
			missing.push(numeral);
		}
	}
	return { grounded: missing.length === 0, missing };
}

/**
 * Optional gate summary passed by the host (stateless: the server holds
 * nothing; the host passes analyze-job output back in). Refuses on FAIL,
 * warns loudly when absent so drafting blind is a visible choice.
 */
export interface EvaluationSummary {
	verdict?: string | null;
	eligibility?: { verdict: string };
	languageGate?: { verdict: string };
}

export const GATE_REFUSED_PREFIX = "GATE_REFUSED";
export const GATE_MISSING_NOTE =
	"No evaluation summary supplied; drafting blind without the eligibility/language gates is a visible choice — run analyze-job first and pass its verdict plus gate results.";

export function checkGateSummary(evaluation?: EvaluationSummary): { refused?: string; note?: string } {
	if (!evaluation) {
		return { note: GATE_MISSING_NOTE };
	}
	const failed =
		evaluation.eligibility?.verdict === "FAIL" || evaluation.languageGate?.verdict === "FAIL";
	if (failed) {
		const which =
			evaluation.eligibility?.verdict === "FAIL" ? "eligibility" : "language";
		return {
			refused: `${GATE_REFUSED_PREFIX}: the ${which} gate failed — drafting refused. Confirm the posting passes analyze-job before drafting.`,
		};
	}
	return {};
}

/** English-only machinery notice for non-English postings. */
export function englishOnlyNote(postingLanguage: string): string {
	return (
		`Posting language '${postingLanguage}': the audit, stopwords, and bridging templates are English-only — ` +
		"review non-English text manually instead of trusting English machinery on it."
	);
}

/**
 * Inter-source consistency: flags when the profile name is absent from
 * another fact source, so contradictions get resolved before drafting.
 * Kept distinct from draft drift (auditClaim); placeholder names skip.
 */
export function checkSourceConsistency(
	profile: Profile,
	masterCvText?: string,
	workspaceProfileText?: string,
): string[] {
	const warnings: string[] = [];
	const name = profile.name.trim();
	if (!name || name.includes("YOUR")) {
		return warnings;
	}
	const sources: Array<[string, string | undefined]> = [
		["master CV", masterCvText],
		["workspace profile", workspaceProfileText],
	];
	for (const [label, text] of sources) {
		if (text && !text.toLowerCase().includes(name.toLowerCase())) {
			warnings.push(
				`Profile name '${name}' not found in ${label}; confirm which source is current before drafting.`,
			);
		}
	}
	return warnings;
}

/* ------------------------------------------------------------------ */
/* Slice B: tailored CV builder                                        */
/* ------------------------------------------------------------------ */

/** Active custom template override (from /add-template); wins over stock guidance when present. */
export interface TemplateOverride {
	name?: string;
	sourceExtension?: string;
	compileCommand?: string;
	pageLimit?: number;
	styleRules?: string;
	engine?: string;
}

export interface ExperienceEntry {
	title: string;
	company: string;
	period: string;
	bullets: string[];
}

export interface EducationEntry {
	degree: string;
	period: string;
	institution: string;
	inProgress?: boolean;
	expectedDate?: string;
}

export interface ContactDetails {
	email?: string;
	phone?: string;
	linkedin?: string;
	github?: string;
}

export type RoleType = "technical" | "specialist";

export interface StretchChoice {
	bullet: string;
	reason: string;
	options: ["keep", "soften", "drop"];
}

export interface DraftWarnings {
	/** Inter-source contradictions (profile vs master CV vs workspace). Distinct from draft drift. */
	profileConsistency: string[];
	/** Generated claims with words missing from every fact source. Must stay empty. */
	draftDrift: string[];
	/** Adjacent-but-not-same framings for the keep/soften/drop decision. */
	stretchChoices: StretchChoice[];
	reframingWarning?: string;
	templateNote?: string;
	contactNote?: string;
	/** Role-sniffing caution: technical keywords only in negated context, order defaulted. */
	roleTypeNote?: string;
	/** Loud warning when no evaluation summary was supplied (drafting blind). */
	evaluationNote?: string;
	/** Posting-language vs CV-language mismatch and English-only limits. */
	languageNote?: string;
}

export interface DroppedBullet {
	role: string;
	bullet: string;
}

export interface TailorCvInput {
	postingText: string;
	company?: string;
	role?: string;
	postingUrl?: string;
	profile: Profile;
	experience?: ExperienceEntry[];
	education?: EducationEntry[];
	masterCvText?: string;
	workspaceProfileText?: string;
	contact?: ContactDetails;
	cvLanguage?: string;
	/** Posting language for the language-fit warning (body stays profile-language). */
	postingLanguage?: string;
	/** Optional analyze-job summary; refused on FAIL, warned when missing. */
	evaluation?: EvaluationSummary;
	roleType?: RoleType;
	template?: TemplateOverride;
}

export type TailorCvResult =
	| {
			ok: true;
			slug: string;
			filePath: string;
			tex: string;
			compileCommand: string;
			pageLimit: number;
			archiveDir: string;
			coverage: RequirementMatch[];
			/** Bullets cut by the relevance caps, with their role, so the host can show what was left out. */
			droppedBullets: DroppedBullet[];
			warnings: DraftWarnings;
			banViolations: string[];
	  }
	| { ok: false; error: string };

/**
 * Neutral framing words the builders may use in generated prose. These
 * are meta-commentary ("direct match", "brings"), never factual claims
 * about the candidate, so the drift audit accepts them. The posting
 * itself is never a fact source: grounding CV claims in it would bless
 * fabrication, so it stays out of the union — with three narrow,
 * documented exceptions where naming is not claiming: the caller-given
 * company/role/logistics targeting context, requirement names (the
 * letter must engage gaps by name to bridge them honestly), and
 * caller-verified company specifics. Credential nouns (skills, results,
 * titles) must still come from profile-side sources.
 */
export const BUILDER_LEXICON = [
	"moving",
	"brings",
	"bring",
	"direct",
	"directly",
	"match",
	"matches",
	"matched",
	"posting",
	"stated",
	"requirement",
	"requirements",
	"nice",
	"adjacent",
	"core",
	"strength",
	"strengths",
	"ready",
	"field",
	"fields",
	"roles",
	"apply",
	"applying",
	"maps",
	"fits",
	"direction",
	"draws",
	"want",
	"contribute",
	"effort",
	"recent",
	"example",
	"another",
	"plan",
	"close",
	"first",
	"month",
	"based",
	"note",
	"arrangement",
	"reference",
	"deadline",
	"delivery",
	"best",
	"clear",
	"ownership",
	"steady",
	"feedback",
	"focus",
	"energizes",
	"energy",
	"pursuing",
	"tasks",
	"key",
	"exactly",
	"where",
	"look",
	"forward",
	"hearing",
	"which",
	"here",
	"company",
	"related",
	"continues",
	"center",
	"this",
	"would",
	"approach",
	"what",
	"framed",
	"toward",
];

/** Shared file contract for both document tools: slug dir, stock compile, override wins. */
export function resolveTemplateFile(
	slug: string,
	dir: "cv" | "cover_letters",
	stemPrefix: "main" | "cover",
	template: TemplateOverride | undefined,
	stockCompile: string,
	stockPageLimit: number,
): { filePath: string; compileCommand: string; pageLimit: number } {
	const extension = template?.sourceExtension ?? ".tex";
	const stem = `${stemPrefix}_${slug}`;
	return {
		filePath: `${dir}/${stem}${extension}`,
		compileCommand: template?.compileCommand?.replace("<file>", stem) ?? stockCompile,
		pageLimit: template?.pageLimit ?? stockPageLimit,
	};
}

/** Surfaces an active custom template override (name, engine, style rules) in warnings. */
export function templateWarning(template: TemplateOverride | undefined): string | undefined {
	if (!template) {
		return undefined;
	}
	const extras = [
		template.engine ? `engine ${template.engine}` : null,
		template.styleRules ? `style rules: ${template.styleRules}` : null,
	].filter(Boolean);
	const shellNote = template.compileCommand
		? " Custom compile commands are caller-owned: verify they pass --no-shell-escape before compiling untrusted content."
		: "";
	return (
		`Active template '${template.name ?? "custom"}' overrides stock guidance` +
		`${extras.length > 0 ? ` (${extras.join("; ")})` : ""}: ` +
		`port this content into its skeleton and compile with the template command before submitting.${shellNote}`
	);
}

/** Warns when no contact details were provided for the document header. */
export function contactWarning(contact: ContactDetails | undefined): string | undefined {
	if (contact?.email || contact?.phone) {
		return undefined;
	}
	return "No contact details provided; add email and phone before submitting.";
}

/** The archive directory both tools share with track-application (ticket 03 owns the write). */
export function archiveDirFor(slug: string): string {
	return `documents/applications/${slug}`;
}

/**
 * The ResumeVersion/Application job key: the same slug every document
 * tool shares for CV, letter, and archive path. Empty when nothing
 * identifies the posting; callers treat that as a hard error and emit
 * no TeX (see EMPTY_SLUG_ERROR).
 */
export function versionKeyFor(company?: string, role?: string, postingUrl = ""): string {
	return makeJobSlug(company, role, postingUrl);
}

/** Technical roles lead with experience; specialist roles lead with education. */
const TECHNICAL_ROLE_KEYWORDS =
	/python|\bjava\b|typescript|framework|machine learning|\bmodels?\b|pipeline|dataset|code\b|software|algorithm/i;
/** Negated context: a keyword hit here must not force the technical order (issue 16). */
const ROLE_NEGATION_CONTEXT = /\b(no|not|n't|never|without|don't|doesn't|didn't|isn't|aren't|non-)\b/i;

export function detectRoleType(postingText: string, override?: RoleType): RoleType {
	if (override) {
		return override;
	}
	return postingText
		.split(/\r?\n/)
		.some((line) => !ROLE_NEGATION_CONTEXT.test(line) && TECHNICAL_ROLE_KEYWORDS.test(line))
		? "technical"
		: "specialist";
}

/**
 * FLAG-equivalent caution for role sniffing (issue 16). Keyword-regex
 * ordering is a weak signal: when technical keywords appear only in
 * negated context ("no coding required", "not a software role"), the
 * section order defaults to specialist and this note says why, so a human
 * can override with `roleType`. Null when the signal is unambiguous or
 * the caller already overrode it.
 */
export function roleTypeCaution(postingText: string, override?: RoleType): string | null {
	if (override) {
		return null;
	}
	if (!TECHNICAL_ROLE_KEYWORDS.test(postingText)) {
		return null;
	}
	const affirmed = postingText
		.split(/\r?\n/)
		.some((line) => !ROLE_NEGATION_CONTEXT.test(line) && TECHNICAL_ROLE_KEYWORDS.test(line));
	if (affirmed) {
		return null;
	}
	return "Role-type keywords appear only in negated context; section order defaults to specialist — override with roleType if the role is technical.";
}

/** The posting's own surface form of a matched skill (original casing), for bold labels. */
function postingSurfaceForm(phrase: string, postingText: string): string {
	const escaped = phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
	if (escaped === "") {
		return phrase;
	}
	const match = new RegExp(`(?<![a-z0-9+#])${escaped}(?![a-z0-9+#])`, "i").exec(postingText);
	return match ? match[0] : phrase;
}

const ROLE_BULLET_CAPS = [5, 3, 2];

/** Relevance-orders bullets (posting-term hits, then measurable outcomes), stable, then caps. Dropped bullets are returned so the host can show the cuts. */
function tailorBullets(
	bullets: string[],
	phrases: string[],
	cap: number,
): { kept: string[]; dropped: string[] } {
	const scored = bullets.map((bullet, index) => {
		const hits = phrases.filter((phrase) => phraseMatches(bullet, phrase)).length;
		return { bullet, index, score: 2 * hits + (/\d/.test(bullet) ? 1 : 0) };
	});
	scored.sort((a, b) => b.score - a.score || a.index - b.index);
	return {
		kept: scored.slice(0, cap).map((entry) => entry.bullet),
		dropped: scored.slice(cap).map((entry) => entry.bullet),
	};
}

interface Competency {
	label: string;
	body: string;
	evidence: string;
}

/**
 * Builds the tailored CV as LaTeX source. Returns the EMPTY_SLUG hard
 * error with no TeX when neither company, role, nor URL identifies the
 * posting. Heuristic v0: deterministic tailoring over the profile, so
 * results are stable and testable; the host owns file writes and the
 * lualatex compile-and-inspect loop.
 */
export function buildTailoredCv(input: TailorCvInput): TailorCvResult {
	const slug = makeJobSlug(input.company, input.role, input.postingUrl);
	if (!slug) {
		return { ok: false, error: EMPTY_SLUG_ERROR };
	}
	const gate = checkGateSummary(input.evaluation);
	if (gate.refused) {
		return { ok: false, error: gate.refused };
	}
	const profile = input.profile;
	const coverage = matchRequirements(input.postingText, profile);

	const coreSkills = [...primarySkillNames(profile), ...strongDomainNames(profile)];
	const peripheralSkills = [...secondarySkillNames(profile), ...adjacentDomainNames(profile)];
	const coreHit = coreSkills.some((skill) => skill.trim() !== "" && phraseMatches(input.postingText, skill));
	const adjacentHit = adjacentDomainNames(input.profile).some(
		(domain) => domain.trim() !== "" && phraseMatches(input.postingText, domain),
	);
	const transferring = !coreHit && adjacentHit;

	const matched = coverage.filter((item) => item.status === "matched");
	const matchedSkills = matched
		.map((item) => item.evidence as string)
		.filter((evidence, index, all) => evidence && all.indexOf(evidence) === index)
		.slice(0, 7);
	// Pad short lists to 5 from profile skills (primaries, then secondary,
	// then adjacent); never invent. Gaps stay out.
	const padPool = [
		...primarySkillNames(profile),
		...secondarySkillNames(profile),
		...adjacentDomainNames(profile),
	].filter((skill) => !matchedSkills.includes(skill));
	const padded =
		matchedSkills.length < 5 ? [...matchedSkills, ...padPool].slice(0, 7) : matchedSkills;
	const corePhrases = [...primarySkillNames(profile), ...strongDomainNames(profile)];

	const competencies: Competency[] = padded.map((skill) => {
		const item = matched.find((entry) => entry.evidence === skill);
		return {
			label: postingSurfaceForm(skill, input.postingText),
			body:
				item?.kind === "nice-to-have"
					? "Direct match to a stated nice-to-have requirement."
					: item
						? "Direct match to a stated requirement."
						: corePhrases.includes(skill)
							? "Core strength for this role."
							: "Adjacent strength, framed toward this role.",
			evidence: skill,
		};
	});

	const topSkills = matchedSkills.filter((skill) => primarySkillNames(profile).includes(skill)).slice(0, 3);
	const statementSkills =
		topSkills.length > 0 ? topSkills : primarySkillNames(profile).slice(0, 3);
	const skillList =
		statementSkills.length > 1
			? `${statementSkills.slice(0, -1).join(", ")} and ${statementSkills[statementSkills.length - 1]}`
			: (statementSkills[0] ?? "relevant skills");
	const strongDomain = matched
		.map((item) => item.evidence as string)
		.find((evidence) => strongDomainNames(profile).includes(evidence));
	const goal = profile.preferences?.targetRoles?.[0];
	const transferDomain = adjacentDomainNames(input.profile).find(
		(domain) => domain.trim() !== "" && phraseMatches(input.postingText, domain),
	);
	const statement = transferring && transferDomain
		? `Moving from ${transferDomain} to ${input.role ?? "this role"}, ${profile.name} brings ${skillList} to ${goal ? `${goal} work` : "work"}.`
		: strongDomain && goal
			? `${profile.name} brings ${skillList} to ${goal} work in ${strongDomain}.`
			: goal
				? `${profile.name} brings ${skillList} to ${goal} work.`
				: `${profile.name} brings ${skillList}.`;

	const phrases = profilePhrases(profile);
	const droppedBullets: DroppedBullet[] = [];
	const tailoredExperience = (input.experience ?? []).map((entry, roleIndex) => {
		const shaped = tailorBullets(
			entry.bullets,
			phrases,
			ROLE_BULLET_CAPS[Math.min(roleIndex, ROLE_BULLET_CAPS.length - 1)],
		);
		const roleLabel = `${entry.title} at ${entry.company}`;
		for (const bullet of shaped.dropped) {
			droppedBullets.push({ role: roleLabel, bullet });
		}
		return { ...entry, bullets: shaped.kept };
	});

	const union = [
		JSON.stringify(profile),
		JSON.stringify(input.experience ?? []),
		JSON.stringify(input.education ?? []),
		input.masterCvText ?? "",
		input.workspaceProfileText ?? "",
		input.company ?? "",
		input.role ?? "",
		BUILDER_LEXICON.join(" "),
	];
	const draftDrift: string[] = [];
	for (const prose of [statement, ...competencies.map((c) => c.body)]) {
		const audit = auditClaim(prose, union);
		if (!audit.grounded) {
			draftDrift.push(`${prose} (missing: ${audit.missing.join(", ")})`);
		}
	}

	const stretchChoices: StretchChoice[] = competencies
		.filter((competency) => peripheralSkills.includes(competency.evidence))
		.map((competency) => ({
			bullet: competency.label,
			reason: `${competency.label} comes from secondary skills, so it reads as adjacent rather than core. Keep, soften, or drop?`,
			options: ["keep", "soften", "drop"] as ["keep", "soften", "drop"],
		}));

	const matchedCount = matched.length;
	const bridgedCount = coverage.filter((item) => item.status === "bridged").length;
	const warnings: DraftWarnings = {
		profileConsistency: checkSourceConsistency(profile, input.masterCvText, input.workspaceProfileText),
		draftDrift,
		stretchChoices,
	};
	if (gate.note) {
		warnings.evaluationNote = gate.note;
	}
	if (matchedCount === 0 && bridgedCount === 0 && coverage.length > 0) {
		warnings.reframingWarning =
			"Posting matches no primary skill or strong domain; extensive reframing would be needed. Confirm before submitting.";
	}
	const contactNote = contactWarning({
		email: input.contact?.email || profile.email || undefined,
		phone: input.contact?.phone || profile.phone || undefined,
	});
	if (contactNote) {
		warnings.contactNote = contactNote;
	}

	const language = input.cvLanguage ?? "en";
	const headings = sectionHeadings(language);
	if (input.postingLanguage && input.postingLanguage.toLowerCase() !== language.toLowerCase()) {
		warnings.languageNote =
			`Posting language '${input.postingLanguage}' differs from CV language '${language}'; ` +
			"the body stays profile-language under translated headings — confirm this mismatch before submitting. " +
			englishOnlyNote(input.postingLanguage);
	} else if (input.postingLanguage && input.postingLanguage.toLowerCase() !== "en") {
		warnings.languageNote = englishOnlyNote(input.postingLanguage);
	}
	const roleType = detectRoleType(input.postingText, input.roleType);
	const roleTypeNote = roleTypeCaution(input.postingText, input.roleType);
	if (roleTypeNote) {
		warnings.roleTypeNote = roleTypeNote;
	}
	const [firstName, ...lastName] = profile.name.split(/\s+/);
	const contact = {
		email: input.contact?.email || profile.email || undefined,
		phone: input.contact?.phone || profile.phone || undefined,
		linkedin: input.contact?.linkedin || profile.linkedin || undefined,
		github: input.contact?.github || profile.github || undefined,
	};
	const contactLines = [
		`\\address{${escapeLatex(profile.location)}}{}{}`,
		contact.phone ? `\\phone[mobile]{${escapeLatex(contact.phone)}}` : null,
		contact.email ? `\\email{${escapeLatex(contact.email)}}` : null,
		contact.linkedin || contact.github
			? `\\extrainfo{${[contact.linkedin ? `\\href{${contact.linkedin}}{LinkedIn}` : null, contact.github ? `\\href{${contact.github}}{GitHub}` : null].filter(Boolean).join(", ")}}`
			: null,
	].filter(Boolean) as string[];

	const competencyItems = competencies
		.map((competency) => `    \\item \\textbf{${escapeLatex(competency.label)}}: ${escapeLatex(competency.body)}`)
		.join("\n");
	const experienceBlocks = tailoredExperience
		.map(
			(entry) =>
				`\\cventry{${toAsciiDateRange(escapeLatex(entry.period))}}{${escapeLatex(entry.title)}}{${escapeLatex(entry.company)}}{}{}{\\begin{itemize}\n${entry.bullets.map((bullet) => `    \\item ${braceItem(escapeLatex(bullet))}`).join("\n")}\n\\end{itemize}}`,
		)
		.join("\n\\vspace{3pt}\n");
	const educationBlocks = (input.education ?? [])
		.map(
			(entry) =>
				`\\cventry{${toAsciiDateRange(escapeLatex(entry.period))}}{${escapeLatex(entry.degree)}}{${escapeLatex(entry.institution)}}{}{}{${entry.inProgress ? `In progress, expected ${escapeLatex(entry.expectedDate ?? "date to agree")}.` : ""}}`,
		)
		.join("\n\\vspace{3pt}\n");
	const languageItems = profile.languages
		.map((entry) => `\\cvitem{${escapeLatex(entry.language)}}{${escapeLatex(entry.level)}}`)
		.join("\n");

	const experienceSection = `\\section{${headings.experience}}\n\\vspace{1pt}\n${experienceBlocks || "% No experience entries provided."}`;
	const educationSection = `\\section{${headings.education}}\n\\vspace{1pt}\n${educationBlocks || "% No education entries provided."}`;
	const orderedSections =
		roleType === "technical"
			? `${experienceSection}\n\n${educationSection}`
			: `${educationSection}\n\n${experienceSection}`;

	const tex = [
		"\\documentclass[11pt,a4paper,sans]{moderncv}",
		"\\moderncvstyle{banking}",
		"\\moderncvcolor{blue}",
		"",
		"\\renewcommand*{\\namefont}{\\fontsize{34}{36}\\bfseries\\upshape}",
		"\\colorlet{firstnamecolor}{color1}",
		"\\colorlet{lastnamecolor}{color1}",
		"\\colorlet{namecolor}{color1}",
		"\\renewcommand*{\\sectionstyle}[1]{{\\sectionfont\\color{color1}#1}}",
		"",
		"\\usepackage[utf8]{inputenc}",
		"\\ifpdftex\\usepackage[T1]{fontenc}\\fi",
		"\\usepackage[scale=0.77]{geometry}",
		"\\usepackage{import}",
		"",
		"% Personal data",
		`\\name{${escapeLatex(firstName ?? profile.name)}}{${escapeLatex(lastName.join(" "))}}`,
		...contactLines,
		"",
		"\\begin{document}",
		"\\makecvtitle",
		"",
		escapeLatex(statement),
		"",
		`\\section{${headings.competencies}}`,
		"\\vspace{1pt}",
		"\\begin{itemize}",
		competencyItems,
		"\\end{itemize}",
		"",
		orderedSections,
		"",
		`\\section{${headings.languages}}`,
		"\\vspace{1pt}",
		languageItems || "% No languages declared.",
		"",
		`\\section{${headings.references}}`,
		escapeLatex(headings.referencesNote),
		"",
		"\\end{document}",
	].join("\n");

	const banViolations = checkWritingBans([statement, ...competencies.map((c) => c.body)].join(" "));

	const files = resolveTemplateFile(
		slug,
		"cv",
		"main",
		input.template,
		`cd cv && lualatex --no-shell-escape -interaction=nonstopmode main_${slug}.tex`,
		2,
	);
	const templateNote = templateWarning(input.template);
	if (templateNote) {
		warnings.templateNote = templateNote;
	}

	return {
		ok: true,
		slug,
		filePath: files.filePath,
		tex,
		compileCommand: files.compileCommand,
		pageLimit: files.pageLimit,
		archiveDir: archiveDirFor(slug),
		coverage,
		droppedBullets,
		warnings,
		banViolations,
	};
}

/* ------------------------------------------------------------------ */
/* Slice C: cover letter builder                                       */
/* ------------------------------------------------------------------ */

export interface CoverInput {
	postingText: string;
	company?: string;
	role?: string;
	postingUrl?: string;
	profile: Profile;
	hiringManager?: string;
	team?: string;
	postingLanguage?: string;
	/** Verified company facts with fetched source URLs; URL-less entries are refused. */
	companySpecifics?: Array<string | VerifiedSpecific>;
	/** Caller-provided achievements; rendered as brief past examples. */
	highlights?: string[];
	experience?: ExperienceEntry[];
	masterCvText?: string;
	workspaceProfileText?: string;
	contact?: ContactDetails;
	/** Optional analyze-job summary; refused on FAIL, warned when missing. */
	evaluation?: EvaluationSummary;
	template?: TemplateOverride;
}

/** A caller-verified company fact with its fetched source URL. */
export interface VerifiedSpecific {
	text: string;
	sourceUrl: string;
}

function isVerifiedSpecific(entry: unknown): entry is VerifiedSpecific {
	if (typeof entry !== "object" || entry === null) {
		return false;
	}
	const candidate = entry as { text?: unknown; sourceUrl?: unknown };
	return (
		typeof candidate.text === "string" &&
		candidate.text.trim().length > 0 &&
		typeof candidate.sourceUrl === "string" &&
		/^https?:\/\//i.test(candidate.sourceUrl.trim())
	);
}

/**
 * Provenance for companySpecifics (issue 19): research-company claims
 * already carry { text, sourceUrl } and plug in directly. Plain strings
 * and URL-less entries are refused (dropped with a count) — "verified
 * only" by construction, never by documentation alone.
 */
export function normalizeCompanySpecifics(
	entries: Array<string | VerifiedSpecific> | undefined,
): { kept: VerifiedSpecific[]; dropped: number } {
	const kept: VerifiedSpecific[] = [];
	let dropped = 0;
	for (const entry of (entries ?? []).slice(0, 10)) {
		if (isVerifiedSpecific(entry)) {
			kept.push({
				text: (entry as VerifiedSpecific).text.trim().replace(/[.]+$/, ""),
				sourceUrl: (entry as VerifiedSpecific).sourceUrl.trim(),
			});
			if (kept.length >= 3) {
				break;
			}
		} else {
			dropped += 1;
		}
	}
	return { kept, dropped };
}

export interface CoverWarnings {
	profileConsistency: string[];
	draftDrift: string[];
	/** Gap bridges for the keep/soften/drop decision, mirroring the CV. */
	stretchChoices: StretchChoice[];
	wordCountNote?: string;
	templateNote?: string;
	contactNote?: string;
	/** Loud warning when no evaluation summary was supplied (drafting blind). */
	evaluationNote?: string;
	/** Non-English posting notice: audit/stopwords/bridging are English-only. */
	languageNote?: string;
	/** URL-less company specifics refused for lack of provenance. */
	provenanceNote?: string;
}

export type CoverResult =
	| {
			ok: true;
			slug: string;
			filePath: string;
			tex: string;
			compileCommand: string;
			pageLimit: number;
			archiveDir: string;
			wordCount: number;
			coverage: RequirementMatch[];
			logistics: Logistics;
			warnings: CoverWarnings;
			banViolations: string[];
	  }
	| { ok: false; error: string };

const CLOSINGS: Record<string, string> = {
	en: "Kind regards,",
	es: "Atentamente,",
	de: "Mit freundlichen Grüßen,",
	fr: "Cordialement,",
	da: "Med venlig hilsen,",
};

function countWords(parts: string[]): number {
	return parts
		.join(" ")
		.split(/\s+/)
		.filter((word) => word.length > 0).length;
}

function joinAnd(parts: string[]): string {
	if (parts.length <= 1) {
		return parts.join("");
	}
	return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/**
 * Builds the cover letter as LaTeX source for the cover.cls template:
 * forward-looking and task-solving, motivated only by verified company
 * specifics (or posting-derived focus when none are given), with every
 * requirement matched or honestly bridged. Returns the EMPTY_SLUG hard
 * error with no TeX when nothing identifies the posting.
 */
export function buildCoverLetter(input: CoverInput): CoverResult {
	const slug = makeJobSlug(input.company, input.role, input.postingUrl);
	if (!slug) {
		return { ok: false, error: EMPTY_SLUG_ERROR };
	}
	const gate = checkGateSummary(input.evaluation);
	if (gate.refused) {
		return { ok: false, error: gate.refused };
	}
	const profile = input.profile;
	const company = input.company ?? "your company";
	const role = input.role ?? "this role";
	const coverage = matchRequirements(input.postingText, profile);
	const logistics = extractLogistics(input.postingText);

	const matched = coverage.filter((item) => item.status === "matched").slice(0, 5);
	const gaps = coverage.filter((item) => item.status === "gap").slice(0, 2);
	const strongDomain = matched
		.map((item) => item.evidence as string)
		.find((evidence) => strongDomainNames(profile).includes(evidence));
	const adjacentDomain = [...adjacentDomainNames(profile), ...strongDomainNames(profile)].find((domain) =>
		input.postingText.toLowerCase().includes(domain.toLowerCase()),
	);
	const domain = strongDomain ?? adjacentDomain;
	const goal = profile.preferences?.targetRoles?.[0];

	const topSkills = matched
		.map((item) => item.evidence as string)
		.filter((evidence) => primarySkillNames(profile).includes(evidence))
		.slice(0, 3);
	const skillList =
		(topSkills.length > 0 ? topSkills : primarySkillNames(profile).slice(0, 3)).join(", ") ||
		"relevant skills";

	const opening = [
		`I am applying for the ${role} role at ${company}.`,
		domain
			? `My work in ${domain} with ${skillList} maps directly to your stated requirements.`
			: `My work with ${skillList} maps directly to your stated requirements.`,
		goal ? `This role fits the ${goal} direction I am pursuing.` : null,
		goal && domain
			? `I am pursuing ${goal} work, and this role continues that direction with ${domain} at the center.`
			: null,
	]
		.filter(Boolean)
		.join(" ") as string;

	const intro = `Here is how I would approach your key tasks${domain ? ` in ${domain}` : ""}:`;

	const bulletPatterns = [
		(label: string) =>
			domain ? `I will apply ${label} to ${domain} work.` : `I will apply ${label} to your key tasks.`,
		(label: string) =>
			goal ? `I will use ${label} for ${goal} work.` : `I will use ${label} to deliver quality work.`,
		(label: string) =>
			goal && domain
				? `I will bring ${label} to ${goal} work in ${domain}.`
				: goal
					? `I will bring ${label} to ${goal} work.`
					: `I will bring ${label} to team delivery.`,
	];
	const bullets = matched.map((item, index) => {
		const label = postingSurfaceForm(item.evidence as string, input.postingText);
		if (item.kind === "nice-to-have") {
			return `\\textbf{${label}}: I will bring ${label} to ${goal ?? "team"} work as a stated nice-to-have.`;
		}
		return `\\textbf{${label}}: ${bulletPatterns[index % bulletPatterns.length](label)}`;
	});

	const examples = [...(input.highlights ?? []).slice(0, 2)].map((example) =>
		example.trim().replace(/[.]+$/, ""),
	);
	if (examples.length < 3 && input.experience?.[0]?.bullets[0]) {
		examples.push(input.experience[0].bullets[0].trim().replace(/[.]+$/, ""));
	}
	const results = examples.length > 0
		? `A recent example: ${examples[0]}.${examples[1] ? ` Another: ${examples[1]}.` : ""}${examples[2] ? ` Another: ${examples[2]}.` : ""}`
		: null;

	const anchor =
		pickBridgeAnchor(
			gaps.map((gap) => gap.requirement).join(" "),
			[...secondarySkillNames(profile), ...adjacentDomainNames(profile)],
		) ?? "related work";
	const bridge = gaps.length > 0
		? `For ${joinAnd(gaps.map((gap) => gap.requirement))}, which ${gaps.length > 1 ? "are" : "is"} new to me, I bring ${anchor} experience and a plan to close the gap in the first month.`
		: null;

	const specifics = normalizeCompanySpecifics(input.companySpecifics);
	const companyPara = specifics.kept.length > 0
		? [
			`What draws me to ${company} is that "${specifics.kept[0].text}" (${specifics.kept[0].sourceUrl}).`,
			...specifics.kept.slice(1).map((specific) => `"${specific.text}" (${specific.sourceUrl}).`),
			goal
				? `I want to contribute ${goal} work to that effort.`
				: `I want to contribute to that effort.`,
		].join(" ")
		: `What draws me to ${company} is your stated focus on ${domain ?? "this field"}.`;

	const essentials = coverage
		.filter((item) => item.kind === "essential" && item.status !== "gap")
		.slice(0, 2)
		.map((item) => item.requirement);
	const focus =
		essentials.length > 0
			? `Your stated focus on ${joinAnd(essentials)} is exactly where I contribute best.`
			: null;

	const energizer = profile.energizingTasks[0];
	const fit = [
		energizer ? `${energizer[0].toUpperCase()}${energizer.slice(1)} energizes me, and I bring that energy to team delivery.` : null,
		`I do my best work with clear ownership and steady feedback.`,
	]
		.filter(Boolean)
		.join(" ") as string;

	const logisticsParts: string[] = [];
	if (logistics.workMode) {
		logisticsParts.push(`the ${logistics.workMode} arrangement`);
	}
	// The deadline never prints in employer-facing text (issue 19): a
	// wrong date in a status field is an internal bug, but printed to an
	// employer it is a false statement about their own process. The
	// employer knows their deadline; the reference ID is what they need.
	if (logistics.referenceId) {
		logisticsParts.push(`reference ${logistics.referenceId}`);
	}
	const logisticsLine = logisticsParts.length > 0 ? `I note ${joinAnd(logisticsParts)}.` : null;

	const bodyParts = [
		opening,
		intro,
		...bullets.map((bullet) => bullet.replace(/^\\textbf\{(.*?)\}: /, "$1: ")),
		...(results ? [results] : []),
		...(bridge ? [bridge] : []),
		companyPara,
		...(focus ? [focus] : []),
		fit,
		...(logisticsLine ? [logisticsLine] : []),
	];
	const wordCount = countWords(bodyParts);

	// Bridging-slot rule: gap names live only inside the "new to me"
	// bridge sentence. The general union carries matched/bridged names
	// only; the bridge slot alone additionally carries gap names, so a
	// gap named anywhere else fails the audit instead of recombining.
	const gapNames = gaps.map((gap) => gap.requirement);
	const union = [
		JSON.stringify(profile),
		JSON.stringify(input.experience ?? []),
		JSON.stringify(input.highlights ?? []),
		input.masterCvText ?? "",
		input.workspaceProfileText ?? "",
		...specifics.kept.map((specific) => specific.text),
		...specifics.kept.map((specific) => specific.sourceUrl),
		input.company ?? "",
		input.role ?? "",
		logistics.workMode ?? "",
		logistics.deadline ?? "",
		logistics.referenceId ?? "",
		...coverage.filter((item) => item.status !== "gap").map((item) => item.requirement),
		BUILDER_LEXICON.join(" "),
	];
	const bridgeUnion = [...union, ...gapNames];
	const draftDrift: string[] = [];
	for (const prose of bodyParts) {
		const slotUnion = bridge && prose === bridge ? bridgeUnion : union;
		const audit = auditClaim(prose, slotUnion);
		if (!audit.grounded) {
			draftDrift.push(`${prose} (missing: ${audit.missing.join(", ")})`);
		}
	}

	const warnings: CoverWarnings = {
		profileConsistency: checkSourceConsistency(profile, input.masterCvText, input.workspaceProfileText),
		draftDrift,
		stretchChoices: gaps.map((gap) => ({
			bullet: gap.requirement,
			reason: `${gap.requirement} is a gap; the letter bridges it as new to me with a one-month closing plan. Keep, soften, or drop? Promise note: the one-month plan is a commitment you must willingly make — the stateless tool cannot confirm it, so keep only if you will do it.`,
			options: ["keep", "soften", "drop"] as ["keep", "soften", "drop"],
		})),
	};
	if (specifics.dropped > 0) {
		warnings.provenanceNote =
			`Refused ${specifics.dropped} company-specific entr${specifics.dropped === 1 ? "y" : "ies"} without a fetched source URL; ` +
			"only { text, sourceUrl } facts motivate the letter — pass research-company claims through directly.";
	}
	if (gate.note) {
		warnings.evaluationNote = gate.note;
	}
	if ((input.postingLanguage ?? "en").toLowerCase() !== "en") {
		warnings.languageNote = englishOnlyNote(input.postingLanguage ?? "en");
	}
	if (wordCount < 250) {
		warnings.wordCountNote =
			`Letter is below the 250-300 word band (${wordCount} words); add verified company specifics or highlights before submitting.`;
	} else if (wordCount > 300) {
		warnings.wordCountNote =
			`Letter is above the 250-300 word band (${wordCount} words); trim by restatement before submitting.`;
	}
	const contactNote = contactWarning({
		email: input.contact?.email || profile.email || undefined,
		phone: input.contact?.phone || profile.phone || undefined,
	});
	if (contactNote) {
		warnings.contactNote = contactNote;
	}

	const salutation = input.hiringManager
		? `Dear ${input.hiringManager},`
		: input.team
			? `Dear ${input.team},`
			: `Dear ${company},`;
	const closing = CLOSINGS[(input.postingLanguage ?? "en").toLowerCase()] ?? CLOSINGS.en;
	const contact = {
		email: input.contact?.email || profile.email || undefined,
		phone: input.contact?.phone || profile.phone || undefined,
		linkedin: input.contact?.linkedin || profile.linkedin || undefined,
		github: input.contact?.github || profile.github || undefined,
	};
	const headerContact = [contact.email, contact.phone, contact.linkedin ? "LinkedIn" : null]
		.filter(Boolean)
		.join(" | ");

	const bulletItems = bullets
		.map((bullet) => {
			const match = /^\\textbf\{(.*?)\}: (.*)$/.exec(bullet);
			if (!match) {
				return `    \\item ${braceItem(escapeLatex(bullet))}`;
			}
			return `    \\item \\textbf{${escapeLatex(match[1])}}: ${braceItem(escapeLatex(match[2]))}`;
		})
		.join("\n");
	const letterParagraph = (text: string | null) =>
		text ? `\\lettercontent{${escapeLatex(text)}}\n` : "";

	const tex = [
		"\\documentclass[]{cover}",
		"\\usepackage{fancyhdr}",
		"",
		"\\pagestyle{fancy}",
		"\\fancyhf{}",
		"",
		"\\rfoot{Page \\thepage \\hspace{0pt}}",
		"\\thispagestyle{empty}",
		"\\renewcommand{\\headrulewidth}{0pt}",
		"\\begin{document}",
		"",
		`\\namesection{}{\\Huge{${escapeLatex(profile.name)}}}{${escapeLatex(headerContact)}}`,
		"",
		"\\currentdate{\\today}",
		`\\lettercontent{${escapeLatex(salutation)}}`,
		"",
		letterParagraph(opening),
		letterParagraph(intro),
		"{\\raggedright\\fontspec[Path = OpenFonts/fonts/raleway/]{Raleway-Medium}\\fontsize{11pt}{13pt}\\selectfont",
		"\\begin{itemize}",
		bulletItems,
		"\\end{itemize}\\par}",
		"\\vspace{6pt}",
		"",
		letterParagraph(results),
		letterParagraph(bridge),
		letterParagraph(companyPara),
		letterParagraph(focus),
		letterParagraph(fit),
		letterParagraph(logisticsLine),
		"\\lettercontent{I look forward to hearing from you.}",
		"",
		"\\begin{flushright}",
		`\\closing{${closing}}`,
		"",
		`\\signature{${escapeLatex(profile.name)}}`,
		"\\end{flushright}",
		"\\end{document}",
	]
		.filter((line) => line !== "")
		.join("\n");

	const banViolations = checkWritingBans(bodyParts.join(" "));

	const files = resolveTemplateFile(
		slug,
		"cover_letters",
		"cover",
		input.template,
		`cd cover_letters && xelatex --no-shell-escape -interaction=nonstopmode cover_${slug}.tex`,
		1,
	);
	const templateNote = templateWarning(input.template);
	if (templateNote) {
		warnings.templateNote = templateNote;
	}

	return {
		ok: true,
		slug,
		filePath: files.filePath,
		tex,
		compileCommand: files.compileCommand,
		pageLimit: files.pageLimit,
		archiveDir: archiveDirFor(slug),
		wordCount,
		coverage,
		logistics,
		warnings,
		banViolations,
	};
}

