import {
	adapters as scraperRegistry,
	searchAll as searchScrapers,
} from "@/host/job-hunter/scraper/index.ts";
import type { Job as ScrapedJob, SearchQuery as ScraperQuery } from "@/host/job-hunter/scraper/index.ts";
import { resolveSiteCountry, summarizeScrapeMeta } from "@/host/job-hunter/scraper/adapters/tsjobspy.ts";
import type { ScrapeMeta } from "ts-jobspy";
import { decodeCursor, encodeCursor } from "@/lib/cursor.ts";
import {
	checkLanguage,
	extractGaps,
	extractStrengths,
	overallScore,
	parsePostingDay,
	scoreDimensions,
} from "@/lib/job-hunter/evaluate.ts";
import { isCanonical, makeKey } from "@/lib/job-key.ts";
import type { Profile } from "@/lib/job-hunter/profile.ts";

/**
 * Job discovery planner (ticket 05). Pure planning over caller-held or
 * injected-fetcher results: the server never invents postings, and the
 * host owns every write (seen store, tracker, portal CLI runs).
 */

export const SEARCH_LIMIT_MAX = 20;
export const SEARCH_LIMIT_DEFAULT = 10;
export const SEARCH_RECENCY_DAYS = 14;

export type RemoteMode = "remote" | "hybrid" | "onsite";
export type SearchSource = "portal-live" | "scraper";
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
	/** Keyword query text for the portal or scraper search. */
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
	/**
	 * Local scraper adapters to run (registry names from the sources
	 * command, or "all"). Undefined or empty means the scraper stage is
	 * off (no live fetch).
	 */
	scraperAdapters?: string[];
	/** Injected scraper fetcher; defaults to the live job-scraper library. */
	scraperFetch?: PostingFetcher;
	sleep?: Sleeper;
	/**
	 * Opaque resume token from a previous page (issue 14). The server holds
	 * no state: the cursor is an offset into the relevance-ordered list and
	 * the caller holds everything else.
	 */
	cursor?: string;
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
	/** Opaque resume token when candidates remain past this page; null when exhausted (issue 14). */
	nextCursor: string | null;
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
	} else if (input.scraperAdapters && input.scraperAdapters.length > 0) {
		// Local scrapers (no key, host network): every query in the set runs
		// with the plan's location, workplace filter, recency window, and
		// limit, merged across queries with dedupe by URL. Site clients
		// report per-call meta through the collector below; a throwing
		// fetch degrades per query into errors[] with zero inventions.
		const siteMetas: ScrapeMeta[] = [];
		const scraperFetch =
			input.scraperFetch ??
			createScraperFetcher(
				{
					location: filters.location,
					remoteMode: filters.remoteMode,
					limit: filters.limit,
					adapters: input.scraperAdapters,
					country: resolveSiteCountry(input.profile.workCountry),
				},
				undefined,
				(meta) => {
					siteMetas.push(meta);
				},
			);
		const collected: RawPosting[][] = [];
		for (const query of querySet) {
			try {
				collected.push(await scraperFetch(query));
				queriesRun.push(query);
			} catch (error) {
				errors.push(`Scraper fetch failed for "${query}" (${String(error)}); no postings invented.`);
			}
		}
		raws = mergeRaws(collected);
		source = "scraper";
		sources.push(source);
		notes.push(`Scraper run over ${input.scraperAdapters.join(", ")}; merged across ${queriesRun.length} querie(s).`);
		for (const meta of siteMetas) {
			const summary = summarizeScrapeMeta(meta);
			notes.push(...summary.notes);
			errors.push(...summary.errors);
		}
	} else {
		errors.push(
			"No search source available (no portal runner, portal results, or scraper adapters); no postings invented.",
		);
	}

	const candidates: SearchCandidate[] = [];
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
			// Raws is empty unless a stage ran and recorded its source, so
			// this default is unreachable; it exists only for the type.
			source: source ?? "portal-live",
			quickFit: {
				score,
				band: resolved.band,
				strengths: extractStrengths(probeText, input.profile),
				gaps: extractGaps(probeText, input.profile),
				lowEvidence,
				textLength,
			},
			language: { verdict: languageGate.verdict, note: resolved.languageNote },
			consolidationNote: null,
			referralLinks: resolved.band === "high" || resolved.band === "medium" ? referralLinksFor(company) : [],
			// Unknown employers stay flagged for host verification before evaluating.
			needsVerification: company === "Unknown company",
		});
	}

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
	// Paged response over the relevance-ordered list (issue 14): the limit
	// doubles as the page size and the opaque cursor is the resume offset.
	let offset = 0;
	if (input.cursor !== undefined) {
		const decoded = decodeCursor(input.cursor);
		if (decoded === null) {
			notes.push("Unparseable page cursor ignored; restarted at offset zero (correctness first).");
		} else {
			offset = decoded;
		}
	}
	const page = deduped.kept.slice(offset, offset + filters.limit);
	const nextCursor = offset + filters.limit < deduped.kept.length ? encodeCursor(offset + filters.limit) : null;
	const unverified = page.filter((candidate) => candidate.needsVerification).length;
	if (unverified > 0) {
		notes.push(
			`${unverified} candidate(s) carry an unknown employer; verify the company on the posting before evaluating.`,
		);
	}
	return {
		filters,
		queries,
		candidates: page,
		staleCount,
		seenSkipped: deduped.seenSkipped,
		appliedSkipped: deduped.appliedSkipped,
		sources,
		queriesRun,
		nextCursor,
		notes,
		errors,
	};
}

