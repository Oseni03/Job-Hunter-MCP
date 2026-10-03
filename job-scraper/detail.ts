import * as cheerio from "cheerio";
import { DETAIL_CACHE_TTL_MS } from "./cache.ts";
import { get } from "./http.ts";
import { cleanText, firstNonEmpty, htmlToText, splitHeadline } from "./helpers.ts";
import { fetchLinkedInDetail, parseLinkedInJobId } from "./adapters/linkedin.ts";
import type { Job, JobDetail } from "./types.ts";

/**
 * Sources whose search results carry only snippets, with a per-source page
 * extractor for the full description. Boards with complete API descriptions
 * (remotive, remoteok, wwr, hn, greenhouse, lever, ashby) need no fetch.
 */
const ENRICHABLE_SOURCES = new Set(["linkedin", "jobberman", "myjobmag"]);

/** Pure extractor (no network): exported for unit tests. */
export function extractDetailText(html: string, source: "jobberman" | "myjobmag" | "page"): string {
	const $ = cheerio.load(html);
	if (source === "myjobmag") {
		const details = $(".job-details").first();
		if (details.length) return htmlToText(details.text());
	}
	if (source === "jobberman") {
		const article = $("article").first();
		if (article.length) return htmlToText(article.text());
	}
	const generic = $("article").first().text() || $("main").first().text() || $("body").text();
	return htmlToText(generic).slice(0, 8000);
}

/** Fetch a job's full description for --enrich. Undefined when not enrichable. */
export async function fetchJobDetailText(job: Job): Promise<string | undefined> {
	if (job.source === "linkedin") {
		const id = parseLinkedInJobId(job.url);
		if (!id) return undefined;
		const detail = await fetchLinkedInDetail(id);
		return detail.description || undefined;
	}
	if (job.source === "jobberman" || job.source === "myjobmag") {
		const html = await get(job.url, { cacheTtlMs: DETAIL_CACHE_TTL_MS });
		const text = extractDetailText(html, job.source);
		return text || undefined;
	}
	return undefined;
}

/** Fetch a standalone job page (detail command for non-LinkedIn URLs). */
export async function fetchPageDetail(url: string): Promise<JobDetail> {
	const html = await get(url, { cacheTtlMs: DETAIL_CACHE_TTL_MS });
	const host = new URL(url).hostname;
	const source = host.includes("myjobmag") ? "myjobmag" : host.includes("jobberman") ? "jobberman" : "page";
	const $ = cheerio.load(html);
	const rawTitle = firstNonEmpty(
		$('meta[property="og:title"]').attr("content"),
		$("h1").first().text(),
		$("title").first().text(),
	) ?? url;
	// Detail headlines carry site suffixes ("Role at Acme | MyJobMag").
	const { title, company: headlineCompany } = splitHeadline(rawTitle.split("|")[0]?.trim() ?? rawTitle);
	const shortHost = host.replace(/^www\./, "");
	return {
		id: `page:${url}`,
		source: source === "page" ? shortHost.split(".")[0] || "page" : source,
		title: cleanText(title),
		company: headlineCompany ?? shortHost,
		url,
		description: extractDetailText(html, source),
	};
}

export function isEnrichable(job: Job): boolean {
	return ENRICHABLE_SOURCES.has(job.source);
}
