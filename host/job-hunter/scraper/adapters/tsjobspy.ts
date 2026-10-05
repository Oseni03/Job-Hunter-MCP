import { scrapeJobs } from "ts-jobspy";
import type { Job as TsJob, ScrapeOptions, ScrapeResult, SiteName } from "ts-jobspy";

import type { Adapter, Job, SearchQuery } from "../types.ts";
import { applyQueryAndLimit, cleanText, firstNonEmpty, inferRemote, makeId, parseDate } from "../helpers.ts";

/**
 * ts-jobspy Site client (tickets 01-02: Indeed + LinkedIn).
 * Country derivation from the profile lands in ticket 03; until then
 * the Indeed default ('usa') applies explicitly (LinkedIn ignores it
 * server-side and searches globally by location).
 */

export const TSJOBSPY_RECENCY_HOURS = 14 * 24;

export type ScrapeRunner = (options: ScrapeOptions) => Promise<ScrapeResult>;

/** Plan filters -> ts-jobspy options for one Site. resultsWanted honors the total cap per Site. */
export function buildScrapeOptions(q: SearchQuery, site: SiteName = "indeed"): ScrapeOptions {
	const isRemote =
		q.remoteFilter === "remote" || q.remoteOnly ? true : q.remoteFilter === "onsite" ? false : undefined;
	return {
		sites: [site],
		...(q.keywords.trim() ? { searchTerm: q.keywords.trim() } : {}),
		...(q.location?.trim() ? { location: q.location.trim() } : {}),
		...(isRemote !== undefined ? { isRemote } : {}),
		resultsWanted: q.limit && q.limit > 0 ? Math.floor(q.limit) : 15,
		hoursOld: TSJOBSPY_RECENCY_HOURS,
		country: "usa",
		descriptionFormat: "plain",
		dedupe: "none",
		strict: false,
		...(site === "linkedin" ? { linkedin: { fetchDescription: false } } : {}),
	};
}

/** ts-jobspy Job -> scraper Job. The payload's site drives source/id. Nulls fall back honestly. */
export function mapTsJobToScraperJob(tsJob: TsJob): Job {
	const title = cleanText(tsJob.title);
	const company = cleanText(tsJob.company ?? "") || "Unknown company";
	const url = tsJob.jobUrlDirect ?? tsJob.jobUrl;
	const location = firstNonEmpty(tsJob.location);
	const description = firstNonEmpty(tsJob.description);
	const postedAt = parseDate(tsJob.datePosted);
	const externalId = firstNonEmpty(tsJob.id, url) ?? url;
	return {
		id: makeId(tsJob.site, externalId),
		source: tsJob.site,
		title,
		company,
		...(location ? { location } : {}),
		remote: tsJob.isRemote ?? inferRemote(location, title),
		url,
		...(description ? { description } : {}),
		...(postedAt ? { postedAt } : {}),
	};
}

export function createSiteAdapter(site: SiteName, runScrape: ScrapeRunner = scrapeJobs): Adapter {
	return {
		name: site,
		async search(q) {
			const result = await runScrape(buildScrapeOptions(q, site));
			const jobs = result.jobs.map(mapTsJobToScraperJob);
			return applyQueryAndLimit(jobs, q);
		},
	};
}

/** Ticket-01 seam: kept so existing Indeed callers are unchanged. */
export function createIndeedAdapter(runScrape: ScrapeRunner = scrapeJobs): Adapter {
	return createSiteAdapter("indeed", runScrape);
}

export const indeed = createIndeedAdapter();
export const linkedin = createSiteAdapter("linkedin");
