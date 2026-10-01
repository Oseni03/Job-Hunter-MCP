import { phraseMatches } from "@/lib/evaluate.ts";
import { defaultFetch, stripHtml } from "@/lib/fetch-posting.ts";
import type { FetchLike } from "@/lib/fetch-posting.ts";
import type { RawPosting } from "@/lib/search.ts";

/**
 * Structured job-board sources (ticket 13). Public board JSON replaces
 * scraping as the primary discovery path: Greenhouse, Lever, and Ashby all
 * answer without keys (see the spike note at
 * .scratch/job-hunter-mcp/issues/13-spike-board-sources.md). Board APIs are
 * per-company listings with no keyword search and no directory, so the
 * caller supplies board refs and the query set filters client-side.
 */

export type BoardProvider = "greenhouse" | "lever" | "ashby";

export interface BoardRef {
	provider: BoardProvider;
	/** Board slug: Greenhouse board token, Lever org, or Ashby board name. */
	slug: string;
	/** Caller-supplied company label (Lever/Ashby payloads carry no company). */
	company: string;
}

function boardUrl(ref: BoardRef): string {
	if (ref.provider === "greenhouse") {
		return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(ref.slug)}/jobs?content=true`;
	}
	if (ref.provider === "lever") {
		return `https://api.lever.co/v0/postings/${encodeURIComponent(ref.slug)}?mode=json`;
	}
	return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(ref.slug)}`;
}

/** Greenhouse `content` arrives double entity-encoded: decode twice. */
function decodeEntitiesTwice(value: string): string {
	const once = (text: string): string =>
		text
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, '"')
			.replace(/&#39;|&apos;/g, "'")
			.replace(/&nbsp;/g, " ");
	return once(once(value));
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** Greenhouse job → RawPosting. Null when no resolvable URL (never invented). */
export function mapGreenhouseJob(item: unknown, ref: BoardRef): RawPosting | null {
	const record = asRecord(item);
	if (!record) {
		return null;
	}
	const url = asString(record["absolute_url"]);
	if (!url) {
		return null;
	}
	const content = asString(record["content"]);
	return {
		title: asString(record["title"]) ?? "Untitled role",
		company: asString(record["company_name"]) ?? ref.company,
		url,
		description: content ? stripHtml(decodeEntitiesTwice(content)).slice(0, 2000) : undefined,
		postedDate: asString(record["first_published"]) ?? asString(record["updated_at"]),
		portal: "greenhouse",
	};
}

/** Lever posting → RawPosting. Company comes from the caller ref (payload carries none). */
export function mapLeverPosting(item: unknown, ref: BoardRef): RawPosting | null {
	const record = asRecord(item);
	if (!record) {
		return null;
	}
	const url = asString(record["hostedUrl"]);
	if (!url) {
		return null;
	}
	let postedDate = asString(record["createdAt"]);
	const createdAt = record["createdAt"];
	if (postedDate === undefined && typeof createdAt === "number" && Number.isFinite(createdAt)) {
		postedDate = new Date(createdAt).toISOString().slice(0, 10);
	}
	return {
		title: asString(record["text"]) ?? "Untitled role",
		company: ref.company,
		url,
		description:
			asString(record["descriptionPlain"]) ?? asString(record["descriptionBodyPlain"]) ?? undefined,
		postedDate,
		portal: "lever",
	};
}

/** Ashby job → RawPosting. Company comes from the caller ref (payload carries none). */
export function mapAshbyJob(item: unknown, ref: BoardRef): RawPosting | null {
	const record = asRecord(item);
	if (!record) {
		return null;
	}
	const url = asString(record["jobUrl"]);
	if (!url) {
		return null;
	}
	return {
		title: asString(record["title"]) ?? "Untitled role",
		company: ref.company,
		url,
		description: asString(record["descriptionPlain"]) ?? undefined,
		postedDate: asString(record["publishedAt"]),
		portal: "ashby",
	};
}

/**
 * Fetches one board's listings. Throws on transport errors and non-200s so
 * the planner degrades per-source into errors[] with zero invented postings.
 */
export async function fetchBoardJobs(ref: BoardRef, fetchImpl: FetchLike = defaultFetch): Promise<RawPosting[]> {
	const res = await fetchImpl(boardUrl(ref), { "User-Agent": "job-hunter-bot/1.0" });
	if (res.status !== 200) {
		throw new Error(`${ref.provider} board "${ref.slug}" answered HTTP ${res.status}`);
	}
	let payload: unknown;
	try {
		payload = JSON.parse(res.body);
	} catch {
		throw new Error(`${ref.provider} board "${ref.slug}" returned a non-JSON payload`);
	}
	const jobs = Array.isArray(payload) ? payload : asRecord(payload)?.["jobs"];
	if (!Array.isArray(jobs)) {
		throw new Error(`${ref.provider} board "${ref.slug}" returned an unexpected shape`);
	}
	const map = ref.provider === "greenhouse" ? mapGreenhouseJob : ref.provider === "lever" ? mapLeverPosting : mapAshbyJob;
	const postings: RawPosting[] = [];
	for (const job of jobs) {
		const posting = map(job, ref);
		if (posting) {
			postings.push(posting);
		}
	}
	return postings;
}

/**
 * Client-side query filter for board listings (boards have no keyword
 * search): every query token of length >= 2 must match the title and
 * description on word boundaries. Empty queries keep everything.
 */
export function filterListingsByQuery(listings: RawPosting[], query: string): RawPosting[] {
	const tokens = query.split(/\s+/).filter((token) => token.replace(/[^a-z0-9+#]/gi, "").length >= 2);
	if (tokens.length === 0) {
		return [...listings];
	}
	return listings.filter((listing) => {
		const haystack = `${listing.title}\n${listing.description ?? ""}`;
		return tokens.every((token) => phraseMatches(haystack, token.replace(/^"|"$/g, "")));
	});
}

/**
 * Google-hacking query construction for the web-search fallback (issue 13,
 * per user direction): site:-scoped board and jobs pages, quoted terms, and
 * OR groups, plus an exact-phrase fallback. Operators the scraper host can
 * paste into any search engine when the structured boards miss.
 */
export function buildHackingQueries(keywords: string): string[] {
	const tokens = keywords.split(/\s+/).filter((token) => token.length > 0);
	if (tokens.length === 0) {
		return [];
	}
	const quoted = tokens.map((token) => `"${token}"`);
	return [
		`site:boards.greenhouse.io ${quoted.join(" ")}`,
		`site:jobs.lever.co (${quoted.join(" OR ")})`,
		`site:linkedin.com/jobs ${quoted.join(" ")}`,
		`"${keywords.trim()}" jobs hiring`,
	];
}
