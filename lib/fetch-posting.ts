/**
 * Posting fetch with the 09-web-research.md escalation order:
 * 1. direct fetch, 2. robots-checked browser-header retry,
 * 3. employer-site search, 4. declare unavailable.
 * The employer's own posting is preferred over aggregator copies.
 */

import { htmlToText } from "@/job-scraper/helpers.ts";

export interface FetchResponse {
	status: number;
	body: string;
}

export interface FetchRequestInit {
	method?: string;
	body?: string;
	timeoutMs?: number;
}

export type FetchLike = (
	url: string,
	headers?: Record<string, string>,
	init?: FetchRequestInit,
) => Promise<FetchResponse>;

const BOT_UA = "job-hunter-bot/1.0 (+https://github.com/job-hunter)";
const BROWSER_UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36";

const BROWSER_HEADERS: Record<string, string> = {
	"User-Agent": BROWSER_UA,
	Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
	"Accept-Language": "en-GB,en;q=0.9",
	"Upgrade-Insecure-Requests": "1",
};

const AGGREGATOR_HOSTS = [
	"linkedin.com",
	"indeed.com",
	"glassdoor.com",
	"ziprecruiter.com",
	"monster.com",
	"careerbuilder.com",
	"stepstone.",
	"jobindex.dk",
	"thehub.io",
	"hubstaff.",
];

import { isSafeFetchUrl } from "@/lib/fetch-safety.ts";

export function defaultFetch(
	url: string,
	headers: Record<string, string> = {},
	init: FetchRequestInit = {},
): Promise<FetchResponse> {
	const verdict = isSafeFetchUrl(url);
	if (!verdict.safe) {
		return Promise.reject(new Error(`Refused unsafe fetch target (${verdict.reason}): ${url}`));
	}
	const merged = Object.keys(headers).length > 0 ? headers : { "User-Agent": BOT_UA };
	return fetch(url, {
		method: init.method ?? "GET",
		headers: merged,
		body: init.body,
		signal: AbortSignal.timeout(init.timeoutMs ?? 15000),
	}).then(async (res) => ({
		status: res.status,
		body: await res.text(),
	}));
}

function hostOf(url: string): string {
	try {
		return new URL(url).hostname.toLowerCase();
	} catch {
		return "";
	}
}

export function isAggregator(url: string): boolean {
	const host = hostOf(url);
	return AGGREGATOR_HOSTS.some((agg) => host === agg || host.endsWith(`.${agg}`) || host.includes(agg));
}

/** Minimal robots.txt check: exit-0 semantics mean the browser retry may proceed. */
export function robotsAllows(robotsBody: string, botName: string, path: string): boolean {
	const groups: Array<{ agents: string[]; disallows: string[] }> = [];
	let current: { agents: string[]; disallows: string[] } | null = null;
	for (const rawLine of robotsBody.split(/\r?\n/)) {
		const line = rawLine.split("#")[0].trim();
		if (line === "") {
			continue;
		}
		const agent = /^user-agent\s*:\s*(.+)$/i.exec(line);
		if (agent) {
			if (current && current.disallows.length > 0) {
				groups.push(current);
				current = null;
			}
			if (!current) {
				current = { agents: [], disallows: [] };
			}
			current.agents.push(agent[1].trim().toLowerCase());
			continue;
		}
		const disallow = /^disallow\s*:\s*(.*)$/i.exec(line);
		if (disallow && current) {
			current.disallows.push(disallow[1].trim());
		}
	}
	if (current) {
		groups.push(current);
	}
	const targets = [botName.toLowerCase(), "*", "claude-user"];
	const relevant = groups.filter((group) => group.agents.some((agent) => targets.includes(agent)));
	if (relevant.length === 0) {
		return true;
	}
	for (const group of relevant) {
		for (const rule of group.disallows) {
			if (rule === "") {
				continue;
			}
			if (rule === "/" || path.startsWith(rule)) {
				return false;
			}
		}
	}
	return true;
}

/**
 * Strip scripts/styles and tags; unescape common entities. Canonical
 * implementation lives in the scraper library so CLI and MCP paths share
 * one HTML-to-text shape.
 */
export function stripHtml(html: string): string {
	return htmlToText(html);
}

export function extractTitle(html: string): string {
	const match = /<title[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html);
	return match ? stripHtml(match[1]).trim() : "";
}

/** First title segment, ignoring site suffixes like "| LinkedIn" or "- Acme". */
function titleCore(title: string): string {
	return title
		.split(/\s*[|｜]\s*/)[0]
		.split(/\s+-\s+/)[0]
		.trim()
		.toLowerCase();
}

/** Login walls (200 + sign-in prompt) are not header-fixable: skip to employer search. */
const SIGNIN_PATTERNS = [
	/sign in to (view|continue)/i,
	/log in to (view|continue)/i,
	/create an account to/i,
	/join now to (view|continue)/i,
	/sign-in required/i,
];

