import { buildHackingQueries, fetchBoardJobs, filterListingsByQuery } from "@/lib/boards.ts";
import type { BoardRef } from "@/lib/boards.ts";
import {
	checkLanguage,
	extractGaps,
	extractStrengths,
	overallScore,
	parsePostingDay,
	phraseMatches,
	scoreDimensions,
} from "@/lib/evaluate.ts";
import {
	defaultFetch,
	extractTitle,
	stripHtml,
} from "@/lib/fetch-posting.ts";
import type { FetchLike } from "@/lib/fetch-posting.ts";
import { isCanonical, makeKey } from "@/lib/job-key.ts";
import type { Profile } from "@/lib/profile.ts";

/**
 * Job discovery planner (ticket 05). Pure planning over caller-held or
 * injected-fetcher results: the server never invents postings, and the
 * host owns every write (seen store, tracker, portal CLI runs).
 */

export const SEARCH_LIMIT_MAX = 20;
export const SEARCH_LIMIT_DEFAULT = 10;
export const SEARCH_RECENCY_DAYS = 14;

export type RemoteMode = "remote" | "hybrid" | "onsite";
export type SearchSource = "portal-live" | "board" | "brightdata" | "web-fallback";
export type FitBand = "high" | "medium" | "low" | "unscored";
export type CandidateStatus = "active" | "expired" | "unknown";

/**
 * Per-run query cap (issue 13): the active source runs at most this many
 * queries per planSearch call (explicit query, or the first N auto-queries).
 * Low-volume politeness stays, but the cap is now visible via queriesRun.
 */
export const SEARCH_QUERY_CAP = 3;

/**
 * Probe texts shorter than this carry too little signal to assert a fit
 * band (issue 12). Thin candidates report "unscored — thin evidence" with
 * their text length instead of a low/medium/high claim.
 */
export const THIN_EVIDENCE_THRESHOLD = 80;

/**
 * Scale comparability (issue 12): quick-fit bands (60/45 over snippet probe
 * text) and rank verdict bands (75/60/45/30 over full fetched text) are
 * different instruments over different text depths. Until calibrated on a
 * labeled set, the two scores are NOT comparable — treat them as separate
 * signals, never as one scale.
 */

export interface SearchFilters {
	keywords?: string;
	location?: string;
	remoteMode?: RemoteMode;
	jobType?: string;
	limit?: number;
}

export interface ResolvedFilters {
	keywords: string;
	location: string;
	remoteMode?: RemoteMode;
	jobType?: string;
	limit: number;
}

/** Caps the result limit at 20; defaults to 10, floors at 1. */
export function capLimit(limit: number | undefined): number {
	if (limit === undefined || limit === null || Number.isNaN(limit)) {
		return SEARCH_LIMIT_DEFAULT;
	}
	return Math.max(1, Math.min(SEARCH_LIMIT_MAX, Math.floor(limit)));
}

/**
 * Explicit filters win. Absent keywords fall back to profile-derived
 * auto-queries; an absent location falls back to the profile location,
 * which the live portal path still requires to be non-empty.
 */
export function resolveSearchFilters(filters: SearchFilters | undefined, profile: Profile): ResolvedFilters {
	return {
		keywords: filters?.keywords?.trim() ?? "",
		location: filters?.location?.trim() || profile.location?.trim() || "",
		remoteMode: filters?.remoteMode,
		jobType: filters?.jobType?.trim() || undefined,
		limit: capLimit(filters?.limit),
	};
}

export interface AutoQuery {
	/** Function-based category (goal, domain, or skill group), never a bare title. */
	category: string;
	/** Profile language this rendering targets. */
	language: string;
	/** Keyword query text for the portal or fallback search. */
	query: string;
}

/**
 * Profile-derived auto-queries, organized by function (career goals,
 * strong domains, then primary-skill groups) and rendered once per
 * profile language, per the search-queries.md language scope.
 */
