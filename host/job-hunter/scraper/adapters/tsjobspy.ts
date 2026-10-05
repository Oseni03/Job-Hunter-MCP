import { scrapeJobs } from "ts-jobspy";
import type { Job as TsJob, ScrapeOptions, ScrapeResult } from "ts-jobspy";

import type { Adapter, Job, SearchQuery } from "../types.ts";
import { applyQueryAndLimit, cleanText, firstNonEmpty, inferRemote, makeId, parseDate } from "../helpers.ts";

/**
 * ts-jobspy Site client (ticket 01 tracer bullet: Indeed only).
 * LinkedIn stays on the legacy guest adapter until ticket 02.
 * Country derivation from the profile lands in ticket 03; until then
 * the Indeed default ('usa') applies so the tracer bullet is explicit.
 */

export const TSJOBSPY_RECENCY_HOURS = 14 * 24;

export type ScrapeRunner = (options: ScrapeOptions) => Promise<ScrapeResult>;

/** Plan filters -> ts-jobspy options. resultsWanted honors the total cap per Site. */
export function buildScrapeOptions(q: SearchQuery): ScrapeOptions {
	const isRemote =
		q.remoteFilter === "remote" || q.remoteOnly ? true : q.remoteFilter === "onsite" ? false : undefined;
	return {
		sites: ["indeed"],
		...(q.keywords.trim() ? { searchTerm: q.keywords.trim() } : {}),
		...(q.location?.trim() ? { location: q.location.trim() } : {}),
		...(isRemote !== undefined ? { isRemote } : {}),
		resultsWanted: q.limit && q.limit > 0 ? Math.floor(q.limit) : 15,
		hoursOld: TSJOBSPY_RECENCY_HOURS,
		country: "usa",
		descriptionFormat: "plain",
		dedupe: "none",
		strict: false,
	};
}

/** ts-jobspy Job -> scraper Job. Null company/date/description fall back honestly. */
export function mapTsJobToScraperJob(tsJob: TsJob): Job {
	const title = cleanText(tsJob.title);
	const company = cleanText(tsJob.company ?? "") || "Unknown company";
	const url = tsJob.jobUrlDirect ?? tsJob.jobUrl;
	const location = firstNonEmpty(tsJob.location);
	const description = firstNonEmpty(tsJob.description);
	const postedAt = parseDate(tsJob.datePosted);
	const externalId = firstNonEmpty(tsJob.id, url) ?? url;
	return {
		id: makeId("indeed", externalId),
		source: "indeed",
		title,
		company,
		...(location ? { location } : {}),
		remote: tsJob.isRemote ?? inferRemote(location, title),
		url,
		...(description ? { description } : {}),
		...(postedAt ? { postedAt } : {}),
	};
}

export function createIndeedAdapter(runScrape: ScrapeRunner = scrapeJobs): Adapter {
	return {
		name: "indeed",
		async search(q) {
			const result = await runScrape(buildScrapeOptions(q));
			const jobs = result.jobs.map(mapTsJobToScraperJob);
			return applyQueryAndLimit(jobs, q);
		},
	};
}

export const indeed = createIndeedAdapter();