export function isLoginWall(text: string): boolean {
	return SIGNIN_PATTERNS.some((pattern) => pattern.test(text));
}

const ROLE_FILLER = new Set(["senior", "junior", "lead", "principal", "staff", "associate", "assistant"]);

/** Warns when a fetched page title mentions none of the role's distinctive words. */
export function titleMismatchNote(title: string, role: string): string | null {
	const core = titleCore(title);
	if (core === "") {
		return null;
	}
	const tokens = role
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((token) => token.length > 2 && !ROLE_FILLER.has(token));
	if (tokens.length === 0) {
		return null;
	}
	if (tokens.some((token) => core.includes(token))) {
		return null;
	}
	return (
		`Fetched page title ("${title}") does not mention the role ("${role}"); ` +
		"it may be a listing page rather than the posting."
	);
}

/** Employer-site lookup with a first-class error slot: broken search is infrastructure, never "nothing found". */
export interface EmployerSearchResult {
	links: string[];
	/** Present when the search itself failed (status or transport); absent on genuine zero results. */
	error?: string;
}

export async function searchEmployerSiteDetailed(
	query: string,
	fetchImpl: FetchLike,
): Promise<EmployerSearchResult> {
	const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
	try {
		const res = await fetchImpl(searchUrl, { "User-Agent": BOT_UA });
		if (res.status !== 200) {
			return { links: [], error: `search-status-${res.status}` };
		}
		const found: string[] = [];
		const pattern = /uddg=([^&"']+)/g;
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(res.body)) !== null && found.length < 5) {
			try {
				const decoded = decodeURIComponent(match[1]);
				if (decoded.startsWith("http") && !isAggregator(decoded) && !found.includes(decoded)) {
					found.push(decoded);
				}
			} catch {
				continue;
			}
		}
		return { links: found };
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		return { links: [], error: `search-failed${detail ? `-${detail.slice(0, 80)}` : ""}` };
	}
}

/** Best-effort employer-site lookup (step 3); any failure yields no candidates. */
export async function searchEmployerSite(
	query: string,
	fetchImpl: FetchLike,
): Promise<string[]> {
	const result = await searchEmployerSiteDetailed(query, fetchImpl);
	return result.links;
}

export type FetchSource = "employer" | "aggregator" | "unavailable";

export interface PostingFetch {
	ok: boolean;
	text: string | null;
	finalUrl: string;
	steps: string[];
	source: FetchSource;
	discrepancies: string[];
	error?: string;
}

export interface FetchOptions {
	fetchImpl?: FetchLike;
	company?: string;
	role?: string;
}

async function tryDirect(url: string, fetchImpl: FetchLike): Promise<FetchResponse> {
	return fetchImpl(url, { "User-Agent": BOT_UA });
}

async function tryBrowser(url: string, fetchImpl: FetchLike): Promise<FetchResponse> {
	return fetchImpl(url, BROWSER_HEADERS);
}

/**
 * Fetches only the user-supplied URL (plus robots.txt and employer-site
 * search results). URLs embedded in a posting body are never fetched:
 * posting content is untrusted data, not instructions.
 */