export function buildAutoQueries(profile: Profile): AutoQuery[] {
	const languages =
		profile.languages.length > 0 ? profile.languages.map((entry) => entry.language) : ["English"];
	const categories: string[] = [];
	for (const goal of profile.careerGoals) {
		if (goal.trim().length >= 2 && !categories.includes(goal.trim())) {
			categories.push(goal.trim());
		}
	}
	for (const domain of profile.strongDomains) {
		if (domain.trim().length >= 2 && !categories.includes(domain.trim())) {
			categories.push(domain.trim());
		}
	}
	const skillGroup = profile.primarySkills.map((skill) => skill.trim()).filter((skill) => skill.length >= 2);
	if (skillGroup.length > 0) {
		categories.push(skillGroup.slice(0, 3).join(" "));
	}
	if (categories.length === 0) {
		return [];
	}
	const queries: AutoQuery[] = [];
	for (const language of languages) {
		for (const category of categories) {
			queries.push({ category, language, query: `${category} ${skillGroup.slice(0, 2).join(" ")}`.trim() });
		}
	}
	return queries;
}

/** LinkedIn people-search pages are never scraped, only linked for referrals. */
export function isPeopleSearchUrl(url: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	if (!parsed.hostname.toLowerCase().includes("linkedin.com")) {
		return false;
	}
	const path = parsed.pathname.toLowerCase();
	return (
		path.startsWith("/in/") ||
		path.startsWith("/people/") ||
		path.includes("/search/results/people")
	);
}

export interface RawPosting {
	title: string;
	company: string;
	url: string;
	description?: string;
	postedDate?: string;
	deadline?: string;
	portal?: string;
}

export interface PortalError {
	code: string;
	message: string;
}

export interface PortalArgs {
	location: string;
	query: string;
	jobAgeDays: number;
	remoteMode?: RemoteMode;
	page: number;
	limit: number;
}

export interface PortalResult {
	jobs: RawPosting[];
	errors: PortalError[];
	rateLimited: boolean;
}

/**
 * Live portal path. The default is intentionally absent: the host runs
 * the portal CLI (linkedin-search skill contract) and passes results in,
 * or injects a runner. This keeps the server side-effect free.
 */
export type PortalRunner = (args: PortalArgs) => Promise<PortalResult>;
export type PostingFetcher = (query: string) => Promise<RawPosting[]>;
export type Sleeper = (ms: number) => Promise<void>;

const realSleep: Sleeper = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Low-volume backoff: walks portal pages and retries a rate-limited page with exponential waits. */
export async function runPortalWithBackoff(
	runner: PortalRunner,
	args: PortalArgs,
	options: { maxRetries?: number; sleep?: Sleeper; maxPages?: number } = {},
): Promise<{ jobs: RawPosting[]; errors: PortalError[]; attempts: number; pages: number }> {
	const maxRetries = options.maxRetries ?? 2;
	const maxPages = options.maxPages ?? 3;
	const sleep = options.sleep ?? realSleep;
	const errors: PortalError[] = [];
	const jobs: RawPosting[] = [];
	let attempts = 0;
	let pages = 0;
	let page = args.page;
	while (pages < maxPages && jobs.length < args.limit) {
		let result: PortalResult | null = null;
		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			attempts += 1;
			result = await runner({ ...args, page });
			errors.push(...result.errors);
			if (!result.rateLimited) {
				break;
			}
			if (attempt < maxRetries) {
				await sleep(1000 * 2 ** attempt);
			}
		}
		if (!result || result.rateLimited) {
			break;
		}
		if (result.jobs.length === 0) {
			break;
		}
		jobs.push(...result.jobs);
		pages += 1;
		page += 1;
	}
	return { jobs, errors, attempts, pages };
}

export interface QuickFit {
	score: number;
	band: FitBand;
	strengths: string[];
	gaps: string[];
	/** True when the probe text fell under THIN_EVIDENCE_THRESHOLD. */
	lowEvidence: boolean;
	/** Probe text length, so the host can judge the evidence depth. */
	textLength: number;
	/** Heuristic scorer, or the LLM extraction seam when it supplied evidence. */
	source: "heuristic" | "llm-extraction";
}

