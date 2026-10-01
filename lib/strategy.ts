import { checkSourceConsistency } from "@/lib/tailor.ts";
import { resolveProfile, evidencePool, type Profile } from "@/lib/profile.ts";

export interface EvaluationSummary {
	fitScore?: number;
	verdict?: string;
	strengths?: string[];
	gaps?: string[];
}

export interface StrategyInput {
	profile?: unknown;
	/** Caller-passed evaluate-job output; reinforces evidence and gaps, never invents them. */
	evaluationSummary?: EvaluationSummary;
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
	avoidNotes: string[];
	frameworkNote: string;
	warnings: string[];
}

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
 * A nominated area is assessable only when a profile phrase grounds it
 * through whole-word overlap on non-generic terms (issue 12). Either-direction
 * substring containment is gone: "Engineer" no longer grounds "Engineering
 * Manager", but "credit risk" still grounds "Credit Risk Analytics".
 */
function groundingFor(area: string, pool: string[]): string[] {
	const trimmed = area.trim().toLowerCase();
	const exact = pool.filter((phrase) => phrase.trim().toLowerCase() === trimmed);
	if (exact.length > 0) {
		return exact;
	}
	const areaTokens = contentTokens(area);
	if (areaTokens.size === 0) {
		return [];
	}
	return pool.filter((phrase) => {
		const phraseTokens = contentTokens(phrase);
		for (const token of areaTokens) {
			if (phraseTokens.has(token)) {
				return true;
			}
		}
		return false;
	});
}

function words(text: string): Set<string> {
	return new Set(
		text
			.toLowerCase()
			.split(/[^a-z0-9+#]+/)
			.filter((word) => word.length >= 4),
	);
}

function sharesWords(a: string, b: string): boolean {
	const bWords = words(b);
	for (const word of words(a)) {
		if (bWords.has(word)) {
			return true;
		}
	}
	return false;
}

/**
 * Recommends career directions from the profile plus the evaluation
 * framework. Every direction cites profile phrases as evidence; anything
 * without grounding is reported in skipped, never recommended. The
 * evaluation summary reinforces evidence and gaps but adds no new facts.
 */
export function planCareerStrategy(input: StrategyInput): StrategyPlan {
	const profile = resolveProfile(input.profile);
	const pool = evidencePool(profile);
	const warnings = checkSourceConsistency(profile, input.masterCvText, input.workspaceProfileText);
	const summary = input.evaluationSummary;
	const summaryGaps = summary?.gaps ?? [];

	if (isPlaceholder(profile, pool)) {
		warnings.push(
			"Profile is still a placeholder; no directions recommended until /setup provides real skills, domains, and goals.",
		);
		return { directions: [], skipped: [], avoidNotes: [], frameworkNote: frameworkNote(summary), warnings };
	}

	const directions: Direction[] = [];
	const covered = new Set<string>();

	const transferable = [...profile.primarySkills, ...profile.secondarySkills].slice(0, 3);
	for (const goal of profile.careerGoals) {
		const overlapping = pool.filter(
			(phrase) => phrase !== goal && sharesWords(phrase, goal) && !profile.careerGoals.includes(phrase),
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
			gapsToClose: summaryGaps.filter((gap) => !evidence.some((phrase) => sharesWords(phrase, gap))),
			dimensions: ["career", "experience"],
		});
		covered.add(goal.toLowerCase());
	}

	for (const domain of profile.strongDomains) {
		if (covered.has(domain.toLowerCase())) {
			continue;
		}
		const evidence = [domain, ...transferable.filter((skill) => skill !== domain)];
		directions.push({
			direction: `Deepen ${domain} specialization`,
			why: [`Stated strong domain: ${domain}.`, `Supporting skills: ${transferable.join(", ") || "none listed"}.`],
			evidence,
			gapsToClose: summaryGaps.filter((gap) => !evidence.some((phrase) => sharesWords(phrase, gap))),
			dimensions: ["experience", "technical"],
		});
		covered.add(domain.toLowerCase());
	}

	const skipped: string[] = [];
	for (const area of input.focusAreas ?? []) {
		if (covered.has(area.toLowerCase()) || directions.some((d) => d.direction.toLowerCase().includes(area.toLowerCase()))) {
			continue;
		}
		const grounding = groundingFor(area, pool);
		if (grounding.length === 0) {
			skipped.push(`${area} skipped: no profile phrase grounds it; add experience before pursuing.`);
			continue;
		}
		directions.push({
			direction: `Assess ${area} as a stretch direction`,
			why: [`Nominated focus area grounded by: ${grounding.join(", ")}.`, "Adjacent rather than core — validate with one project before committing."],
			evidence: grounding,
			gapsToClose: [
				`Direct ${area} track record beyond adjacent exposure.`,
				...summaryGaps.filter((gap) => !grounding.some((phrase) => sharesWords(phrase, gap))),
			],
			dimensions: ["career", "experience", "technical"],
		});
		covered.add(area.toLowerCase());
	}

	const avoidNotes = profile.drainingTasks.map(
		(task) => `Steer away from roles centered on ${task} (stated draining task).`,
	);

	return { directions, skipped, avoidNotes, frameworkNote: frameworkNote(summary), warnings };
}

function frameworkNote(summary: EvaluationSummary | undefined): string {
	const base =
		"Assessed against the evaluation framework dimensions (technical, experience, behavioral, location, career); strengths reinforce evidence, gaps become gaps to close.";
	if (!summary || (summary.verdict === undefined && summary.fitScore === undefined)) {
		return `${base} No evaluation summary held.`;
	}
	const score = summary.fitScore !== undefined ? ` (${summary.fitScore}/100)` : "";
	const verdict = summary.verdict ?? "unverdict";
	return `${base} Last evaluation: ${verdict}${score}.`;
}
