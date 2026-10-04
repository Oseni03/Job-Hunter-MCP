import type { Adapter, Job } from "../types.ts";
import { get } from "../http.ts";
import { applyQueryAndLimit, cleanText, firstNonEmpty, htmlToText, inferRemote, makeId, parseDate } from "../helpers.ts";
import { leverBoards, type BoardRef } from "../config/boards.ts";

interface LeverPosting {
  id?: string;
  text?: string;
  hostedUrl?: string;
  descriptionPlain?: string;
  descriptionBodyPlain?: string;
  createdAt?: string | number;
  categories?: {
    location?: string;
    commitment?: string;
    team?: string;
    department?: string;
  };
}

export interface LeverAdapterOptions {
  boards?: readonly BoardRef[];
}

/** Pure board-payload mapper (no network): exported for unit tests. */
export function parseLeverBoard(ref: BoardRef, data: unknown): Job[] {
  const list = Array.isArray(data) ? data : [];
  return list.flatMap((raw): Job[] => {
    const item = raw as LeverPosting;
    const url = item.hostedUrl;
    if (!url) return [];

    const title = cleanText(item.text) || "Untitled role";
    const location = firstNonEmpty(item.categories?.location);
    const description = htmlToText(firstNonEmpty(item.descriptionPlain, item.descriptionBodyPlain) ?? "");
    const postedAt = parseDate(item.createdAt);
    const externalId = firstNonEmpty(item.id, url) ?? url;

    return [{
      id: makeId("lever", `${ref.slug}:${externalId}`),
      source: "lever",
      title,
      company: ref.company,
      ...(location ? { location } : {}),
      remote: inferRemote(location, item.categories?.commitment, title),
      url,
      ...(description ? { description } : {}),
      ...(postedAt ? { postedAt } : {}),
    }];
  });
}

export function createLeverAdapter(options: LeverAdapterOptions = {}): Adapter {
  const boards = options.boards ?? leverBoards;

  return {
    name: "lever",
    async search(q) {
      if (boards.length === 0) return [];

      const responses = await Promise.all(
        boards.map(async (ref) => {
          const url = `https://api.lever.co/v0/postings/${encodeURIComponent(ref.slug)}?mode=json`;
          return { ref, data: await get<unknown>(url, { json: true }) };
        }),
      );

      const jobs = responses.flatMap(({ ref, data }) => parseLeverBoard(ref, data));
      return applyQueryAndLimit(jobs, q);
    },
  };
}

export const lever = createLeverAdapter();