export interface SearchCandidate {
	key: string;
	title: string;
	company: string;
	url: string;
	postedDate: string | null;
	deadline: string | null;
	dateUnknown: boolean;
	status: CandidateStatus;
	portal: string;
	source: SearchSource;
	quickFit: QuickFit;
	language: { verdict: "PASS" | "FLAG" | "FAIL"; note: string };
	consolidationNote: string | null;
	referralLinks: string[];
	/** True when the employer is unknown: verify before evaluating (issue 13). */
	needsVerification: boolean;
}

/**
 * Structured extraction for one probe text (issue 12 LLM seam). JSON only:
 * mentioned skills with the exact probe-text quote that states them,
 * language requirements with quotes, and normalized dates. The deterministic
 * scorer consumes this; anything whose quote is absent from the probe text
 * is dropped as unverifiable — scores cite matched text, never invented
 * qualities.
 */
export interface ExtractionSkill {
	skill: string;
	quote: string;
}

export interface ExtractionLanguage {
	language: string;
	quote: string;
}

export interface CandidateExtraction {
	skills: ExtractionSkill[];
	languages: ExtractionLanguage[];
	postedDate?: string | null;
	deadline?: string | null;
}

/**
 * One batched call over all candidates' probe texts (issue 12). Keyed by
 * candidate key; missing keys mean "no extraction for this candidate".
 * Throwing degrades to the heuristic output with a note — never to invented
 * postings or scores.
 */
export type BatchExtractor = (inputs: { key: string; probeText: string }[]) => Promise<
	Record<string, CandidateExtraction>
>;

export interface SearchInput {
	filters?: SearchFilters;
	profile: Profile;
	seenKeys?: string[];
	appliedPairs?: string[];
	now?: Date;
	/** Injected live portal runner (host-owned); absent means the live path cannot run. */
	portal?: PortalRunner;
	/** Caller-supplied portal output (host ran the CLI); skips every fetch. */
	portalResults?: RawPosting[];
	brightDataKey?: string;
	brightDataFetch?: PostingFetcher;
	webFallbackFetch?: PostingFetcher;
	sleep?: Sleeper;
	/** Optional batched LLM extraction over probe texts; heuristic is the automatic fallback. */
	extractBatch?: BatchExtractor;
	/**
	 * Caller-supplied structured board refs (issue 13). Board APIs are
	 * per-company listings with no directory or keyword search, so the host
	 * owns the slug mapping. Boards run ahead of BrightData when present.
	 */
	boards?: BoardRef[];
	/** Injected board fetcher; defaults to the default fetch. */
	boardFetch?: FetchLike;
}

export interface SearchPlan {
	filters: ResolvedFilters;
	queries: AutoQuery[];
	candidates: SearchCandidate[];
	staleCount: number;
	seenSkipped: number;
	appliedSkipped: number;
	sources: SearchSource[];
	/** Query texts actually run this call, so the caller sees what coverage was bought (issue 13). */
	queriesRun: string[];
	notes: string[];
	errors: string[];
}

function appliedKey(company: string, title: string): string {
	return `${company.trim().toLowerCase()}||${title.trim().toLowerCase()}`;
}

/** Caller-passed dedupe: seen keys plus applied company/title pairs. Host owns the store. */
export function dedupeCandidates<T extends { key: string; company: string; title: string }>(
	items: T[],
	seenKeys: string[],
	appliedPairs: string[],
): { kept: T[]; seenSkipped: number; appliedSkipped: number } {
	const seen = new Set(seenKeys);
	const applied = new Set(appliedPairs.map((pair) => pair.trim().toLowerCase()));
	const kept: T[] = [];
	let seenSkipped = 0;
	let appliedSkipped = 0;
	for (const item of items) {
		if (seen.has(item.key)) {
			seenSkipped += 1;
			continue;
		}
		if (applied.has(appliedKey(item.company, item.title))) {
			appliedSkipped += 1;
			continue;
		}
		kept.push(item);
	}
	return { kept, seenSkipped, appliedSkipped };
}

