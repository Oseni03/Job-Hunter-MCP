import type { Adapter, Job } from "../types.ts";
import { get } from "../http.ts";
import { applyQueryAndLimit, firstNonEmpty, makeId, parseDate, cleanText, htmlToText } from "../helpers.ts";

interface RemotiveJob {
  id?: number | string;
  title?: string;
  company_name?: string;
  candidate_required_location?: string;
  url?: string;
  description?: string;
  publication_date?: string;
  job_type?: string;
  category?: string;
}

interface RemotiveResponse {
  jobs?: RemotiveJob[];
}

export const remotive: Adapter = {
  name: "remotive",
  async search(q) {
    const url = `https://remotive.com/api/remote-jobs?search=${encodeURIComponent(q.keywords)}`;
    const data = await get<RemotiveResponse>(url, { json: true });

    const jobs = (data.jobs ?? []).flatMap((item): Job[] => {
      if (!item.url || !item.title || !item.company_name) return [];
      const externalId = firstNonEmpty(item.id, item.url) ?? item.url;
      const location = firstNonEmpty(item.candidate_required_location);
      const description = htmlToText(item.description ?? "");
      const postedAt = parseDate(item.publication_date);
      return [{
        id: makeId("remotive", externalId),
        source: "remotive",
        title: cleanText(item.title),
        company: cleanText(item.company_name),
        ...(location ? { location } : {}),
        remote: true,
        url: item.url,
        ...(description ? { description } : {}),
        ...(postedAt ? { postedAt } : {}),
      }];
    });

    return applyQueryAndLimit(jobs, q);
  },
};
