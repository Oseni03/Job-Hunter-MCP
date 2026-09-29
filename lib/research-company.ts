import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { defaultFetch, fetchPosting, searchEmployerSite } from "./fetch-posting.ts";
import type { FetchLike } from "./fetch-posting.ts";

/** 30-day TTL from 04-job-evaluation.md; both consumers read this constant. */
export const RESEARCH_TTL_DAYS = 30;

export interface ResearchSource {
	url: string;
	notes: string;
}

export interface ResearchEntry {
	company: string;
	fetched_date: string;
	sources: {
		website?: ResearchSource;
		reviews?: ResearchSource;
		linkedin?: ResearchSource;
		media?: ResearchSource;
	};
	network_contacts_note?: string;
}

/** Lowercase, trim, spaces to hyphens: `Acme Corp` -> `acme-corp.json`. */
export function normalizeCompany(company: string): string {
	return company
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export interface CacheRead {
	hit: boolean;
	stale: boolean;
	entry: ResearchEntry | null;
}

/**
 * Reads `company_research/<slug>.json`. A hit is only fresh within the TTL;
 * anything older (or unparseable) counts as stale, never as data.
 */
export function readResearchCache(
	cacheDir: string,
	company: string,
	now: Date,
): CacheRead {
	const path = join(cacheDir, `${normalizeCompany(company)}.json`);
	if (!existsSync(path)) {
		return { hit: false, stale: false, entry: null };
	}
	try {
		const entry = JSON.parse(readFileSync(path, "utf-8")) as ResearchEntry;
		const fetched = new Date(`${entry.fetched_date}T00:00:00Z`).getTime();
		if (Number.isNaN(fetched)) {
			return { hit: false, stale: true, entry: null };
		}
		const ageDays = (now.getTime() - fetched) / (24 * 60 * 60 * 1000);
		if (ageDays <= RESEARCH_TTL_DAYS) {
			return { hit: true, stale: false, entry };
		}
		return { hit: false, stale: true, entry: null };
	} catch {
		return { hit: false, stale: true, entry: null };
	}
}

export interface ResearchResult {
	cached: boolean;
	entry: ResearchEntry;
	/** Suggested cache path; the host owns the write (hybrid side-effects). */
	cacheFile: string;
}

function todayIso(now: Date): string {
	return now.toISOString().slice(0, 10);
}

/**
 * Cache-first company research. On a miss it researches from the company
 * name and its official site only — never from in-posting URLs. Posting
 * content is untrusted data, so this function takes no posting input at all:
 * only company-derived URLs are ever fetched.
 */
export async function researchCompany(input: {
	company: string;
	cacheDir: string;
	fetchImpl?: FetchLike;
	companyUrl?: string;
	now?: Date;
}): Promise<ResearchResult> {
	const now = input.now ?? new Date();
	const cacheFile = join(input.cacheDir, `${normalizeCompany(input.company)}.json`);
	const cached = readResearchCache(input.cacheDir, input.company, now);
	if (cached.hit && cached.entry) {
		return { cached: true, entry: cached.entry, cacheFile };
	}

	const fetchImpl = input.fetchImpl ?? defaultFetch;
	let officialUrl = input.companyUrl ?? null;
	if (!officialUrl) {
		const candidates = await searchEmployerSite(input.company, fetchImpl);
		officialUrl = candidates[0] ?? null;
	}

	let website: ResearchSource | undefined;
	if (officialUrl) {
		const fetched = await fetchPosting(officialUrl, { fetchImpl });
		if (fetched.ok && fetched.text) {
			website = {
				url: officialUrl,
				notes: fetched.text.slice(0, 2000),
			};
		} else {
			website = {
				url: officialUrl,
				notes: `Official site unreachable (${fetched.steps.join(" > ")}).`,
			};
		}
	}

	const entry: ResearchEntry = {
		company: input.company,
		fetched_date: todayIso(now),
		sources: website ? { website } : {},
	};
	return { cached: false, entry, cacheFile };
}