function daysBetween(from: string, to: string): number {
	return (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000;
}

function bandFor(score: number): FitBand {
	if (score >= 60) {
		return "high";
	}
	if (score >= 45) {
		return "medium";
	}
	return "low";
}

function referralLinksFor(company: string): string[] {
	return [`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(company)}`];
}

/**
 * Confidence and gating stay separate fields (issue 12): a language-FAIL
 * override is a deliberate gate, not an evidence problem, so it keeps
 * asserting "low". Otherwise thin evidence withholds the band ("unscored")
 * instead of asserting it.
 */
function resolveBand(
	score: number,
	gate: { verdict: "PASS" | "FLAG" | "FAIL"; note: string },
	lowEvidence: boolean,
	textLength: number,
): { band: FitBand; languageNote: string } {
	if (gate.verdict === "FAIL") {
		const note = lowEvidence
			? `Language-gate override: ${gate.note} (thin evidence: ${textLength} chars)`
			: `Language-gate override: ${gate.note}`;
		return { band: "low", languageNote: note };
	}
	let languageNote = gate.note;
	if (gate.verdict === "FLAG") {
		languageNote = `Language-gate flag: ${gate.note}`;
	}
	if (lowEvidence) {
		return { band: "unscored", languageNote: `Unscored — thin evidence (${textLength} chars); ${languageNote}` };
	}
	return { band: bandFor(score), languageNote };
}

/** A quote counts as evidence only when it appears verbatim in the probe text. */
function quoteVerified(probeText: string, quote: string): boolean {
	const trimmed = quote.trim();
	return trimmed !== "" && probeText.toLowerCase().includes(trimmed.toLowerCase());
}

/**
 * Batched LLM extraction pass (issue 12). One call over all probe texts;
 * the deterministic scorer consumes verified items only, and any failure
 * keeps the heuristic output with a note. Scores cite matched text: a skill
 * counts only when its quote sits in the probe text AND it names a profile
 * phrase; dates fill nulls only and never override parsed values.
 */
async function applyExtraction(
	candidates: SearchCandidate[],
	probeTexts: Map<string, string>,
	input: SearchInput,
	now: Date,
	today: string,
	notes: string[],
): Promise<void> {
	if (!input.extractBatch || candidates.length === 0) {
		return;
	}
	let extracted: Record<string, CandidateExtraction>;
	try {
		extracted = await input.extractBatch(
			candidates.map((candidate) => ({ key: candidate.key, probeText: probeTexts.get(candidate.key) ?? "" })),
		);
	} catch (error) {
		notes.push(`LLM extraction failed (${String(error)}); heuristic output kept for all candidates.`);
		return;
	}
	const declared = new Map(
		input.profile.languages.map((entry) => [entry.language.toLowerCase(), entry.level]),
	);
	const strengthPool = [...input.profile.primarySkills, ...input.profile.strongDomains];
	for (const candidate of candidates) {
		const record = extracted[candidate.key];
		const probeText = probeTexts.get(candidate.key) ?? "";
		if (!record) {
			continue;
		}
		let consumed = false;
		const verifiedSkills = (record.skills ?? []).filter(
			(entry) =>
				quoteVerified(probeText, entry.quote) &&
				strengthPool.some(
					(phrase) => phrase !== "" && (phraseMatches(phrase, entry.skill) || phraseMatches(entry.skill, phrase)),
				),
		);
		let effectiveText = probeText;
		if (verifiedSkills.length > 0) {
			const canonical = strengthPool.filter((phrase) =>
				verifiedSkills.some((entry) => phraseMatches(phrase, entry.skill) || phraseMatches(entry.skill, phrase)),
			);
			if (canonical.length > 0) {
				effectiveText = `${probeText}\n${canonical.join("\n")}`;
				consumed = true;
			}
		}
		let gate = candidate.language.verdict;
		let gateQuote: string | undefined;
		let gateNote = candidate.language.note;
		for (const entry of record.languages ?? []) {
			if (!quoteVerified(probeText, entry.quote)) {
				continue;
			}
			if (!declared.has(entry.language.trim().toLowerCase())) {
				gate = "FAIL";
				gateQuote = entry.quote.trim();
				gateNote = `${entry.language.trim()} is required as a job condition but is not on the candidate's Languages table. Do not score or draft.`;
				consumed = true;
				break;
			}
		}
		let postedDate = candidate.postedDate;
		let deadline = candidate.deadline;
		const extractedPosted = parsePostingDay(record.postedDate, now);
		if (postedDate === null && extractedPosted !== null) {
			postedDate = extractedPosted;
			consumed = true;
		}
		const extractedDeadline = parsePostingDay(record.deadline, now);
		if (deadline === null && extractedDeadline !== null) {
			deadline = extractedDeadline;
			consumed = true;
		}
		if (!consumed) {
			continue;
		}
		const dims = scoreDimensions(effectiveText, input.profile);
		const score = overallScore(dims);
		const resolved = resolveBand(
			score,
			{ verdict: gate, note: gateQuote ?? gateNote },
			candidate.quickFit.lowEvidence,
			candidate.quickFit.textLength,
		);
		// resolveBand prefixes its own gate wording; for an extraction-found
		// FAIL pass the raw requirement note so the wording stays accurate.
		const languageNote =
			gate === "FAIL" && gateQuote
				? (candidate.quickFit.lowEvidence
						? `Language-gate override (LLM extraction): "${gateQuote}" — ${gateNote} (thin evidence: ${candidate.quickFit.textLength} chars)`
						: `Language-gate override (LLM extraction): "${gateQuote}" — ${gateNote}`)
				: gate === "FAIL"
					? resolved.languageNote
					: resolved.languageNote;
		const dateUnknown = postedDate === null && deadline === null;
		candidate.postedDate = postedDate;
		candidate.deadline = deadline;
		candidate.dateUnknown = dateUnknown;
		candidate.status = deadline && deadline < today ? "expired" : dateUnknown ? "unknown" : "active";
		candidate.quickFit = {
			score,
			band: resolved.band,
			strengths: extractStrengths(effectiveText, input.profile),
			gaps: extractGaps(effectiveText, input.profile),
			lowEvidence: candidate.quickFit.lowEvidence,
			textLength: candidate.quickFit.textLength,
			source: "llm-extraction",
		};
		candidate.language = { verdict: gate, note: languageNote };
		candidate.referralLinks =
			resolved.band === "high" || resolved.band === "medium" ? referralLinksFor(candidate.company) : [];
	}
}

export async function planSearch(input: SearchInput): Promise<SearchPlan> {
	const now = input.now ?? new Date();
	const today = now.toISOString().slice(0, 10);
	const filters = resolveSearchFilters(input.filters, input.profile);
	const queries: AutoQuery[] =
		filters.keywords !== ""
			? [{ category: "explicit", language: "-", query: filters.keywords }]
			: buildAutoQueries(input.profile);
	const notes: string[] = [];
	const errors: string[] = [];
	const sources: SearchSource[] = [];

	let raws: RawPosting[] = [];
	let source: SearchSource | null = null;
	const queriesRun: string[] = [];

	/**
	 * Active query set (issue 13): the explicit query, or each auto-query up
	 * to the per-run cap. First-match-wins silence is over: every source
	 * below runs the whole set, merges across queries, and reports queriesRun.
	 */
	const querySet = (filters.keywords !== "" ? [filters.keywords] : queries.map((q) => q.query)).slice(
		0,
		SEARCH_QUERY_CAP,
	);
	if (filters.keywords === "" && queries.length > SEARCH_QUERY_CAP) {
		notes.push(
			`Query coverage: running ${querySet.length} of ${queries.length} auto-queries (per-run cap ${SEARCH_QUERY_CAP}); re-run with explicit keywords for the rest.`,
		);
	}

	/** Merge helper: dedupes raw postings by normalized URL across queries. */
	function mergeRaws(lists: RawPosting[][]): RawPosting[] {
		const seen = new Map<string, RawPosting>();
		for (const list of lists) {
			for (const raw of list) {
				const key = (raw.url ?? "").split("#")[0].trim().toLowerCase();
				if (key !== "" && !seen.has(key)) {
					seen.set(key, raw);
				}
			}
		}
		return [...seen.values()];
	}

	if (input.portalResults) {
		raws = input.portalResults;
		source = "portal-live";
		sources.push(source);
		notes.push("Planned from caller-supplied portal output; no fetch ran server-side.");
	} else if (input.portal) {
		if (!filters.location) {
			errors.push("Portal search needs an explicit location (profile location is empty); no fetch ran.");
		} else {
			const collected: RawPosting[][] = [];
			for (const query of querySet) {
				const outcome = await runPortalWithBackoff(
					input.portal,
					{
						location: filters.location,
						query,
						jobAgeDays: SEARCH_RECENCY_DAYS,
						remoteMode: filters.remoteMode,
						page: 1,
						limit: filters.limit,
					},
					{ sleep: input.sleep },
				);
				for (const error of outcome.errors) {
					errors.push(`portal[${error.code}]: ${error.message}`);
				}
				notes.push(
					`Portal run for "${query}" walked ${outcome.pages} page(s) in ${outcome.attempts} attempt(s) with backoff on rate limits.`,
				);
				collected.push(outcome.jobs);
				queriesRun.push(query);
			}
			raws = mergeRaws(collected);
			source = "portal-live";
			sources.push(source);
		}
	} else if (input.boards && input.boards.length > 0) {
		const boardFetch = input.boardFetch ?? defaultFetch;
		const listings: RawPosting[] = [];
		for (const board of input.boards) {
			try {
				const jobs = await fetchBoardJobs(board, boardFetch);
				listings.push(...jobs);
			} catch (error) {
				errors.push(`Board ${board.provider}/${board.slug} failed (${String(error)}); no postings invented.`);
			}
		}
		// Board APIs list per company with no keyword search: the query set
		// filters client-side, merged across queries with dedupe by URL.
		const collected: RawPosting[][] =
			querySet.length > 0 ? querySet.map((query) => filterListingsByQuery(listings, query)) : [listings];
		for (const query of querySet) {
			queriesRun.push(query);
		}
		if (querySet.length === 0) {
			queriesRun.push("(all board listings; no query filter)");
		}
		raws = mergeRaws(collected);
		source = "board";
		sources.push(source);
		notes.push(
			`Board run over ${input.boards.length} board(s) with ${listings.length} listing(s); filtered by ${queriesRun.length} querie(s).`,
		);
	} else if (input.brightDataKey) {
		if (!input.brightDataFetch) {
			errors.push("BrightData key is configured but no fetcher was injected; no fetch ran.");
		} else {
			const collected: RawPosting[][] = [];
			for (const query of querySet) {
				try {
					collected.push(await input.brightDataFetch(query));
					queriesRun.push(query);
				} catch (error) {
					errors.push(`BrightData fetch failed for "${query}" (${String(error)}); no postings invented.`);
				}
			}
			raws = mergeRaws(collected);
			source = "brightdata";
			sources.push(source);
		}
	} else if (input.webFallbackFetch) {
		// Google-hacking expansion (issue 13): site:-scoped board/jobs pages,
		// quoted terms, OR groups, and an exact-phrase fallback over the
		// primary query — the cap keeps the run polite and visible.
		const base = filters.keywords || queries[0]?.query || "";
		const hacking = buildHackingQueries(base).slice(0, SEARCH_QUERY_CAP);
		const fallbackQueries = hacking.length > 0 ? hacking : [base];
		const collected: RawPosting[][] = [];
		for (const query of fallbackQueries) {
			try {
				collected.push(await input.webFallbackFetch(query));
				queriesRun.push(query);
			} catch (error) {
				errors.push(`Web fallback failed for "${query}" (${String(error)}); no postings invented.`);
			}
		}
		raws = mergeRaws(collected);
		source = "web-fallback";
		sources.push(source);
		notes.push("Web-search fallback results; verify each posting before evaluating.");
	} else {
		errors.push(
			"No search source available (no portal runner, board refs, BrightData key, or fallback); no postings invented.",
		);
	}

	const candidates: SearchCandidate[] = [];
	const probeTexts = new Map<string, string>();
	let staleCount = 0;
	for (const raw of raws) {
		const title = raw.title?.trim() || "Untitled role";
		const company = raw.company?.trim() || "Unknown company";
		const url = raw.url?.split("#")[0].trim() ?? "";
		let valid = true;
		try {
			const parsed = new URL(url);
			if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
				valid = false;
			}
		} catch {
			valid = false;
		}
		if (!valid) {
			errors.push(`Dropped an unresolvable posting URL for "${title}" at "${company}"; nothing invented.`);
			continue;
		}
		if (isPeopleSearchUrl(url)) {
			notes.push(`Skipped a people-search page for "${title}" at "${company}"; never scraped.`);
			continue;
		}
		const postedDate = parsePostingDay(raw.postedDate, now);
		const deadline = parsePostingDay(raw.deadline, now);
		if (postedDate && daysBetween(postedDate, today) > SEARCH_RECENCY_DAYS) {
			staleCount += 1;
			continue;
		}
		const dateUnknown = postedDate === null && deadline === null;
		const status: CandidateStatus =
			deadline && deadline < today ? "expired" : dateUnknown ? "unknown" : "active";
		const key = makeKey(company, title, url);
		if (!isCanonical(key)) {
			errors.push(`Dropped a posting with an unstable key for "${title}" at "${company}".`);
			continue;
		}
		const probeText = `${title}\n${company}\n${raw.description ?? ""}`;
		const textLength = probeText.length;
		const lowEvidence = textLength < THIN_EVIDENCE_THRESHOLD;
		const dims = scoreDimensions(probeText, input.profile);
		const score = overallScore(dims);
		const languageGate = checkLanguage(probeText, input.profile);
		const resolved = resolveBand(score, languageGate, lowEvidence, textLength);
		candidates.push({
			key,
			title,
			company,
			url,
			postedDate,
			deadline,
			dateUnknown,
			status,
			portal: raw.portal ?? "linkedin",
			source: source ?? "web-fallback",
			quickFit: {
				score,
				band: resolved.band,
				strengths: extractStrengths(probeText, input.profile),
				gaps: extractGaps(probeText, input.profile),
				lowEvidence,
				textLength,
				source: "heuristic",
			},
			language: { verdict: languageGate.verdict, note: resolved.languageNote },
			consolidationNote: null,
			referralLinks: resolved.band === "high" || resolved.band === "medium" ? referralLinksFor(company) : [],
			// Board results always carry real companies (issue 13); scraper
			// paths keep the placeholder and flag it for host verification.
			needsVerification: company === "Unknown company",
		});
		probeTexts.set(key, probeText);
	}

	await applyExtraction(candidates, probeTexts, input, now, today, notes);

	const consolidated: SearchCandidate[] = [];
	const groups = new Map<string, SearchCandidate[]>();
	for (const candidate of candidates) {
		const groupKey = `${candidate.title.toLowerCase()}||${candidate.company.toLowerCase()}`;
		const group = groups.get(groupKey);
		if (group) {
			group.push(candidate);
		} else {
			groups.set(groupKey, [candidate]);
		}
	}
	for (const group of groups.values()) {
		const [first, ...rest] = group;
		if (rest.length > 0) {
			first.consolidationNote =
				`Mass posting: ${group.length} identical listings consolidated; kept ${first.url}.`;
		}
		consolidated.push(first);
	}

	const deduped = dedupeCandidates(consolidated, input.seenKeys ?? [], input.appliedPairs ?? []);
	// Stable sort by score so the limit cap keeps the best matches (issue
	// 12). Thin-evidence items sort after solid ones at equal scores; the key
	// tiebreak keeps the order deterministic. Array sort is stable, so prior
	// portal order survives full ties.
	deduped.kept.sort(
		(a, b) =>
			b.quickFit.score - a.quickFit.score ||
			Number(a.quickFit.lowEvidence) - Number(b.quickFit.lowEvidence) ||
			a.key.localeCompare(b.key),
	);
	const kept = deduped.kept.slice(0, filters.limit);
	const unverified = kept.filter((candidate) => candidate.needsVerification).length;
	if (unverified > 0) {
		notes.push(
			`${unverified} candidate(s) carry an unknown employer; verify the company on the posting before evaluating.`,
		);
	}
	return {
		filters,
		queries,
		candidates: kept,
		staleCount,
		seenSkipped: deduped.seenSkipped,
		appliedSkipped: deduped.appliedSkipped,
		sources,
		queriesRun,
		notes,
		errors,
	};
}