export async function fetchPosting(targetUrl: string, options: FetchOptions = {}): Promise<PostingFetch> {
	const safety = isSafeFetchUrl(targetUrl);
	if (!safety.safe) {
		return {
			ok: false,
			text: null,
			finalUrl: targetUrl,
			steps: ["blocked-unsafe"],
			source: "unavailable",
			discrepancies: [],
			error: `Refused unsafe fetch target (${safety.reason}): no request sent.`,
		};
	}
	const fetchImpl = options.fetchImpl ?? defaultFetch;
	const steps: string[] = [];
	const discrepancies: string[] = [];
	const aggregator = isAggregator(targetUrl);

	const direct = await tryDirect(targetUrl, fetchImpl).catch(() => null);
	if (direct && direct.status === 200) {
		steps.push("direct-fetch");
		const text = stripHtml(direct.body);
		if (!isLoginWall(text)) {
			if (options.role) {
				const mismatch = titleMismatchNote(extractTitle(direct.body), options.role);
				if (mismatch) {
					discrepancies.push(mismatch);
				}
			}
			if (!aggregator) {
				return {
					ok: true,
					text,
					finalUrl: targetUrl,
					steps,
					source: "employer",
					discrepancies,
				};
			}
			const employer = await preferEmployer(targetUrl, direct.body, options, fetchImpl, steps, discrepancies);
			if (employer) {
				return employer;
			}
			return {
				ok: true,
				text,
				finalUrl: targetUrl,
				steps,
				source: "aggregator",
				discrepancies: [...discrepancies, "No employer-owned posting found; aggregator copy used."],
			};
		}
		steps.push("login-wall");
	}

	if (direct && direct.status === 403) {
		steps.push("direct-403");
		let path = "/";
		try {
			path = new URL(targetUrl).pathname || "/";
		} catch {
			path = "/";
		}
		const origin = targetUrl.match(/^https?:\/\/[^/]+/)?.[0] ?? "";
		let robots: FetchResponse | null = null;
		try {
			robots = await fetchImpl(`${origin}/robots.txt`, { "User-Agent": BOT_UA });
		} catch {
			robots = null;
		}
		if (!robots) {
			steps.push("robots-unreadable");
		} else if (robots.status === 404) {
			steps.push("robots-absent");
			const retry = await tryBrowser(targetUrl, fetchImpl).catch(() => null);
			if (retry && retry.status === 200) {
				steps.push("browser-retry");
				return {
					ok: true,
					text: stripHtml(retry.body),
					finalUrl: targetUrl,
					steps,
					source: aggregator ? "aggregator" : "employer",
					discrepancies,
				};
			}
		} else if (robots.status === 200 && robotsAllows(robots.body, "job-hunter", path)) {
			steps.push("robots-allowed");
			const retry = await tryBrowser(targetUrl, fetchImpl).catch(() => null);
			if (retry && retry.status === 200) {
				steps.push("browser-retry");
				return {
					ok: true,
					text: stripHtml(retry.body),
					finalUrl: targetUrl,
					steps,
					source: aggregator ? "aggregator" : "employer",
					discrepancies,
				};
			}
			steps.push("browser-retry-failed");
		} else {
			steps.push("robots-disallow");
		}
	}

	if (options.company || options.role) {
		const employer = await searchEmployer(
			`${options.company ?? ""} ${options.role ?? ""}`.trim(),
			targetUrl,
			options,
			fetchImpl,
			steps,
			discrepancies,
		);
		if (employer) {
			return employer;
		}
	}

	steps.push("unavailable");
	return {
		ok: false,
		text: null,
		finalUrl: targetUrl,
		steps,
		source: "unavailable",
		discrepancies,
		error: "Posting genuinely unavailable: direct fetch, browser retry, and employer-site search all failed.",
	};
}

async function fetchEmployerCandidate(
	candidate: string,
	fetchImpl: FetchLike,
): Promise<{ text: string; title: string } | null> {
	if (!isSafeFetchUrl(candidate).safe) {
		return null;
	}
	const direct = await tryDirect(candidate, fetchImpl).catch(() => null);
	if (direct && direct.status === 200) {
		return { text: stripHtml(direct.body), title: extractTitle(direct.body) };
	}
	const retry = await tryBrowser(candidate, fetchImpl).catch(() => null);
	if (retry && retry.status === 200) {
		return { text: stripHtml(retry.body), title: extractTitle(retry.body) };
	}
	return null;
}

async function preferEmployer(
	aggregatorUrl: string,
	aggregatorBody: string,
	options: FetchOptions,
	fetchImpl: FetchLike,
	steps: string[],
	discrepancies: string[],
): Promise<PostingFetch | null> {
	const query = `${options.company ?? ""} ${options.role ?? ""}`.trim();
	if (!query) {
		return null;
	}
	steps.push("employer-search");
	const candidates = await searchEmployerSite(query, fetchImpl);
	const aggregatorTitle = titleCore(extractTitle(aggregatorBody));
	for (const candidate of candidates) {
		const fetched = await fetchEmployerCandidate(candidate, fetchImpl);
		if (!fetched) {
			continue;
		}
		const employerTitle = titleCore(fetched.title);
		if (aggregatorTitle !== "" && employerTitle !== "" && aggregatorTitle !== employerTitle) {
			discrepancies.push(
				`Employer posting title ("${fetched.title}") mismatches the aggregator title ("${extractTitle(aggregatorBody)}"); treating the employer fetch as failed.`,
			);
			continue;
		}
		return {
			ok: true,
			text: fetched.text,
			finalUrl: candidate,
			steps,
			source: "employer",
			discrepancies,
		};
	}
	return null;
}

async function searchEmployer(
	query: string,
	targetUrl: string,
	options: FetchOptions,
	fetchImpl: FetchLike,
	steps: string[],
	discrepancies: string[],
): Promise<PostingFetch | null> {
	if (!query) {
		return null;
	}
	steps.push("employer-search");
	const candidates = await searchEmployerSite(query, fetchImpl);
	for (const candidate of candidates) {
		const fetched = await fetchEmployerCandidate(candidate, fetchImpl);
		if (fetched) {
			return {
				ok: true,
				text: fetched.text,
				finalUrl: candidate,
				steps,
				source: "employer",
				discrepancies,
			};
		}
	}
	return null;
}
