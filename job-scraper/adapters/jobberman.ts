import type { Adapter } from "../types.ts";
import { get, sleep } from "../http.ts";
import { applyQueryAndLimit } from "../helpers.ts";
import { extractHtmlJobs, type HtmlAdapterConfig } from "../html.ts";

export const JOBBERMAN_SELECTORS = {
	card: "div.w-full, article, [data-testid*='job'], [class*='job-card'], [class*='listing-card']",
	title: "p.text-lg, h2, h3, [data-testid*='title'], [class*='title']",
	company: "p.text-blue-700, [data-testid*='company'], [class*='company'], [class*='employer']",
	location: "div.flex-wrap span, [data-testid*='location'], [class*='location']",
	description: "p.text-gray-500, [data-testid*='description'], [class*='description'], p",
	postedAt: "time, [datetime], [class*='date'], [class*='posted']",
} as const;

const config: HtmlAdapterConfig = {
	source: "jobberman",
	baseUrl: "https://www.jobberman.com",
	jobLinkSelector: "a[data-cy='listing-title-link'], a[href*='/listings/']",
  selectors: JOBBERMAN_SELECTORS,
  buildSearchUrl: (keywords, location, page) => {
    // Best-effort: the board largely ignores these params and returns latest
    // listings, so matching happens client-side in applyQueryAndLimit.
    const params = new URLSearchParams();
    if (keywords.trim()) params.set("search", keywords.trim());
    if (location?.trim()) params.set("location", location.trim());
    if (page > 1) params.set("page", String(page));
    return `https://www.jobberman.com/jobs?${params.toString()}`;
  },
  maxPages: 5,
};

export const jobberman: Adapter = {
  name: "jobberman",
  async search(q) {
    const out = [];
    for (let page = 1; page <= config.maxPages; page += 1) {
      if (page > 1) await sleep(1_250);
      const html = await get(config.buildSearchUrl(q.keywords, q.location, page));
      const jobs = extractHtmlJobs(html, config);
      if (jobs.length === 0) break;
      out.push(...jobs);
      if (q.limit && out.length >= q.limit) break;
    }
    return applyQueryAndLimit(out, q);
  },
};
