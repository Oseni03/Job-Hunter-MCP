import { scrapeJobs } from "ts-jobspy";
import type { Job as TsJob, ScrapeMeta, ScrapeOptions, ScrapeResult, SiteMeta, SiteName } from "ts-jobspy";

import type { Adapter, Job, SearchQuery } from "../types.ts";
import { applyQueryAndLimit, cleanText, firstNonEmpty, inferRemote, makeId, parseDate } from "../helpers.ts";

/**
 * ts-jobspy Site client (tickets 01-03: Indeed + LinkedIn with honest meta).
 * The profile-derived country arrives via the query (ticket 03); a blank
 * country falls back to the Indeed default ('usa'). LinkedIn ignores it
 * server-side and searches globally by location.
 */

export const TSJOBSPY_RECENCY_HOURS = 14 * 24;
export const TSJOBSPY_FALLBACK_COUNTRY = "usa";

export type ScrapeRunner = (options: ScrapeOptions) => Promise<ScrapeResult>;

/** Active profile country -> ts-jobspy country with a safe fallback. */
export function resolveSiteCountry(workCountry: string | undefined): string {
	const normalized = workCountry?.trim().toLowerCase() ?? "";
	return normalized || TSJOBSPY_FALLBACK_COUNTRY;
}

/** One Site outcome -> an honest note or error carrying the board's reason. */
export function describeSiteMeta(site: SiteMeta): { note?: string; error?: string } {
	const unsupported =
		site.unsupportedOptions && site.unsupportedOptions.length > 0
			? ` Site ${site.site} ignores unsupported option(s): ${site.unsupportedOptions.join(", ")}.`
			: "";
	if (site.status === "ok") {
		return { note: `Site ${site.site}: ok — ${site.jobs} job(s) in ${site.durationMs}ms.${unsupported}` };
	}
	if (site.status === "empty") {
		return { note: `Site ${site.site}: empty — no matches (never a block).${unsupported}` };
	}
	if (site.status === "partial") {
		return { error: `Site ${site.site}: partial — ${site.jobs} job(s) kept, then interrupted: ${site.error.message}` };
	}
	if (site.status === "error") {
		return { error: `Site ${site.site}: error — ${site.error.message}` };
	}
	return { error: `Site ${site.site}: ${site.status} — unavailable` };
}

/** Whole-scrape meta -> planner notes/errors. Dedupe stays caller-owned upstream. */
export function summarizeScrapeMeta(meta: ScrapeMeta): { notes: string[]; errors: string[] } {
	const notes: string[] = [];
	const errors: string[] = [];
	for (const site of meta.sites) {
		const described = describeSiteMeta(site);
		if (described.note !== undefined) {
			notes.push(described.note);
		} else if (described.error !== undefined) {
			errors.push(described.error);
		}
	}
	if (meta.duplicatesRemoved > 0) {
		notes.push(`${meta.duplicatesRemoved} cross-site duplicate(s) removed by the Site client.`);
	}
	return { notes, errors };
}

/** Plan filters -> ts-jobspy options for one Site. resultsWanted honors the total cap per Site. */
export function buildScrapeOptions(q: SearchQuery, site: SiteName = "indeed", country: string = TSJOBSPY_FALLBACK_COUNTRY): ScrapeOptions {
	const isRemote =
		q.remoteFilter === "remote" || q.remoteOnly ? true : q.remoteFilter === "onsite" ? false : undefined;
	return {
		sites: [site],
		...(q.keywords.trim() ? { searchTerm: q.keywords.trim() } : {}),
		...(q.location?.trim() ? { location: q.location.trim() } : {}),
		...(isRemote !== undefined ? { isRemote } : {}),
		resultsWanted: q.limit && q.limit > 0 ? Math.floor(q.limit) : 15,
		hoursOld: TSJOBSPY_RECENCY_HOURS,
		country,
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
			const result = await runScrape(buildScrapeOptions(q, site, q.country ?? TSJOBSPY_FALLBACK_COUNTRY));
			q.metaSink?.(result.meta);
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
