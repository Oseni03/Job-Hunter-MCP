import * as cheerio from "cheerio";
import type { Adapter, Job, JobDetail } from "../types.ts";
import { get } from "../http.ts";
import { SEARCH_CACHE_TTL_MS, DETAIL_CACHE_TTL_MS } from "../cache.ts";
import { applyQueryAndLimit, cleanText, firstNonEmpty, inferRemote, makeId, parseDate } from "../helpers.ts";

// LinkedIn's guest endpoints need a browser User-Agent; the generic toolkit
// UA gets challenged. Keep volume low: automated access is against
// LinkedIn's ToS (personal use only).
const LINKEDIN_UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const LINKEDIN_HEADERS = {
	"User-Agent": LINKEDIN_UA,
	Accept: "text/html,*/*",
	"Accept-Language": "en-US,en;q=0.9",
};

const WORKPLACE_PARAM: Record<string, string> = {
	onsite: "1",
	remote: "2",
	hybrid: "3",
};

/**
 * Accept a numeric posting id, a jobs/view URL, or a urn:li:jobPosting: URN.
 * Returns the numeric id, or undefined when the input holds no long digit run.
 */
export function parseLinkedInJobId(input: string): string | undefined {
	const candidates = input.match(/\d+/g) ?? [];
	const long = candidates.filter((digits) => digits.length >= 8);
	if (long.length > 0) return long[0];
	const urn = input.match(/jobPosting:(\d+)/);
	return urn?.[1];
}

export function linkedInCanonicalUrl(id: string): string {
	return `https://www.linkedin.com/jobs/view/${id}/`;
}

function buildSearchUrl(keywords: string, location: string | undefined, page: number, q: Parameters<typeof applyQueryAndLimit>[1]): string {
	const params = new URLSearchParams();
	if (keywords.trim()) params.set("keywords", keywords.trim());
	if (location?.trim()) params.set("location", location.trim());
	params.set("start", String(Math.max(0, (page - 1) * 10)));

	const seconds = q.postedWithinMinutes && q.postedWithinMinutes > 0
		? Math.round(q.postedWithinMinutes * 60)
		: q.postedWithinDays && q.postedWithinDays > 0
			? Math.round(q.postedWithinDays * 86_400)
			: 0;
	if (seconds > 0) params.set("f_TPR", `r${seconds}`);

	const workplace = q.remoteFilter ? WORKPLACE_PARAM[q.remoteFilter] : undefined;
	if (q.remoteOnly && !workplace) params.set("f_WT", "2");
	if (workplace) params.set("f_WT", workplace);

	return `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${params.toString()}`;
}

export function parseLinkedInSearch(html: string): Job[] {
	const $ = cheerio.load(html);
	const jobs: Job[] = [];

	$(".base-card[data-entity-urn]").each((_index: number, element: any) => {
		const card = $(element);
		const urn = card.attr("data-entity-urn") ?? "";
		const id = parseLinkedInJobId(urn);
		if (!id) return;

		const title = cleanText(card.find(".base-search-card__title").first().text());
		const company = cleanText(card.find(".base-search-card__subtitle").first().text());
		if (!title || !company) return;

		const location = firstNonEmpty(card.find(".job-search-card__location").first().text());
		const postedAt = parseDate(card.find("time.job-search-card__listdate").first().attr("datetime"));
		const url = linkedInCanonicalUrl(id);
		jobs.push({
			id: makeId("linkedin", id),
			source: "linkedin",
			title,
			company,
			...(location ? { location: cleanText(location) } : {}),
			remote: inferRemote(location, title),
			url,
			...(postedAt ? { postedAt } : {}),
		});
	});

	return jobs;
}

export async function fetchLinkedInDetail(id: string): Promise<JobDetail> {
	const html = await get(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${encodeURIComponent(id)}`, {
		headers: LINKEDIN_HEADERS,
		cacheTtlMs: DETAIL_CACHE_TTL_MS,
	});
	const $ = cheerio.load(html);

	const title = firstNonEmpty(
		$(".top-card-layout__title").first().text(),
		$("h2.top-card-layout__title").first().text(),
		$("h1").first().text(),
	) ?? `LinkedIn job ${id}`;
	const company = firstNonEmpty(
		$(".topcard__org-name-link").first().text(),
		$("[data-tracking-control-name='public_jobs_topcard-org-name']").first().text(),
	) ?? "Unknown company";
	const location = firstNonEmpty(
		$(".topcard__flavor--bullet").first().text(),
		$(".top-card-layout__location").first().text(),
	);
	const description = cleanText($(".description__text").first().text());

	const criteria: Record<string, string> = {};
	$(".description__job-criteria-item").each((_index: number, element: any) => {
		const item = $(element);
		const key = cleanText(item.find(".description__job-criteria-subheader").first().text());
		const value = cleanText(item.find(".description__job-criteria-text").first().text());
		if (key && value) criteria[key] = value;
	});

	const industries = criteria["Industries"]?.split(",").map((part) => part.trim()).filter(Boolean);

	return {
		id: makeId("linkedin", id),
		source: "linkedin",
		title: cleanText(title),
		company: cleanText(company),
		...(location ? { location: cleanText(location) } : {}),
		url: linkedInCanonicalUrl(id),
		description,
		...(criteria["Seniority level"] ? { seniority: criteria["Seniority level"] } : {}),
		...(criteria["Employment type"] ? { employmentType: criteria["Employment type"] } : {}),
		...(criteria["Job function"] ? { jobFunction: criteria["Job function"] } : {}),
		...(industries?.length ? { industries } : {}),
	};
}

export const linkedin: Adapter = {
	name: "linkedin",
	async search(q) {
		const page = q.page && q.page > 0 ? Math.floor(q.page) : 1;
		const html = await get(buildSearchUrl(q.keywords, q.location, page, q), {
			headers: LINKEDIN_HEADERS,
			cacheTtlMs: SEARCH_CACHE_TTL_MS,
		});
		const jobs = parseLinkedInSearch(html);
		// Workplace and recency are enforced server-side (f_WT/f_TPR).
		// Re-checking them client-side would drop server-matched jobs whose
		// card text lacks explicit markers. Keywords and location still
		// filter client-side for precision.
		return applyQueryAndLimit(jobs, {
			...q,
			remoteOnly: false,
			remoteFilter: undefined,
			postedWithinDays: undefined,
			postedWithinMinutes: undefined,
		});
	},
};