/**
 * Server fetch paths. Both degrade honestly: any failure throws and the
 * planner records an error with zero candidates, never invented postings.
 * People-search URLs are filtered before any fetch, never scraped.
 */

const BRIGHTDATA_ENDPOINT = "https://api.brightdata.com/request";

/** Tolerant field lookup across BrightData result shapes. */
function pickField(item: Record<string, unknown>, names: string[]): string | undefined {
	for (const name of names) {
		const value = item[name];
		if (typeof value === "string" && value.trim() !== "") {
			return value.trim();
		}
	}
	return undefined;
}

/** BrightData scraper-API fetcher for LinkedIn job listings. Zone from env. */
export function createBrightDataFetcher(
	apiKey: string,
	zone: string,
	fetchImpl: FetchLike = defaultFetch,
): PostingFetcher {
	return async (query: string) => {
		const searchUrl =
			`https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search` +
			`?keywords=${encodeURIComponent(query)}`;
		const res = await fetchImpl(
			BRIGHTDATA_ENDPOINT,
			{
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			{ method: "POST", body: JSON.stringify({ zone, url: searchUrl, format: "json" }) },
		);
		if (res.status === 429 || res.status >= 500) {
			throw new Error(`BrightData rate-limited or unavailable (HTTP ${res.status})`);
		}
		if (res.status !== 200) {
			throw new Error(`BrightData request failed (HTTP ${res.status})`);
		}
		let items: unknown;
		try {
			items = JSON.parse(res.body);
		} catch {
			throw new Error("BrightData returned a non-JSON payload");
		}
		const list = Array.isArray(items) ? items : [items];
		const postings: RawPosting[] = [];
		for (const entry of list) {
			if (typeof entry !== "object" || entry === null) {
				continue;
			}
			const record = entry as Record<string, unknown>;
			const url = pickField(record, ["url", "link", "job_url", "apply_url"]);
			if (!url || isPeopleSearchUrl(url)) {
				continue;
			}
			postings.push({
				title: pickField(record, ["title", "job_title", "name"]) ?? "Untitled role",
				company: pickField(record, ["company", "company_name", "employer"]) ?? "Unknown company",
				url,
				description: pickField(record, ["description", "snippet", "job_description"]),
				postedDate: pickField(record, ["posted_date", "created_at", "date", "posted"]),
				deadline: pickField(record, ["deadline", "expiry", "expires_at"]),
				portal: "linkedin",
			});
		}
		return postings;
	};
}

/** Job-link extraction for the web-search fallback: drops people-search pages. */
export async function searchJobLinks(query: string, fetchImpl: FetchLike): Promise<string[]> {
	const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`site:linkedin.com/jobs ${query}`)}`;
	const res = await fetchImpl(searchUrl, { "User-Agent": "job-hunter-bot/1.0" });
	if (res.status !== 200) {
		throw new Error(`Web search failed (HTTP ${res.status})`);
	}
	const found: string[] = [];
	const pattern = /uddg=([^&"']+)/g;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(res.body)) !== null && found.length < 10) {
		try {
			const decoded = decodeURIComponent(match[1]);
			if (decoded.startsWith("http") && !isPeopleSearchUrl(decoded) && !found.includes(decoded)) {
				found.push(decoded);
			}
		} catch {
			continue;
		}
	}
	return found;
}

/**
 * Web-search fallback: links from a site-scoped search, one light fetch
 * each for title and description. Company stays "Unknown company" unless
 * the page states it, flagged for host verification before evaluating.
 */
export function createWebFallbackFetch(fetchImpl: FetchLike = defaultFetch): PostingFetcher {
	return async (query: string) => {
		const links = await searchJobLinks(query, fetchImpl);
		const postings: RawPosting[] = [];
		for (const link of links) {
			let res: { status: number; body: string };
			try {
				res = await fetchImpl(link, { "User-Agent": "job-hunter-bot/1.0" });
			} catch {
				continue;
			}
			if (res.status !== 200) {
				continue;
			}
			postings.push({
				title: extractTitle(res.body) || "Untitled role",
				company: "Unknown company",
				url: link,
				description: stripHtml(res.body).slice(0, 2000),
				portal: "linkedin",
			});
		}
		return postings;
	};
}
