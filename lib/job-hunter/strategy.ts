import { checkSourceConsistency, CONTENT_STOPWORDS } from "@/lib/job-hunter/tailor.ts";
import { contentWords } from "@/lib/job-hunter/evaluate.ts";
import { resolveProfile, evidencePool, type Profile } from "@/lib/job-hunter/profile.ts";
import {
	adjacentDomainNames,
	careerTargetNames,
	primarySkillNames,
	secondarySkillNames,
	strongDomainNames,
} from "@/lib/job-hunter/profile.ts";

export interface EvaluationSummary {
	fitScore?: number;
	verdict?: string;
	strengths?: string[];
	gaps?: string[];
}

export interface StrategyInput {
	profile?: unknown;
	/** Caller-passed analyze-job output; reinforces evidence and gaps, never invents them. */
	evaluationSummary?: EvaluationSummary;
	/** More caller-passed analyze-job outputs; gaps recurring across summaries become priority gaps. */
	evaluationSummaries?: EvaluationSummary[];
	/** Candidate-nominated directions to assess; ungrounded ones are skipped honestly. */
	focusAreas?: string[];
	masterCvText?: string;
	workspaceProfileText?: string;
}

export interface Direction {
	direction: string;
	why: string[];
	evidence: string[];
	gapsToClose: string[];
	dimensions: string[];
}

export interface StrategyPlan {
	directions: Direction[];
	skipped: string[];
	/** Gaps named in two or more evaluation summaries, first-seen order. */
	priorityGaps: string[];
	avoidNotes: string[];
	frameworkNote: string;
	warnings: string[];
}

/** Label marking caller-supplied evaluation strengths inside evidence arrays. */
export const STRENGTH_EVIDENCE_SUFFIX = " (evaluation strength)";

function isPlaceholder(profile: Profile, pool: string[]): boolean {
	return profile.name.includes("YOUR") || pool.length === 0;
}

/**
 * Generic role vocabulary that must never ground a direction on its own:
 * sharing only "engineer" (or "senior", "team", ...) proves nothing about
 * the nominated area. At least one non-generic content word must overlap.
 */
const GENERIC_TERMS = new Set([
	"engineer",
	"engineering",
	"developer",
	"development",
	"manager",
	"management",
	"specialist",
	"analyst",
	"consultant",
	"architect",
	"role",
	"roles",
	"work",
	"team",
	"teams",
	"job",
	"jobs",
	"position",
	"positions",
	"senior",
	"junior",
	"lead",
	"principal",
	"staff",
	"associate",
	"assistant",
	"department",
	"division",
]);

