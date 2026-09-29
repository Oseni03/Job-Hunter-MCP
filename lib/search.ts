import {
	checkLanguage,
	extractGaps,
	extractStrengths,
	overallScore,
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
export type SearchSource = "portal-live" | "brightdata" | "web-fallback";
export type FitBand = "high" | "medium" | "low";
export type CandidateStatus = "active" | "expired" | "unknown";

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

/** Low-volume backoff: retries a rate-limited portal run with exponential waits. */
export async function runPortalWithBackoff(
	runner: PortalRunner,
	args: PortalArgs,
	options: { maxRetries?: number; sleep?: Sleeper } = {},
): Promise<{ jobs: RawPosting[]; errors: PortalError[]; attempts: number }> {
	const maxRetries = options.maxRetries ?? 2;
	const sleep = options.sleep ?? realSleep;
	const errors: PortalError[] = [];
	let attempts = 0;
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		attempts = attempt + 1;
		const result = await runner({ ...args, page: attempt + 1 });
		errors.push(...result.errors);
		if (!result.rateLimited) {
			return { jobs: result.jobs, errors, attempts };
		}
		if (attempt < maxRetries) {
			await sleep(1000 * 2 ** attempt);
		}
	}
	return { jobs: [], errors, attempts };
}

export interface QuickFit {
	score: number;
	band: FitBand;
	strengths: string[];
	gaps: string[];
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
	brightDataKey?: string;
	brightDataFetch?: PostingFetcher;
	webFallbackFetch?: PostingFetcher;
	sleep?: Sleeper;
}

export interface SearchPlan {
	filters: ResolvedFilters;
	queries: AutoQuery[];
	candidates: SearchCandidate[];
	staleCount: number;
	seenSkipped: number;
	appliedSkipped: number;
	sources: SearchSource[];
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

/** YYYY-MM-DD or ISO date to a day string; anything else is unknown, never guessed. */
function parseDay(value: string | undefined): string | null {
	if (!value) {
		return null;
	}
	const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
	if (!match) {
		return null;
	}
	const day = match[1];
	return Number.isNaN(new Date(`${day}T00:00:00Z`).getTime()) ? null : day;
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

export async function planSearch(input: SearchInput): Promise<SearchPlan> {	const now = input.now ?? new Date();
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

	if (input.portalResults) {
		raws = input.portalResults;
		source = "portal-live";
		sources.push(source);
		notes.push("Planned from caller-supplied portal output; no fetch ran server-side.");
	} else if (input.portal) {
		if (!filters.location) {
			errors.push("Portal search needs an explicit location (profile location is empty); no fetch ran.");
		} else {
			const query = filters.keywords || queries[0]?.query || "";
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
			notes.push(`Portal run finished after ${outcome.attempts} attempt(s) with backoff on rate limits.`);
			raws = outcome.jobs;
			source = "portal-live";
			sources.push(source);
		}
	} else if (input.brightDataKey) {
		if (!input.brightDataFetch) {
			errors.push("BrightData key is configured but no fetcher was injected; no fetch ran.");
		} else {
			const query = filters.keywords || queries[0]?.query || "";
			try {
				raws = await input.brightDataFetch(query);
				source = "brightdata";
				sources.push(source);
			} catch (error) {
				errors.push(`BrightData fetch failed (${String(error)}); no postings invented.`);
			}
		}
	} else if (input.webFallbackFetch) {
		const query = filters.keywords || queries[0]?.query || "";
		try {
			raws = await input.webFallbackFetch(query);
			source = "web-fallback";
			sources.push(source);
			notes.push("Web-search fallback results; verify each posting before evaluating.");
		} catch (error) {
			errors.push(`Web fallback failed (${String(error)}); no postings invented.`);
		}
	} else {
		errors.push(
			"No search source available (no portal runner, BrightData key, or fallback); no postings invented.",
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
		const postedDate = parseDay(raw.postedDate);
		const deadline = parseDay(raw.deadline);
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
		const dims = scoreDimensions(probeText, input.profile);
		const score = overallScore(dims);
		let band = bandFor(score);
		const languageGate = checkLanguage(probeText, input.profile);
		let languageNote = languageGate.note;
		if (languageGate.verdict === "FAIL") {
			band = "low";
			languageNote = `Language-gate override: ${languageGate.note}`;
		} else if (languageGate.verdict === "FLAG") {
			languageNote = `Language-gate flag: ${languageGate.note}`;
		}
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
				band,
				strengths: extractStrengths(probeText, input.profile),
				gaps: extractGaps(probeText, input.profile),
			},
			language: { verdict: languageGate.verdict, note: languageNote },
			consolidationNote: null,
			referralLinks: band === "low" ? [] : referralLinksFor(company),
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
	return {
		filters,
		queries,
		candidates: deduped.kept.slice(0, filters.limit),
		staleCount,
		seenSkipped: deduped.seenSkipped,
		appliedSkipped: deduped.appliedSkipped,
		sources,
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
