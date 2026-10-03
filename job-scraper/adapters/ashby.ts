import type { Adapter, Job } from "../types.ts";
import { get } from "../http.ts";
import { applyQueryAndLimit, cleanText, firstNonEmpty, htmlToText, inferRemote, makeId, parseDate } from "../helpers.ts";
import { ashbyBoards, type BoardRef } from "../config/boards.ts";

interface AshbyJob {
  id?: string;
  title?: string;
  jobUrl?: string;
  descriptionPlain?: string;
  publishedAt?: string;
  location?: string;
  employmentType?: string;
  isRemote?: boolean;
}

export interface AshbyAdapterOptions {
  boards?: readonly BoardRef[];
}

/** Pure board-payload mapper (no network): exported for unit tests. */
export function parseAshbyBoard(ref: BoardRef, data: unknown): Job[] {
  const record = (typeof data === "object" && data !== null ? data as Record<string, unknown> : null);
  const jobs = record && Array.isArray(record["jobs"]) ? record["jobs"] as unknown[] : [];
  return jobs.flatMap((raw): Job[] => {
    const item = raw as AshbyJob;
    const url = item.jobUrl;
    if (!url) return [];

    const title = cleanText(item.title) || "Untitled role";
    const location = firstNonEmpty(item.location);
    const description = htmlToText(item.descriptionPlain ?? "");
    const postedAt = parseDate(item.publishedAt);
    const externalId = firstNonEmpty(item.id, url) ?? url;

    return [{
      id: makeId("ashby", `${ref.slug}:${externalId}`),
      source: "ashby",
      title,
      company: ref.company,
      ...(location ? { location } : {}),
      remote: item.isRemote === true || inferRemote(location, title),
      url,
      ...(description ? { description } : {}),
      ...(postedAt ? { postedAt } : {}),
    }];
  });
}

export function createAshbyAdapter(options: AshbyAdapterOptions = {}): Adapter {
  const boards = options.boards ?? ashbyBoards;

  return {
    name: "ashby",
    async search(q) {
      if (boards.length === 0) return [];

      const responses = await Promise.all(
        boards.map(async (ref) => {
          const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(ref.slug)}`;
          return { ref, data: await get<unknown>(url, { json: true }) };
        }),
      );

      const jobs = responses.flatMap(({ ref, data }) => parseAshbyBoard(ref, data));
      return applyQueryAndLimit(jobs, q);
    },
  };
}

export const ashby = createAshbyAdapter();
