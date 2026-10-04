import type { Adapter, Job } from "../types.ts";
import { get } from "../http.ts";
import { applyQueryAndLimit, cleanText, firstNonEmpty, makeId, parseDate, htmlToText } from "../helpers.ts";

interface RemoteOkJob {
  id?: number | string;
  slug?: string;
  position?: string;
  company?: string;
  location?: string;
  description?: string;
  url?: string;
  date?: string;
  tags?: string[];
  apply_url?: string;
  epoch?: number;
}

export const remoteok: Adapter = {
	name: "remoteok",
	async search(q) {
		// RemoteOK has no server-side keyword filter: ?tags=<kw> returns zero
		// jobs and unknown params are ignored (full dump returned). Fetch the
		// whole board and filter client-side via applyQueryAndLimit. The 12
		// minute http.ts cache keeps repeated searches cheap.
		const data = await get<unknown>("https://remoteok.com/api", { json: true });
    if (!Array.isArray(data)) return [];

    // Remote OK's first array element is a legal/attribution notice, not a job.
    const jobs = data.slice(1).flatMap((raw): Job[] => {
      const item = raw as RemoteOkJob;
      const title = cleanText(item.position);
      const company = cleanText(item.company);
      const href = firstNonEmpty(item.url, item.apply_url, item.slug ? `https://remoteok.com/remote-jobs/${item.slug}` : undefined);
      if (!title || !company || !href) return [];

      const location = firstNonEmpty(item.location);
      const description = htmlToText(item.description ?? "");
      const postedAt = parseDate(item.date) ?? parseDate(item.epoch);
      const remote = true;
      const externalId = firstNonEmpty(item.id, item.slug, href) ?? href;

      return [{
        id: makeId("remoteok", externalId),
        source: "remoteok",
        title,
        company,
        ...(location ? { location } : {}),
        remote,
        url: href,
        ...(description ? { description } : {}),
        ...(postedAt ? { postedAt } : {}),
      }];
    });

    return applyQueryAndLimit(jobs, q);
  },
};
