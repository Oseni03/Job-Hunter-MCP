import type { Job, SearchQuery } from "./types.ts";

export function cleanText(value: unknown): string {
	return String(value ?? "")
		.replace(/\u00a0/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function firstNonEmpty(...values: unknown[]): string | undefined {
	for (const value of values) {
		const cleaned = cleanText(value);
		if (cleaned) return cleaned;
	}
	return undefined;
}

export function parseDate(value: unknown): Date | undefined {
	if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
	if (typeof value === "number") {
		const ms = value < 10_000_000_000 ? value * 1_000 : value;
		const date = new Date(ms);
		return Number.isNaN(date.getTime()) ? undefined : date;
	}
	if (typeof value !== "string" || !value.trim()) return undefined;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

export function absoluteUrl(href: string | undefined, base: string): string | undefined {
	if (!href?.trim()) return undefined;
	try {
		return new URL(href.trim(), base).toString();
	} catch {
		return undefined;
	}
}

export function normalizeUrl(url: string): string {
	try {
		const parsed = new URL(url);
		parsed.hash = "";
		for (const key of [...parsed.searchParams.keys()]) {
			if (/^(utm_|fbclid|gclid|gh_src)/i.test(key)) parsed.searchParams.delete(key);
		}
		if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, "");
		return parsed.toString();
	} catch {
		return url.trim().toLowerCase();
	}
}

export function makeId(source: string, externalId: string): string {
	return `${source}:${externalId}`;
}

export function keywordTokens(keywords: string): string[] {
	return keywords
		.toLowerCase()
		.split(/[,\s]+/)
		.map((token) => token.trim())
		.filter(Boolean);
}

export function locationQueryParts(location: string): string[] {
	return location
		.split(",")
		.map((part) => part.trim().toLowerCase())
		.filter(Boolean);
}

/**
 * Keyword tokens must ALL appear in the job text. Location matches on the
 * first (most specific, city-level) comma part, so "Berlin, Germany" matches
 * a job located in "Berlin" without requiring the full "City, Country"
 * string to appear verbatim. Date filters drop dated jobs older than the
 * cutoff; undated jobs are kept (flagged downstream as "date unknown").
 * remoteFilter=onsite drops explicitly-remote jobs; hybrid applies no
 * client-side workplace filter.
 */
export function jobMatchesQuery(job: Job, q: SearchQuery, now: Date = new Date()): boolean {
	const haystack = [job.title, job.company, job.location, job.description]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();

	const tokens = keywordTokens(q.keywords);
	const keywordMatch = tokens.length === 0 || tokens.every((token) => haystack.includes(token));

	const locationParts = locationQueryParts(q.location ?? "");
	const locationMatch =
		locationParts.length === 0 ||
		[job.location, job.description, job.title]
			.filter(Boolean)
			.join(" ")
			.toLowerCase()
			.includes(locationParts[0] as string);

	const remoteMatch =
		q.remoteFilter === "onsite"
			? job.remote !== true
			: q.remoteOnly || q.remoteFilter === "remote"
				? job.remote === true
				: true;

	const cutoff = dateCutoff(q, now);
	const dateMatch = !cutoff || !job.postedAt || job.postedAt.getTime() >= cutoff;
	return keywordMatch && locationMatch && remoteMatch && dateMatch;
}

export function dateCutoff(q: SearchQuery, now: Date = new Date()): number | undefined {
	if (q.postedWithinMinutes && q.postedWithinMinutes > 0) {
		return now.getTime() - q.postedWithinMinutes * 60_000;
	}
	if (q.postedWithinDays && q.postedWithinDays > 0) {
		return now.getTime() - q.postedWithinDays * 86_400_000;
	}
	return undefined;
}

export function applyQueryAndLimit(jobs: Job[], q: SearchQuery): Job[] {
	const filtered = jobs.filter((job) => jobMatchesQuery(job, q));
	return q.limit && q.limit > 0 ? filtered.slice(0, q.limit) : filtered;
}

export function sortNewestFirst(jobs: Job[]): Job[] {
	return [...jobs].sort((a, b) => {
		const aTime = a.postedAt?.getTime() ?? 0;
		const bTime = b.postedAt?.getTime() ?? 0;
		return bTime - aTime;
	});
}

export function dedupeJobs(jobs: Job[]): Job[] {
	const seenUrls = new Set<string>();
	const seenPair = new Set<string>();
	const out: Job[] = [];

	for (const job of jobs) {
		const normalized = normalizeUrl(job.url);
		const pair = `${job.title.toLowerCase()}|${job.company.toLowerCase()}`;
		if (seenUrls.has(normalized) || seenPair.has(pair)) continue;
		seenUrls.add(normalized);
		seenPair.add(pair);
		out.push(job);
	}

	return out;
}

export function parseRelativeDate(value: unknown, now = new Date()): Date | undefined {
	const text = cleanText(value).toLowerCase();
	if (!text) return undefined;

	const iso = parseDate(text);
	if (iso) return iso;

	const match = text.match(/(\d+)\s+(minute|minutes|hour|hours|day|days|week|weeks|month|months)\s+ago/);
	if (!match) return undefined;

	const amount = Number(match[1]);
	const unit = match[2];
	const msByUnit: Record<string, number> = {
		minute: 60_000,
		minutes: 60_000,
		hour: 3_600_000,
		hours: 3_600_000,
		day: 86_400_000,
		days: 86_400_000,
		week: 604_800_000,
		weeks: 604_800_000,
		month: 2_592_000_000,
		months: 2_592_000_000,
	};

	const unitMs = unit ? msByUnit[unit] : undefined;
	return unitMs ? new Date(now.getTime() - amount * unitMs) : undefined;
}

export function inferRemote(...values: unknown[]): boolean {
	const text = values.map(cleanText).join(" ").toLowerCase();
	return /\bremote\b|work from home|distributed|anywhere in the world|remote-first/.test(text);
}

/**
 * Split a "Role at Company" headline into its parts. Used for boards like
 * MyJobMag whose title element contains the whole headline and expose no
 * separate company element.
 */
export function splitHeadline(headline: string): { title: string; company?: string } {
	const text = cleanText(headline);
	const match = text.match(/^(.*?)\s+at\s+(.+)$/);
	if (!match?.[1]?.trim() || !match?.[2]?.trim()) return { title: text };
	return { title: match[1].trim(), company: match[2].trim() };
}

/**
 * HTML to plain text (block breaks, tag strip, entity decode). Canonical
 * implementation also used by lib/fetch-posting.ts stripHtml, so CLI and
 * MCP paths produce the same description shape.
 */
export function htmlToText(html: string): string {
	return String(html ?? "")
		.replace(/<script[\s\S]*?<\/script\s*>/gi, " ")
		.replace(/<style[\s\S]*?<\/style\s*>/gi, " ")
		.replace(/<noscript[\s\S]*?<\/noscript\s*>/gi, " ")
		.replace(/<svg[\s\S]*?<\/svg\s*>/gi, " ")
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/(p|div|h[1-6]|li|tr|ul|ol|table|section|article)>/gi, "\n")
		.replace(/<[^>]+>/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&nbsp;/g, " ")
		.replace(/[ \t]+/g, " ")
		.replace(/[ \t]*\n[ \t]*/g, "\n")
		.replace(/\n\s*\n+/g, "\n")
		.trim();
}

/** Greenhouse `content` arrives double entity-encoded: decode twice. */
export function decodeEntitiesTwice(value: string): string {
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
