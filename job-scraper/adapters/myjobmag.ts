import type { Adapter, Job } from "../types.ts";
import { get, sleep } from "../http.ts";
import { applyQueryAndLimit, cleanText, splitHeadline } from "../helpers.ts";
import { extractHtmlJobs, type HtmlAdapterConfig } from "../html.ts";

export const MYJOBMAG_SELECTORS = {
	card: "li.job-info, li.job-list, .job-list, article, [class*='job-card']",
	title: "h2, h3, .job-title, [class*='job-title']",
	company: ".company-name, [class*='company'], [class*='employer']",
	location: ".location, [class*='location']",
	description: ".job-desc, .job-description, [class*='description'], p",
	postedAt: "time, .job-date, [class*='date'], [class*='posted']",
} as const;

const config: HtmlAdapterConfig = {
  source: "myjobmag",
  baseUrl: "https://www.myjobmag.com",
  jobLinkSelector: "a[href^='/job/'], a[href^='/jobs/']",
  selectors: MYJOBMAG_SELECTORS,
  buildSearchUrl: (keywords, location, page) => {
    // Best-effort: ?q= is ignored server-side (verified: identical results
    // with and without it), so matching happens client-side.
    const params = new URLSearchParams();
    if (keywords.trim()) params.set("q", keywords.trim());
    if (location?.trim()) params.set("location", location.trim());
    if (page > 1) params.set("currentpage", String(page));
    const query = params.toString();
    return `https://www.myjobmag.com/jobs${query ? `?${query}` : ""}`;
  },
  maxPages: 5,
};

export const myjobmag: Adapter = {
	name: "myjobmag",
	async search(q) {
		const out: Job[] = [];
		for (let page = 1; page <= config.maxPages; page += 1) {
			if (page > 1) await sleep(1_500);
			const html = await get(config.buildSearchUrl(q.keywords, q.location, page));
			const jobs = extractHtmlJobs(html, config).map(repairHeadline);
			if (jobs.length === 0) break;
			out.push(...jobs);
			if (q.limit && out.length >= q.limit) break;
		}
		return applyQueryAndLimit(out, q);
	},
};

/**
 * MyJobMag puts the whole "Role at Company" headline in the title element and
 * exposes no separate company element, so extraction either copies the
 * headline into company or falls back to a page-text blob. Re-split the
 * headline in those cases.
 */
export function repairHeadline(job: Job): Job {
	const split = splitHeadline(job.title);
	if (!split.company) return job;
	if (job.company.length > 120 || cleanText(job.company) === cleanText(job.title)) {
		return { ...job, title: split.title, company: split.company };
	}
	return job;
}