function contentTokens(text: string): Set<string> {
	return new Set(
		text
			.toLowerCase()
			.split(/[^a-z0-9+#]+/)
			.filter((word) => word.length >= 2 && !GENERIC_TERMS.has(word)),
	);
}

/**
 * Phrases that may ground a nominated area: skills and experience only
 * (primary/secondary skills, strong/adjacent domains, energizing tasks).
 * Career goals are deliberately excluded — a goal overlapping only goals is
 * circular (pursue X because you want X), which is exactly what the skip
 * list exists to prevent.
 */
function groundingPool(profile: Profile): string[] {
	return [
		...primarySkillNames(profile),
		...secondarySkillNames(profile),
		...strongDomainNames(profile),
		...adjacentDomainNames(profile),
		...profile.energizingTasks,
	].filter((phrase) => phrase.trim().length >= 2);
}

function tokenOverlap(area: string, phrases: string[]): string[] {
	const trimmed = area.trim().toLowerCase();
	const exact = phrases.filter((phrase) => phrase.trim().toLowerCase() === trimmed);
	if (exact.length > 0) {
		return exact;
	}
	const areaTokens = contentTokens(area);
	if (areaTokens.size === 0) {
		return [];
	}
	return phrases.filter((phrase) => {
		const phraseTokens = contentTokens(phrase);
		for (const token of areaTokens) {
			if (phraseTokens.has(token)) {
				return true;
			}
		}
		return false;
	});
}

/**
 * A nominated area is assessable only when a skills/experience phrase
 * grounds it through whole-word overlap on non-generic terms (issue 12).
 * Either-direction substring containment is gone: "Engineer" no longer
 * grounds "Engineering Manager", but "credit risk" still grounds
 * "Credit Risk Analytics". Goal-only overlap is circular and never grounds.
 */
function groundingFor(area: string, profile: Profile): string[] {
	return tokenOverlap(area, groundingPool(profile));
}

/** Shared word floor (issue 24): the same helper prep's tags use, so "SQL" works in both. */
function sharesWords(a: string, b: string): boolean {
	const bWords = new Set([...contentWords(b)].filter((word) => !CONTENT_STOPWORDS.has(word)));
	for (const word of contentWords(a)) {
		if (CONTENT_STOPWORDS.has(word)) {
			continue;
		}
		if (bWords.has(word)) {
			return true;
		}
	}
	return false;
}

/** Single summary stays valid: the plural field extends it, never replaces it. */
function aggregateSummaries(input: StrategyInput): EvaluationSummary[] {
	return [...(input.evaluationSummaries ?? []), ...(input.evaluationSummary ? [input.evaluationSummary] : [])];
}

function normalizeKey(text: string): string {
	return text.trim().toLowerCase();
}

/** Unique gaps across summaries, first-seen order (case-insensitive dedupe). */
function aggregateGaps(summaries: EvaluationSummary[]): string[] {
	const seen = new Set<string>();
	const gaps: string[] = [];
	for (const summary of summaries) {
		for (const gap of summary.gaps ?? []) {
			const key = normalizeKey(gap);
			if (key && !seen.has(key)) {
				seen.add(key);
				gaps.push(gap.trim());
			}
		}
	}
	return gaps;
}

/** Gaps named in two or more summaries — the priority gaps to close. */
function recurringGaps(summaries: EvaluationSummary[]): string[] {
	const counts = new Map<string, { gap: string; summaries: number }>();
	for (const summary of summaries) {
		const inSummary = new Set((summary.gaps ?? []).map(normalizeKey).filter(Boolean));
		for (const key of inSummary) {
			const entry = counts.get(key);
			if (entry) {
				entry.summaries += 1;
			} else {
				const original = (summary.gaps ?? []).find((gap) => normalizeKey(gap) === key) ?? key;
				counts.set(key, { gap: original.trim(), summaries: 1 });
			}
		}
	}
	return [...counts.values()].filter((entry) => entry.summaries >= 2).map((entry) => entry.gap);
}

/** Unique caller-supplied strengths across summaries, first-seen order. */
function aggregateStrengths(summaries: EvaluationSummary[]): string[] {
	const seen = new Set<string>();
	const strengths: string[] = [];
	for (const summary of summaries) {
		for (const strength of summary.strengths ?? []) {
			const key = normalizeKey(strength);
			if (key && !seen.has(key)) {
				seen.add(key);
				strengths.push(strength.trim());
			}
		}
	}
	return strengths;
}

/**
 * Recommends career directions from the profile plus the evaluation
 * framework. Every direction cites profile phrases as evidence; anything
 * without grounding is reported in skipped, never recommended. Directions
 * rank by evidence depth (most grounded first) then fewest gaps, so thin
 * evidence reads as thin — ranked low with few citations, never padded.
 * Evaluation summaries reinforce evidence (labeled strengths) and gaps
 * (recurring gaps prioritized) but add no new facts.
 */
export function planCareerStrategy(input: StrategyInput): StrategyPlan {
	const profile = resolveProfile(input.profile);
	const pool = evidencePool(profile);
	const warnings = checkSourceConsistency(profile, input.masterCvText, input.workspaceProfileText);
	const summaries = aggregateSummaries(input);
	const allGaps = aggregateGaps(summaries);
	const priority = recurringGaps(summaries);
	const strengths = aggregateStrengths(summaries);
	const priorityKeys = new Set(priority.map(normalizeKey));

	if (isPlaceholder(profile, pool)) {
		warnings.push(
			"Profile is still a placeholder; no directions recommended until /setup provides real skills, domains, and goals.",
		);
		return {
			directions: [],
			skipped: [],
			priorityGaps: priority,
			avoidNotes: [],
			frameworkNote: frameworkNote(summaries, priority),
			warnings,
		};
	}

	const orderGaps = (gaps: string[]): string[] =>
		[...gaps].sort((a, b) => Number(priorityKeys.has(normalizeKey(b))) - Number(priorityKeys.has(normalizeKey(a))));

	const directions: Direction[] = [];
	const covered = new Set<string>();

	const transferable = [...primarySkillNames(profile), ...secondarySkillNames(profile)].slice(0, 3);
	const targetRoles = careerTargetNames(profile);
	for (const goal of targetRoles) {
		const overlapping = pool.filter(
			(phrase) => phrase !== goal && sharesWords(phrase, goal) && !targetRoles.includes(phrase),
		);
		const evidence = [...overlapping, ...transferable.filter((skill) => !overlapping.includes(skill))];
		directions.push({
			direction: `Pursue ${goal} roles`,
			why: [
				`Stated career goal: ${goal}.`,
				`Closest profile evidence: ${evidence.slice(0, 3).join(", ") || "none yet"}.`,
				...(profile.energizingTasks.length > 0
					? [`Energizing work it uses: ${profile.energizingTasks.join(", ")}. `]
					: []),
			].map((line) => line.trim()),
			evidence,
			gapsToClose: orderGaps(
				allGaps.filter((gap) => !evidence.some((phrase) => sharesWords(phrase, gap))),
			),
			dimensions: ["career", "experience"],
		});
		covered.add(goal.toLowerCase());
	}

	for (const domain of strongDomainNames(profile)) {
		if (covered.has(domain.toLowerCase())) {
			continue;
		}
		const evidence = [domain, ...transferable.filter((skill) => skill !== domain)];
		directions.push({
			direction: `Deepen ${domain} specialization`,
			why: [`Stated strong domain: ${domain}.`, `Supporting skills: ${transferable.join(", ") || "none listed"}.`],
			evidence,
			gapsToClose: orderGaps(allGaps.filter((gap) => !evidence.some((phrase) => sharesWords(phrase, gap)))),
			dimensions: ["experience", "technical"],
		});
		covered.add(domain.toLowerCase());
	}

	const skipped: string[] = [];
	for (const area of input.focusAreas ?? []) {
		if (covered.has(area.toLowerCase()) || directions.some((d) => d.direction.toLowerCase().includes(area.toLowerCase()))) {
			continue;
		}
		const grounding = groundingFor(area, profile);
		if (grounding.length === 0) {
			const goalOnly = tokenOverlap(area, careerTargetNames(profile)).length > 0;
			skipped.push(
				goalOnly
					? `${area} skipped: overlaps only career goals, which is circular (pursue X because you want X); add skills or experience before pursuing.`
					: `${area} skipped: no profile phrase grounds it; add experience before pursuing.`,
			);
			continue;
		}
		const evidence = [...grounding];
		directions.push({
			direction: `Assess ${area} as a stretch direction`,
			why: [`Nominated focus area grounded by: ${grounding.join(", ")}.`, "Adjacent rather than core — validate with one project before committing."],
			evidence,
			gapsToClose: orderGaps([
				`Direct ${area} track record beyond adjacent exposure.`,
				...allGaps.filter((gap) => !grounding.some((phrase) => sharesWords(phrase, gap))),
			]),
			dimensions: ["career", "experience", "technical"],
		});
		covered.add(area.toLowerCase());
	}

	// Rank by evidence depth, then fewest gaps — before strengths land, so
	// caller-supplied reinforcement never inflates profile grounding.
	directions.sort((a, b) => b.evidence.length - a.evidence.length || a.gapsToClose.length - b.gapsToClose.length);

	// Strengths reinforce evidence: caller-supplied, labeled as such in the
	// evidence arrays (this is what the framework note claims).
	for (const direction of directions) {
		for (const strength of strengths) {
			const labeled = `${strength}${STRENGTH_EVIDENCE_SUFFIX}`;
			if (!direction.evidence.includes(strength) && !direction.evidence.includes(labeled)) {
				direction.evidence.push(labeled);
			}
		}
	}

	const avoidNotes = profile.drainingTasks.map(
		(task) => `Steer away from roles centered on ${task} (stated draining task).`,
	);

	return { directions, skipped, priorityGaps: priority, avoidNotes, frameworkNote: frameworkNote(summaries, priority), warnings };
}

function frameworkNote(summaries: EvaluationSummary[], priority: string[]): string {
	const base =
		"Assessed against the evaluation framework dimensions (technical, experience, behavioral, location, career); strengths reinforce evidence, gaps become gaps to close.";
	if (summaries.length === 0) {
		return `${base} No evaluation summary held.`;
	}
	const last = summaries[summaries.length - 1] as EvaluationSummary;
	const score = last.fitScore !== undefined ? ` (${last.fitScore}/100)` : "";
	const verdict = last.verdict ?? "unverdict";
	let note = `${base} Last evaluation: ${verdict}${score}.`;
	if (summaries.length > 1) {
		note += ` ${summaries.length} evaluations held.`;
	}
	if (priority.length > 0) {
		note += ` Priority gaps: ${priority.join("; ")}.`;
	}
	return note;
}