/**
 * Local scraper runner over the job-scraper library (no key, host network).
 * "all" fans out to every registered adapter; otherwise the named adapters
 * run (unknown names throw, recorded per query). Kept injectable so unit
 * tests never touch the network.
 */
export type ScraperRunner = (query: ScraperQuery) => Promise<ScrapedJob[]>;

function defaultScraperRunner(adapterNames: string[]): ScraperRunner {
	return (query) => {
		if (adapterNames.includes("all")) {
			return searchScrapers(query);
		}
		const resolved = adapterNames.map((name) => {
			const found = scraperRegistry.find((candidate) => candidate.name === name);
			if (!found) {
				const known = scraperRegistry.map((candidate) => candidate.name).join(", ");
				throw new Error(`Unknown scraper adapter '${name}'. Registered: ${known}`);
			}
			return found;
		});
		return searchScrapers(query, { adapters: resolved });
	};
}

export interface ScraperFetchOptions {
	location: string;
	remoteMode?: RemoteMode;
	limit: number;
	adapters: string[];
	/** ts-jobspy country override; absent falls back inside the Site client. */
	country?: string;
}

/**
 * PostingFetcher over local scrapers: each query runs with the plan's
 * location, workplace filter, 14-day recency window, and limit. Scraped jobs
 * map to raw postings with the adapter name as portal and ISO dates cut to
 * YYYY-MM-DD for parsePostingDay downstream. Site clients report per-call
 * meta through onSiteMeta when the caller collects it; legacy adapters
 * ignore the collector. Dedupe stays caller-owned upstream.
 */
export function createScraperFetcher(
	options: ScraperFetchOptions,
	run: ScraperRunner = defaultScraperRunner(options.adapters),
	onSiteMeta?: (meta: ScrapeMeta) => void,
): PostingFetcher {
	return async (query: string) => {
		const jobs = await run({
			keywords: query,
			location: options.location,
			remoteFilter: options.remoteMode,
			postedWithinDays: SEARCH_RECENCY_DAYS,
			limit: options.limit,
			...(options.country !== undefined ? { country: options.country } : {}),
			...(onSiteMeta !== undefined ? { metaSink: (meta: ScrapeMeta) => onSiteMeta(meta) } : {}),
		});
		return jobs.map((job) => ({
			title: job.title,
			company: job.company,
			url: job.url,
			description: job.description,
			postedDate: job.postedAt ? job.postedAt.toISOString().slice(0, 10) : undefined,
			portal: job.source,
		}));
	};
}
