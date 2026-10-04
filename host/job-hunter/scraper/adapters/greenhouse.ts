import type { Adapter, Job } from "../types.ts";
import { get } from "../http.ts";
import { applyQueryAndLimit, cleanText, decodeEntitiesTwice, firstNonEmpty, htmlToText, inferRemote, makeId, parseDate } from "../helpers.ts";
import { greenhouseBoardTokens } from "../config/boards.ts";

interface GreenhouseJob {
  id?: number;
  absolute_url?: string;
  internal_job_id?: number | string | null;
  title?: string;
  company_name?: string;
  first_published?: string;
  updated_at?: string;
  location?: { name?: string };
  content?: string;
  departments?: Array<{ name?: string }>;
  offices?: Array<{ name?: string; location?: string }>;
}

interface GreenhouseResponse {
  jobs?: GreenhouseJob[];
}

export interface GreenhouseAdapterOptions {
  boardTokens?: readonly string[];
}

function prettifyToken(boardToken: string): string {
  return boardToken.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Pure board-payload mapper (no network): exported for unit tests. */
export function parseGreenhouseBoard(boardToken: string, data: GreenhouseResponse): Job[] {
  return (data.jobs ?? []).flatMap((item): Job[] => {
    const title = cleanText(item.title);
    const url = item.absolute_url;
    if (!title || !url) return [];

    const location = firstNonEmpty(
      item.location?.name,
      item.offices?.map((office) => office.name || office.location).filter(Boolean).join(", "),
    );
    // Content arrives double entity-encoded: decode twice, then strip.
    const rawContent = cleanText(item.content ? decodeEntitiesTwice(item.content) : "");
    const description = htmlToText(rawContent).slice(0, 2000);
    const company = cleanText(item.company_name) || prettifyToken(boardToken);
    const externalId = firstNonEmpty(item.id, item.internal_job_id, url) ?? url;
    const postedAt = parseDate(item.first_published) ?? parseDate(item.updated_at);

    return [{
      id: makeId("greenhouse", `${boardToken}:${externalId}`),
      source: "greenhouse",
      title,
      company,
      ...(location ? { location } : {}),
      remote: inferRemote(location, description),
      url,
      ...(description ? { description } : {}),
      ...(postedAt ? { postedAt } : {}),
    }];
  });
}

export function createGreenhouseAdapter(options: GreenhouseAdapterOptions = {}): Adapter {
  const boardTokens = options.boardTokens ?? greenhouseBoardTokens;

  return {
    name: "greenhouse",
    async search(q) {
      if (boardTokens.length === 0) return [];

      const responses = await Promise.all(
        boardTokens.map(async (boardToken) => {
          const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs?content=true`;
          return { boardToken, data: await get<GreenhouseResponse>(url, { json: true }) };
        }),
      );

      const jobs = responses.flatMap(({ boardToken, data }) => parseGreenhouseBoard(boardToken, data));

      return applyQueryAndLimit(jobs, q);
    },
  };
}

export const greenhouse = createGreenhouseAdapter();
